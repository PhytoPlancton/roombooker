/**
 * Admin debug — dump the full state of a single user (rules, prefs, watch
 * status, recent bookings) to diagnose why their auto-booking doesn't fire.
 *
 * Usage:
 *   curl "https://roombooker.nmt.ovh/api/debug/user-state?secret=$TOKEN&email=isaure.chaillou@muchbetter.ai" | jq
 *
 * Same token-guard as /api/debug/audit (GOOGLE_WEBHOOK_TOKEN).
 */

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const expected = process.env.GOOGLE_WEBHOOK_TOKEN;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const email = searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  const db = await getDb();
  const user = await db.collection("users").findOne({ email });
  if (!user) {
    return NextResponse.json({ error: "user_not_found", email }, { status: 404 });
  }

  const now = new Date();
  const watchActive =
    !!(user as { watchChannelId?: string }).watchChannelId &&
    !!(user as { watchExpiry?: Date }).watchExpiry &&
    new Date((user as { watchExpiry: Date }).watchExpiry).getTime() > now.getTime();

  const recentBookings = await db
    .collection("bookings")
    .find({ userId: user._id })
    .sort({ "meeting.startsAt": -1 })
    .limit(5)
    .project({
      iCalUID: 1,
      "meeting.title": 1,
      "meeting.startsAt": 1,
      status: 1,
      failureReason: 1,
      room: 1,
      createdAt: 1,
    })
    .toArray();

  return NextResponse.json({
    email: (user as { email: string }).email,
    firstName: (user as { firstName: string }).firstName,
    lastName: (user as { lastName: string }).lastName,
    telephone: (user as { telephone: string | null }).telephone,
    googleTokensPresent: !!(user as { googleTokens?: unknown }).googleTokens,
    watch: {
      active: watchActive,
      channelId: (user as { watchChannelId?: string }).watchChannelId || null,
      resourceId: (user as { watchResourceId?: string }).watchResourceId || null,
      expiry: (user as { watchExpiry?: Date }).watchExpiry || null,
      hasSyncToken: !!(user as { watchSyncToken?: string }).watchSyncToken,
    },
    bookingRules: (user as { bookingRules?: unknown }).bookingRules ?? null,
    notifPrefs: (user as { notifPrefs?: unknown }).notifPrefs ?? null,
    roomLocationMode: (user as { roomLocationMode?: string }).roomLocationMode ?? "(default)",
    skeddaTitleMode: (user as { skeddaTitleMode?: string }).skeddaTitleMode ?? "(default)",
    roomPriority: (user as { roomPriority?: string[] }).roomPriority ?? null,
    createdAt: (user as { createdAt: Date }).createdAt,
    updatedAt: (user as { updatedAt: Date }).updatedAt,
    recentBookings,
  });
}
