import { getDb } from "./db";

export interface UserStat {
  userId: string;
  name: string;
  email: string;
  bookings: number;
  minutesSaved: number;
  watchActive: boolean;
  lastBookingAt: Date | null;
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

  const [
    bookingsBooked,
    bookingsFailed,
    smsSent,
    emailsSent,
    auditErrors,
    bookingsLast7d,
    errorsLast7d,
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
    bookingsCol.countDocuments({ status: "booked", createdAt: { $gte: sevenDaysAgo } }),
    bookingsCol.countDocuments({ status: "failed", createdAt: { $gte: sevenDaysAgo } }),
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
  const lastBookingByUser = await bookingsCol.aggregate([
    { $match: { status: "booked" } },
    { $sort: { updatedAt: -1 } },
    { $group: { _id: "$userId", last: { $first: "$updatedAt" } } },
  ]).toArray() as Array<{ _id: unknown; last: Date }>;
  const lastByUser = new Map<string, Date>();
  for (const r of lastBookingByUser) {
    lastByUser.set(String(r._id), new Date(r.last));
  }

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
      minutesSaved: count * MINUTES_SAVED_PER_BOOKING,
      watchActive,
      lastBookingAt: lastByUser.get(id) ?? null,
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
    details: { where?: string; message?: string; reason?: string };
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
    const where = e.details?.where || e.details?.reason || "erreur";
    activity.push({
      ts: new Date(e.ts),
      kind: "error",
      who,
      text: `${who} · ${where}`,
    });
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
    users,
    lastActivity,
    recentActivity,
  };
}
