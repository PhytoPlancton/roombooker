/**
 * One-shot migration: force every existing user's notifPrefs to the new
 * WhatsApp-first defaults for the 3 routine notification types (booked,
 * cancelled, deferred). The other 2 types (booking_failure, watch_resync)
 * keep whatever the user had configured, falling back to DEFAULT.
 *
 * Idempotent — running it twice produces the same result. Token-guarded
 * the same way as /api/debug/audit.
 *
 * Usage:
 *   curl -X POST "https://roombooker.nmt.ovh/api/debug/migrate-notif-prefs?secret=$GOOGLE_WEBHOOK_TOKEN"
 */

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { DEFAULT_NOTIF_PREFS, type ChannelPrefs, type NotifPrefs } from "@/lib/users";

const WHATSAPP_ONLY: ChannelPrefs = { sms: false, email: false, whatsapp: true };

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const expected = process.env.GOOGLE_WEBHOOK_TOKEN;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const users = await db.collection("users").find({}).toArray();
  let updated = 0;
  const report: Array<{ email: string; from: Partial<NotifPrefs>; to: NotifPrefs }> = [];

  for (const u of users as Array<{ _id: unknown; email: string; notifPrefs?: Partial<NotifPrefs> }>) {
    const existing = u.notifPrefs ?? {};
    const next: NotifPrefs = {
      booking_success: { ...WHATSAPP_ONLY },
      booking_cancelled: { ...WHATSAPP_ONLY },
      booking_deferred: { ...WHATSAPP_ONLY },
      booking_failure: {
        ...DEFAULT_NOTIF_PREFS.booking_failure,
        ...(existing.booking_failure ?? {}),
      },
      watch_resync: {
        ...DEFAULT_NOTIF_PREFS.watch_resync,
        ...(existing.watch_resync ?? {}),
      },
    };
    await db
      .collection("users")
      .updateOne(
        { _id: u._id as object },
        { $set: { notifPrefs: next, updatedAt: new Date() } },
      );
    report.push({ email: u.email, from: existing, to: next });
    updated++;
  }

  return NextResponse.json({ ok: true, updated, report });
}
