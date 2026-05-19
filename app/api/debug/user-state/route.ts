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
  const raw = await db.collection("users").findOne({ email });
  if (!raw) {
    return NextResponse.json({ error: "user_not_found", email }, { status: 404 });
  }
  // Cast once through unknown — Mongo's WithId<Document> doesn't overlap with
  // our domain shape and TS strict mode refuses the direct widening.
  const u = raw as unknown as {
    _id: object;
    email: string;
    firstName: string;
    lastName: string;
    telephone: string | null;
    googleTokens?: unknown;
    watchChannelId?: string;
    watchResourceId?: string;
    watchExpiry?: Date;
    watchSyncToken?: string;
    bookingRules?: unknown;
    notifPrefs?: unknown;
    roomLocationMode?: string;
    skeddaTitleMode?: string;
    roomPriority?: string[];
    createdAt: Date;
    updatedAt: Date;
  };

  const now = new Date();
  const watchActive =
    !!u.watchChannelId &&
    !!u.watchExpiry &&
    new Date(u.watchExpiry).getTime() > now.getTime();

  const recentBookings = await db
    .collection("bookings")
    .find({ userId: u._id })
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
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    telephone: u.telephone,
    googleTokensPresent: !!u.googleTokens,
    watch: {
      active: watchActive,
      channelId: u.watchChannelId || null,
      resourceId: u.watchResourceId || null,
      expiry: u.watchExpiry || null,
      hasSyncToken: !!u.watchSyncToken,
    },
    bookingRules: u.bookingRules ?? null,
    notifPrefs: u.notifPrefs ?? null,
    roomLocationMode: u.roomLocationMode ?? "(default)",
    skeddaTitleMode: u.skeddaTitleMode ?? "(default)",
    roomPriority: u.roomPriority ?? null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    recentBookings,
  });
}
