import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./db";

export type RoomName = "Venus" | "Mars" | "Mercury" | "Earth" | "Jupiter";

export const ROOM_PRIORITY: RoomName[] = ["Venus", "Mars", "Mercury", "Earth", "Jupiter"];

export interface BookingDoc {
  _id: ObjectId;
  iCalUID: string;
  googleEventId: string;
  userId: ObjectId;
  meeting: {
    title: string;
    startsAt: Date;
    endsAt: Date;
    attendees: string[];
  };
  room: RoomName | null;
  skeddaBookingRef: string | null;
  skeddaCancelLink: string | null;
  skeddaCancelToken: string | null;  // antiForgeryToken — needed to DELETE
  skeddaCookies: string | null;       // serialized cookies — needed to DELETE
  status: "pending" | "booked" | "cancelled" | "failed";
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

declare global {
  var __bookingsIndexCreated: boolean | undefined;
}

async function bookingsCol(): Promise<Collection<BookingDoc>> {
  const db = await getDb();
  const col = db.collection<BookingDoc>("bookings");
  if (!global.__bookingsIndexCreated) {
    await col.createIndex({ iCalUID: 1 }, { unique: true });
    await col.createIndex({ userId: 1, "meeting.startsAt": -1 });
    await col.createIndex({ status: 1 });
    global.__bookingsIndexCreated = true;
  }
  return col;
}

export async function findBookingByICalUID(iCalUID: string): Promise<BookingDoc | null> {
  const col = await bookingsCol();
  return col.findOne({ iCalUID });
}

export async function findBookingById(id: ObjectId): Promise<BookingDoc | null> {
  const col = await bookingsCol();
  return col.findOne({ _id: id });
}

export async function createPendingBooking(args: {
  iCalUID: string;
  googleEventId: string;
  userId: ObjectId;
  meeting: BookingDoc["meeting"];
}): Promise<BookingDoc> {
  const col = await bookingsCol();
  const now = new Date();
  const doc: BookingDoc = {
    _id: new ObjectId(),
    iCalUID: args.iCalUID,
    googleEventId: args.googleEventId,
    userId: args.userId,
    meeting: args.meeting,
    room: null,
    skeddaBookingRef: null,
    skeddaCancelLink: null,
    skeddaCancelToken: null,
    skeddaCookies: null,
    status: "pending",
    failureReason: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await col.insertOne(doc);
    return doc;
  } catch (err) {
    // duplicate key — another instance already booked this iCalUID
    if ((err as { code?: number }).code === 11000) {
      const existing = await col.findOne({ iCalUID: args.iCalUID });
      if (existing) return existing;
    }
    throw err;
  }
}

export async function markBookingResult(args: {
  iCalUID: string;
  status: "booked" | "failed" | "cancelled";
  room?: RoomName;
  skeddaBookingRef?: string;
  skeddaCancelLink?: string;
  skeddaCancelToken?: string;
  skeddaCookies?: string;
  failureReason?: string;
}): Promise<void> {
  const col = await bookingsCol();
  const update: Record<string, unknown> = { status: args.status, updatedAt: new Date() };
  if (args.room !== undefined) update.room = args.room;
  if (args.skeddaBookingRef !== undefined) update.skeddaBookingRef = args.skeddaBookingRef;
  if (args.skeddaCancelLink !== undefined) update.skeddaCancelLink = args.skeddaCancelLink;
  if (args.skeddaCancelToken !== undefined) update.skeddaCancelToken = args.skeddaCancelToken;
  if (args.skeddaCookies !== undefined) update.skeddaCookies = args.skeddaCookies;
  if (args.failureReason !== undefined) update.failureReason = args.failureReason;
  await col.updateOne({ iCalUID: args.iCalUID }, { $set: update });
}

export async function listBookingsForUser(userId: ObjectId, limit = 50): Promise<BookingDoc[]> {
  const col = await bookingsCol();
  return col
    .find({ userId })
    .sort({ "meeting.startsAt": -1 })
    .limit(limit)
    .toArray();
}
