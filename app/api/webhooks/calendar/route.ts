import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { syncSince } from "@/lib/calendar";
import { findUserByWatchChannelId, updateWatchSyncToken, type UserDoc } from "@/lib/users";
import { shouldBookRoom } from "@/lib/booking-rules";
import { createPendingBooking, findBookingByICalUID, deleteBookingByICalUID } from "@/lib/bookings";
import { activateWatchForUser } from "@/lib/watch";
import { processBookingForEvent } from "@/lib/booking-engine";
import { audit } from "@/lib/audit";
import { releaseBookingByICalUIDAuto } from "@/lib/release-booking";

export async function POST(req: NextRequest) {
  const channelId = req.headers.get("x-goog-channel-id");
  const channelToken = req.headers.get("x-goog-channel-token");
  const resourceState = req.headers.get("x-goog-resource-state");
  const messageNumber = req.headers.get("x-goog-message-number");

  await audit({
    action: "webhook_received",
    details: { channelId, resourceState, messageNumber, hasToken: !!channelToken },
  });

  const expectedToken = process.env.GOOGLE_WEBHOOK_TOKEN;
  if (!expectedToken || channelToken !== expectedToken) {
    await audit({
      action: "webhook_rejected_invalid_token",
      details: { channelId, gotTokenLen: channelToken?.length || 0 },
    });
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  if (!channelId) {
    return NextResponse.json({ error: "missing_channel_id" }, { status: 400 });
  }

  if (resourceState === "sync") {
    await audit({ action: "webhook_sync_handshake", details: { channelId } });
    return new NextResponse(null, { status: 200 });
  }

  const user = await findUserByWatchChannelId(channelId);
  if (!user) {
    await audit({
      action: "webhook_unknown_channel",
      details: { channelId },
    });
    return NextResponse.json({ error: "unknown_channel" }, { status: 404 });
  }

  // Ack immediately, process asynchronously to keep response time < 30s
  void processChange(user).catch((err) => {
    audit({
      action: "error",
      userId: user._id,
      details: { where: "processChange", message: String(err) },
    });
  });

  return new NextResponse(null, { status: 200 });
}

async function processChange(user: UserDoc): Promise<void> {
  await audit({
    action: "sync_started",
    userId: user._id,
    details: { syncTokenLen: user.watchSyncToken?.length || 0 },
  });

  if (!user.watchSyncToken) {
    await audit({
      action: "sync_needs_resync",
      userId: user._id,
      details: { reason: "no_sync_token" },
    });
    await activateWatchForUser(user._id, { source: "calendar_resync" });
    return;
  }

  const result = await syncSince({ user, syncToken: user.watchSyncToken });

  if ("needsFullResync" in result) {
    await audit({
      action: "sync_needs_resync",
      userId: user._id,
      details: { reason: "syncToken_expired" },
    });
    await activateWatchForUser(user._id, { source: "calendar_resync" });
    return;
  }

  await updateWatchSyncToken(user._id, result.newSyncToken);
  await audit({
    action: "sync_completed",
    userId: user._id,
    details: { eventsCount: result.changedEvents.length },
  });

  const internalDomain = process.env.INTERNAL_EMAIL_DOMAIN || "muchbetter.ai";

  for (const event of result.changedEvents) {
    if (!event.iCalUID) {
      await audit({
        action: "event_evaluated",
        userId: user._id,
        details: { skip: "no_iCalUID", title: event.summary },
      });
      continue;
    }

    // If the meeting was cancelled in Google Calendar, release the Skedda room.
    if (event.status === "cancelled") {
      const release = await releaseBookingByICalUIDAuto(event.iCalUID);
      await audit({
        action: "event_evaluated",
        userId: user._id,
        iCalUID: event.iCalUID,
        details: {
          decision: "cancel",
          source: "calendar_cancelled",
          released: release.ok,
          releaseReason: release.reason,
        },
      });
      continue;
    }

    const decision = shouldBookRoom(event, {
      userEmail: user.email,
      internalDomain,
    });

    await audit({
      action: "event_evaluated",
      userId: user._id,
      iCalUID: event.iCalUID,
      details: {
        title: event.summary || null,
        decision: decision.shouldBook ? "book" : "skip",
        reason: decision.reason,
        organizer: event.organizer?.email || null,
        attendees: (event.attendees ?? []).map((a) => a.email).filter(Boolean),
        recurring: !!event.recurringEventId,
        location: event.location || null,
        status: event.status,
        start: event.start?.dateTime || null,
        end: event.end?.dateTime || null,
      },
    });

    const existing = await findBookingByICalUID(event.iCalUID);

    // Existing booking + already booked on Skedda — handle reschedule / conditions broken.
    if (existing && existing.status === "booked") {
      const newStartMs = event.start?.dateTime ? new Date(event.start.dateTime).getTime() : null;
      const oldStartMs = existing.meeting.startsAt.getTime();
      const dateChanged = newStartMs !== null && newStartMs !== oldStartMs;

      if (dateChanged) {
        // Meeting moved → release old, then fall through to re-book at the new date.
        await releaseBookingByICalUIDAuto(event.iCalUID);
        await deleteBookingByICalUID(event.iCalUID);
        await audit({
          action: "event_evaluated",
          userId: user._id,
          iCalUID: event.iCalUID,
          details: {
            decision: "reschedule",
            oldStart: existing.meeting.startsAt.toISOString(),
            newStart: new Date(newStartMs!).toISOString(),
          },
        });
        // fall through to the create-booking flow below
      } else if (
        !decision.shouldBook &&
        (decision.reason === "no_external_attendee" || decision.reason === "location_already_set")
      ) {
        // Same date but conditions broke (last external attendee removed,
        // or sales filled location manually) → release the room.
        await releaseBookingByICalUIDAuto(event.iCalUID);
        await audit({
          action: "event_evaluated",
          userId: user._id,
          iCalUID: event.iCalUID,
          details: { decision: "release", reason: decision.reason },
        });
        continue;
      } else {
        // Same date, still bookable → nothing to do (already booked).
        await audit({
          action: "event_evaluated",
          userId: user._id,
          iCalUID: event.iCalUID,
          details: { skip: "already_booked", existingStatus: existing.status },
        });
        continue;
      }
    }

    if (!decision.shouldBook) continue;

    if (existing && existing.status !== "booked") {
      await audit({
        action: "event_evaluated",
        userId: user._id,
        iCalUID: event.iCalUID,
        details: { skip: "already_in_db", existingStatus: existing.status },
      });
      continue;
    }

    const startsAt = new Date(event.start!.dateTime!);
    const endsAt = new Date(event.end!.dateTime!);
    const attendees = (event.attendees ?? [])
      .map((a) => a.email)
      .filter((e): e is string => typeof e === "string");

    const booking = await createPendingBooking({
      iCalUID: event.iCalUID,
      googleEventId: event.id!,
      userId: new ObjectId(user._id),
      meeting: {
        title: event.summary || "(sans titre)",
        startsAt,
        endsAt,
        attendees,
      },
    });

    await audit({
      action: "booking_created_pending",
      userId: user._id,
      iCalUID: event.iCalUID,
      details: {
        bookingId: booking._id.toString(),
        title: booking.meeting.title,
        startsAt: startsAt.toISOString(),
      },
    });

    void processBookingForEvent({
      iCalUID: event.iCalUID,
      googleEventId: event.id!,
      userId: new ObjectId(user._id),
      meeting: booking.meeting,
    }).catch((err) => {
      audit({
        action: "error",
        userId: user._id,
        iCalUID: event.iCalUID,
        details: { where: "processBookingForEvent", message: String(err) },
      });
    });
  }
}
