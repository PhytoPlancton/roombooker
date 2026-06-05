import { getDb } from "./db";

export interface UserStat {
  userId: string;
  name: string;
  email: string;
  /** Bookings actually confirmed on Skedda (status="booked"). */
  bookings: number;
  /** ALL bookings ever attempted for this user — including failed, cancelled,
   *  pending. Gives a sense of "potential reservations" vs. confirmed. */
  bookingsAttempted: number;
  /** SMS notifications successfully delivered for this user. */
  smsCount: number;
  minutesSaved: number;
  watchActive: boolean;
  /** Last time we confirmed a booking on Skedda (status="booked"). */
  lastBookingAt: Date | null;
  /** Last time this user opened the web app (OAuth signin). */
  lastSigninAt: Date | null;
  /** Last time ANYTHING happened for this user — meeting evaluated, watch
   *  renewed, manual cancel, etc. Captures both web sessions and the
   *  webhook-driven background activity that doesn't require a login. */
  lastActivityAt: Date | null;
}

export type ActivityKind = "booking" | "error" | "notify" | "watch";

export interface ActivityItem {
  ts: Date;
  kind: ActivityKind;
  who: string;          // user firstName or email
  text: string;         // plain-text description, ready to render
}

export interface AdminStats {
  // Hero
  minutesSaved: number;          // total minutes of admin work saved across all users
  bookingsBooked: number;        // count of successful bookings ever
  // Activity
  smsSent: number;               // count of audit notify_sent + channel=sms
  emailsSent: number;            // count of audit notify_sent + channel=email
  // Health
  activeConnections: number;     // users with active watch
  totalUsers: number;            // users registered
  errors: number;                // bookings failed + audit error
  // Last 7 days slice
  bookingsLast7d: number;
  errorsLast7d: number;
  // Skedda usage — proxy for hitting venue quotas. We can't query Skedda
  // for "credits remaining" (we use guest bookings, no account context),
  // so we count what WE've done and watch for quota_exceeded errors as
  // the canary. See `quotaExceededLast7d` for the explicit refusal count.
  bookingsLast24h: number;
  bookingsLast30d: number;
  quotaExceededLast7d: number;
  // Per-user
  users: UserStat[];
  // Recent activity
  lastActivity: Date | null;
  recentActivity: ActivityItem[];
}

const MINUTES_SAVED_PER_BOOKING = 3; // assumption: ~3 min of manual Skedda work per booking

