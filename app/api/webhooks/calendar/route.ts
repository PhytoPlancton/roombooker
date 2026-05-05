import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { syncSince } from "@/lib/calendar";
import { findUserByWatchChannelId, updateWatchSyncToken, type UserDoc } from "@/lib/users";
import { shouldBookRoom } from "@/lib/booking-rules";
import { createPendingBooking, findBookingByICalUID } from "@/lib/bookings";
import { activateWatchForUser } from "@/lib/watch";
import { processBookingForEvent } from "@/lib/booking-engine";

export async function POST(req: NextRequest) {
  // 1. Verify Google's signature
  const channelId = req.headers.get("x-goog-channel-id");
  const channelToken = req.headers.get("x-goog-channel-token");
  const resourceState = req.headers.get("x-goog-resource-state");

  const expectedToken = process.env.GOOGLE_WEBHOOK_TOKEN;
  if (!expectedToken || channelToken !== expectedToken) {
    console.warn("Webhook rejected: invalid token", { channelId });
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  if (!channelId) {
    return NextResponse.json({ error: "missing_channel_id" }, { status: 400 });
  }

  // sync = initial handshake from Google when watch is created — nothing to do
  if (resourceState === "sync") {
    return new NextResponse(null, { status: 200 });
  }

  const user = await findUserByWatchChannelId(channelId);
  if (!user) {
    console.warn("Webhook rejected: unknown channel", { channelId });
    return NextResponse.json({ error: "unknown_channel" }, { status: 404 });
  }

  // Ack immediately, process asynchronously to keep response time < 30s
  void processChange(user).catch((err) => {
    console.error("Calendar processChange failed", { userId: user._id.toString(), err });
  });

  return new NextResponse(null, { status: 200 });
}

async function processChange(user: UserDoc): Promise<void> {
  if (!user.watchSyncToken) {
    console.warn("User has no syncToken, re-initializing watch", { userId: user._id.toString() });
    await activateWatchForUser(user._id);
    return;
  }

  const result = await syncSince({ user, syncToken: user.watchSyncToken });

  if ("needsFullResync" in result) {
    console.warn("syncToken expired, re-initializing watch", { userId: user._id.toString() });
    await activateWatchForUser(user._id);
    return;
  }

  await updateWatchSyncToken(user._id, result.newSyncToken);

  const internalDomain = process.env.INTERNAL_EMAIL_DOMAIN || "muchbetter.ai";

  for (const event of result.changedEvents) {
    if (!event.iCalUID) continue;

    const decision = shouldBookRoom(event, {
      userEmail: user.email,
      internalDomain,
    });

    if (!decision.shouldBook) {
      // TODO: handle cancellation — release Skedda booking if event is cancelled
      console.log("Skip event", {
        iCalUID: event.iCalUID,
        reason: decision.reason,
        title: event.summary,
      });
      continue;
    }

    // Dedup across multiple sales receiving the same event
    const existing = await findBookingByICalUID(event.iCalUID);
    if (existing) {
      console.log("Booking already exists for iCalUID, skip", { iCalUID: event.iCalUID });
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

    console.log("Booking created (pending)", {
      iCalUID: event.iCalUID,
      userId: user._id.toString(),
      bookingId: booking._id.toString(),
      title: booking.meeting.title,
      startsAt: booking.meeting.startsAt.toISOString(),
    });

    // Hand off to Skedda booker (fire-and-forget)
    void processBookingForEvent({
      iCalUID: event.iCalUID,
      googleEventId: event.id!,
      userId: new ObjectId(user._id),
      meeting: booking.meeting,
    }).catch((err) => {
      console.error("[engine] processBookingForEvent failed", {
        iCalUID: event.iCalUID,
        err,
      });
    });
  }
}
