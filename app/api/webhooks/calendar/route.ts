import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { syncSince } from "@/lib/calendar";
import { findUserByWatchChannelId, updateWatchSyncToken, type UserDoc } from "@/lib/users";
import { shouldBookRoom } from "@/lib/booking-rules";
import { createPendingBooking, findBookingByICalUID, deleteBookingByICalUID, markBookingResult } from "@/lib/bookings";
import { notifyUser } from "@/lib/notify";
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
      // Snapshot the booking BEFORE releasing — releaseBookingByICalUIDAuto will
      // mark it cancelled and we want to recap the room/time in the SMS.
      const priorBooking = await findBookingByICalUID(event.iCalUID);
      const release = await releaseBookingByICalUIDAuto(event.iCalUID);
      // Mark the booking as cancelled regardless of what the Skedda release
      // returned. The user cancelled the meeting in Google Calendar — that's
      // the source of truth. Without this, a previously-failed booking would
      // stay visible as "Erreur" in the dashboard even though the meeting no
      // longer exists. doRelease() only marks "cancelled" when the prior
      // status was exactly "booked", so we cover the failed/pending cases here.
      if (release.reason !== "not_found") {
        await markBookingResult({ iCalUID: event.iCalUID, status: "cancelled" });
      }
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
      // Confirm to the user via their booking_success channels — we only fire
      // when we actually released a real Skedda booking (release.ok). For
      // failed/pending bookings there was nothing to release on Skedda, so
      // sending an SMS would be misleading.
      if (release.ok && priorBooking && priorBooking.room) {
        const time = priorBooking.meeting.startsAt.toLocaleString("fr-FR", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Paris",
        });
        await notifyUser({
          user: {
            _id: user._id,
            email: user.email,
            firstName: user.firstName,
            telephone: user.telephone,
            notifPrefs: user.notifPrefs,
          },
          type: "booking_success",
          iCalUID: event.iCalUID,
          smsText: `RoomBooker: salle ${priorBooking.room} pour ${time} annulee (meeting supprime dans Calendar).`,
          emailSubject: `Salle ${priorBooking.room} libérée — ${time}`,
          emailHtml: `
            <p>Bonjour ${user.firstName},</p>
            <p>Tu as supprimé ton meeting dans Google Calendar — la salle <strong>${priorBooking.room}</strong> est libérée sur Skedda.</p>
            <p>🕐 ${time}</p>
          `,
        });
      }
      continue;
    }

    const decision = shouldBookRoom(event, {
      userEmail: user.email,
      internalDomain,
      rules: user.bookingRules,
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
        // Meeting moved → release old, then re-book at the new date.
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
        // Force the re-booking flow regardless of decision.shouldBook.
        // shouldBookRoom would say "location_already_set" because the Calendar
        // event still carries the old room name in its location field — but
        // we want to re-book anyway (we just released the old slot).
        await startBookingFlow(user, event);
        continue;
      } else if (!decision.shouldBook && decision.reason === "location_already_set") {
        // CRITICAL: when we successfully book a room, we update the Calendar
        // event's location field with the room name. Google then immediately
        // pushes a webhook for that change, and our shouldBookRoom() returns
        // "location_already_set" because the location is now non-empty.
        //
        // We must NOT release the booking in that case — it's our own write.
        // Only release if the user manually set a different location (i.e., the
        // current location string is not the room we booked).
        const ourRoom = (existing.room || "").trim().toLowerCase();
        const eventLoc = (event.location || "").trim().toLowerCase();
        if (eventLoc && eventLoc === ourRoom) {
          await audit({
            action: "event_evaluated",
            userId: user._id,
            iCalUID: event.iCalUID,
            details: { skip: "self_location_write", room: existing.room },
          });
          continue;
        }
        // Otherwise: user manually changed location → release.
        await releaseBookingByICalUIDAuto(event.iCalUID);
        await audit({
          action: "event_evaluated",
          userId: user._id,
          iCalUID: event.iCalUID,
          details: { decision: "release", reason: "user_changed_location", was: existing.room, now: event.location },
        });
        continue;
      } else if (!decision.shouldBook && decision.reason === "no_rule_matched") {
        // Same date but rules no longer match (e.g. last external attendee
        // was removed) → release the room.
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

    await startBookingFlow(user, event);
  }
}

/** Persist a pending booking and kick off the Skedda booking engine. */
async function startBookingFlow(
  user: UserDoc,
  event: import("googleapis").calendar_v3.Schema$Event,
): Promise<void> {
  if (!event.iCalUID || !event.start?.dateTime || !event.end?.dateTime || !event.id) return;

  const startsAt = new Date(event.start.dateTime);
  const endsAt = new Date(event.end.dateTime);
  const attendees = (event.attendees ?? [])
    .map((a) => a.email)
    .filter((e): e is string => typeof e === "string");

  const booking = await createPendingBooking({
    iCalUID: event.iCalUID,
    googleEventId: event.id,
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
    googleEventId: event.id,
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