export async function getAdminStats(): Promise<AdminStats> {
  const db = await getDb();
  const usersCol = db.collection("users");
  const bookingsCol = db.collection("bookings");
  const auditCol = db.collection("auditLog");

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);
  const twentyFourHoursAgo = new Date(Date.now() - 86400_000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);

  const [
    bookingsBooked,
    bookingsFailed,
    smsSent,
    emailsSent,
    auditErrors,
    bookingsLast24h,
    bookingsLast7d,
    bookingsLast30d,
    errorsLast7d,
    quotaExceededLast7d,
    activeConnections,
    totalUsers,
    perUserBookings,
    allUsers,
    lastBookingDoc,
  ] = await Promise.all([
    bookingsCol.countDocuments({ status: "booked" }),
    bookingsCol.countDocuments({ status: "failed" }),
    auditCol.countDocuments({ action: "notify_sent", "details.channel": "sms", "details.success": true }),
    auditCol.countDocuments({ action: "notify_sent", "details.channel": "email", "details.success": true }),
    auditCol.countDocuments({ action: "error" }),
    // Skedda-usage proxies. We count successful bookings by `updatedAt`
    // (= moment Skedda confirmed) rather than `createdAt` (= moment we
    // received the meeting from the webhook, often days earlier).
    bookingsCol.countDocuments({ status: "booked", updatedAt: { $gte: twentyFourHoursAgo } }),
    bookingsCol.countDocuments({ status: "booked", updatedAt: { $gte: sevenDaysAgo } }),
    bookingsCol.countDocuments({ status: "booked", updatedAt: { $gte: thirtyDaysAgo } }),
    bookingsCol.countDocuments({ status: "failed", createdAt: { $gte: sevenDaysAgo } }),
    // Canary for "we're hitting Skedda's quota". The classifier sets
    // reason="quota_exceeded" when Skedda returns a credit/quota/limit
    // refusal. If this spikes, we know to slow down or switch to a
    // different name variant / IP / etc.
    auditCol.countDocuments({
      action: "skedda_failure",
      "details.reason": "quota_exceeded",
      ts: { $gte: sevenDaysAgo },
    }),
    usersCol.countDocuments({ watchExpiry: { $gt: new Date() } }),
    usersCol.countDocuments({}),
    bookingsCol.aggregate([
      { $match: { status: "booked" } },
      { $group: { _id: "$userId", count: { $sum: 1 } } },
    ]).toArray(),
    usersCol.find({}, { projection: { firstName: 1, lastName: 1, email: 1, watchExpiry: 1 } }).toArray(),
    // `updatedAt` is the time the doc transitioned to "booked" (i.e. when
    // the Skedda reservation actually went through). `createdAt` would be
    // when we first received the meeting from the webhook, which can be
    // days earlier if the user scheduled the meeting in advance — that's
    // what made the "Dernière" column look stale.
    bookingsCol.find({ status: "booked" }).sort({ updatedAt: -1 }).limit(1).toArray(),
  ]);

  const minutesSaved = bookingsBooked * MINUTES_SAVED_PER_BOOKING;

  const bookingsByUser = new Map<string, number>();
  for (const r of perUserBookings as Array<{ _id: unknown; count: number }>) {
    bookingsByUser.set(String(r._id), r.count);
  }

  // Per-user "last booking" lookup. Uses `updatedAt` (= the moment Skedda
  // confirmed the reservation), not `createdAt` (= the moment the meeting
  // was first received from the webhook, often days earlier).
  const [
    lastBookingByUser,
    attemptedByUser,
    smsByUser,
    lastSigninByUser,
    lastActivityByUser,
  ] = await Promise.all([
    bookingsCol.aggregate([
      { $match: { status: "booked" } },
      { $sort: { updatedAt: -1 } },
      { $group: { _id: "$userId", last: { $first: "$updatedAt" } } },
    ]).toArray() as unknown as Promise<Array<{ _id: unknown; last: Date }>>,
    // Total bookings ever attempted (any status). Lets the dashboard show
    // "X / Y" where X=confirmed and Y=attempted — surfaces hidden failures.
    bookingsCol.aggregate([
      { $group: { _id: "$userId", count: { $sum: 1 } } },
    ]).toArray() as unknown as Promise<Array<{ _id: unknown; count: number }>>,
    // SMS delivered per user. We filter on successful sends only so the
    // count matches "what actually reached the user's phone".
    auditCol.aggregate([
      {
        $match: {
          action: "notify_sent",
          "details.channel": "sms",
          "details.success": true,
        },
      },
      { $group: { _id: "$userId", count: { $sum: 1 } } },
    ]).toArray() as unknown as Promise<Array<{ _id: unknown; count: number }>>,
    // Last login per user from the audit log (we started writing
    // user_signed_in to audit in v0.11.3 — earlier users will show null
    // until they sign in again).
    auditCol.aggregate([
      { $match: { action: "user_signed_in" } },
      { $sort: { ts: -1 } },
      { $group: { _id: "$userId", last: { $first: "$ts" } } },
    ]).toArray() as unknown as Promise<Array<{ _id: unknown; last: Date }>>,
    // Last "anything happened" — most recent audit entry per user. Catches
    // background flow too (auto-booking via webhook, watch renewals, etc.)
    // which wouldn't show up as a login.
    auditCol.aggregate([
      { $match: { userId: { $ne: null } } },
      { $sort: { ts: -1 } },
      { $group: { _id: "$userId", last: { $first: "$ts" } } },
    ]).toArray() as unknown as Promise<Array<{ _id: unknown; last: Date }>>,
  ]);

  const lastByUser = new Map<string, Date>();
  for (const r of lastBookingByUser) lastByUser.set(String(r._id), new Date(r.last));
  const attemptedMap = new Map<string, number>();
  for (const r of attemptedByUser) attemptedMap.set(String(r._id), r.count);
  const smsMap = new Map<string, number>();
  for (const r of smsByUser) smsMap.set(String(r._id), r.count);
  const lastSigninMap = new Map<string, Date>();
  for (const r of lastSigninByUser) lastSigninMap.set(String(r._id), new Date(r.last));
  const lastActivityMap = new Map<string, Date>();
  for (const r of lastActivityByUser) lastActivityMap.set(String(r._id), new Date(r.last));

  const now = new Date();
  const userById = new Map<string, { name: string; email: string; firstName: string }>();
  const users: UserStat[] = (allUsers as Array<{
    _id: unknown;
    firstName: string;
    lastName: string;
    email: string;
    watchExpiry: Date | null;
  }>).map((u) => {
    const id = String(u._id);
    const count = bookingsByUser.get(id) ?? 0;
    const watchActive = !!u.watchExpiry && new Date(u.watchExpiry).getTime() > now.getTime();
    const name = `${u.firstName} ${u.lastName}`.trim() || u.email;
    userById.set(id, { name, email: u.email, firstName: u.firstName || u.email });
    return {
      userId: id,
      name,
      email: u.email,
      bookings: count,
      bookingsAttempted: attemptedMap.get(id) ?? 0,
      smsCount: smsMap.get(id) ?? 0,
      minutesSaved: count * MINUTES_SAVED_PER_BOOKING,
      watchActive,
      lastBookingAt: lastByUser.get(id) ?? null,
      lastSigninAt: lastSigninMap.get(id) ?? null,
      lastActivityAt: lastActivityMap.get(id) ?? null,
    };
  });
  users.sort((a, b) => b.bookings - a.bookings);

  const firstBooking = lastBookingDoc[0] as unknown as { updatedAt?: Date } | undefined;
  const lastActivity = firstBooking?.updatedAt ? new Date(firstBooking.updatedAt) : null;

  // Recent activity feed: merge top 10 from bookings + audit errors
  const [recentBookings, recentErrors] = await Promise.all([
    bookingsCol
      .find({ status: { $in: ["booked", "failed"] } })
      .sort({ updatedAt: -1 })
      .limit(10)
      .toArray(),
    auditCol
      .find({ action: "error" })
      .sort({ ts: -1 })
      .limit(10)
      .toArray(),
  ]);

  type BookingRow = {
    userId: unknown;
    status: string;
    room: string | null;
    failureReason: string | null;
    meeting: { title: string; startsAt: Date };
    updatedAt: Date;
  };
  type ErrorRow = {
    ts: Date;
    userId: unknown | null;
    details: {
      where?: string;
      message?: string;
      reason?: string;
      // Notification-error shape — when a SMS / WhatsApp / Email send fails,
      // the audit stores channel + type + the gateway's error string.
      channel?: string;
      type?: string;
      error?: string;
    };
  };

  const activity: ActivityItem[] = [];
  for (const b of recentBookings as unknown as BookingRow[]) {
    const u = userById.get(String(b.userId));
    const who = u?.firstName || u?.email || "?";
    if (b.status === "booked" && b.room) {
      activity.push({
        ts: new Date(b.updatedAt),
        kind: "booking",
        who,
        text: `${who} · ${b.room} pour « ${b.meeting.title} »`,
      });
    } else if (b.status === "failed") {
      activity.push({
        ts: new Date(b.updatedAt),
        kind: "error",
        who,
        text: `${who} · échec « ${b.meeting.title} » (${b.failureReason || "raison inconnue"})`,
      });
    }
  }
  for (const e of recentErrors as unknown as ErrorRow[]) {
    const u = e.userId ? userById.get(String(e.userId)) : null;
    const who = u?.firstName || "système";
    const d = e.details || {};
    // Render a human-readable error line. Three shapes occur in practice:
    //  1. Notification failure: { channel, type, error } — show channel +
    //     a short reason so the admin can tell "WhatsApp gateway down" from
    //     "user has no phone" at a glance.
    //  2. Engine / OAuth failure: { where, message } — show the location
    //     ("applyRoomToCalendarEvent", "oauth_callback") + a short message.
    //  3. Generic: { reason } — last-resort fallback.
    let text: string;
    if (d.channel && d.type) {
      const short = (d.error || "").replace(/^gateway:\s*/i, "").slice(0, 80);
      text = `${who} · ${d.channel} a échoué (${d.type})${short ? " — " + short : ""}`;
    } else if (d.where) {
      const short = (d.message || "").slice(0, 80);
      text = `${who} · ${d.where}${short ? " — " + short : ""}`;
    } else if (d.reason) {
      text = `${who} · ${d.reason}`;
    } else {
      text = `${who} · erreur (sans détail)`;
    }
    activity.push({ ts: new Date(e.ts), kind: "error", who, text });
  }
  activity.sort((a, b) => b.ts.getTime() - a.ts.getTime());
  const recentActivity = activity.slice(0, 10);

  return {
    minutesSaved,
    bookingsBooked,
    smsSent,
    emailsSent,
    activeConnections,
    totalUsers,
    errors: bookingsFailed + auditErrors,
    bookingsLast7d,
    errorsLast7d,
    bookingsLast24h,
    bookingsLast30d,
    quotaExceededLast7d,
    users,
    lastActivity,
    recentActivity,
  };
}
