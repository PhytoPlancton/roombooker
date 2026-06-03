import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./db";
import { encrypt, decrypt } from "./crypto";

export interface EncryptedTokens {
  accessToken: string;   // encrypted
  refreshToken: string;  // encrypted
  expiresAt: Date;
}

export interface DecryptedTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

/**
 * Per-notification-type, per-channel preferences. Adding a new channel (Slack,
 * push) = add a key to ChannelPrefs. Adding a new type = add a key to NotifPrefs.
 */
export type NotifType =
  | "booking_success"
  | "booking_failure"
  | "booking_cancelled"
  | "booking_deferred"
  | "watch_resync";
export interface ChannelPrefs {
  sms: boolean;
  email: boolean;
  whatsapp: boolean;
}
export interface NotifPrefs {
  booking_success: ChannelPrefs;
  booking_failure: ChannelPrefs;
  booking_cancelled: ChannelPrefs;
  booking_deferred: ChannelPrefs;
  watch_resync: ChannelPrefs;
}
export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  // WhatsApp-first defaults (v0.10.31). EDJ SMS gateway has been flaky and
  // Gmail Workspace puts our emails in spam — WhatsApp is the most reliable
  // channel for sales today, so it's the only ON-by-default channel for the
  // 3 routine confirmations. booking_failure stays multi-channel (action
  // required, can't afford a silent failure); watch_resync stays all-off
  // (technical, no action needed).
  booking_success: { sms: false, email: false, whatsapp: true },
  booking_failure: { sms: true, email: true, whatsapp: true },
  booking_cancelled: { sms: false, email: false, whatsapp: true },
  booking_deferred: { sms: false, email: false, whatsapp: true },
  watch_resync: { sms: false, email: false, whatsapp: false },
};

/**
 * Trigger rules — combined with AND logic. The booking only fires when
 * EVERY enabled-and-configured rule matches the meeting. Enabling more
 * rules narrows the funnel (e.g. external attendee + "demo" keyword →
 * only demo meetings with an external attendee are booked).
 * Hardcoded prerequisites (organizer, not recurring, not cancelled,
 * location empty) still apply on top.
 */
export interface BookingRules {
  externalAttendee: { enabled: boolean };                      // any non-@muchbetter.ai attendee
  titleKeywords: { enabled: boolean; keywords: string[] };     // case-insensitive substring match
  invitedEmails: { enabled: boolean; emails: string[] };       // exact email match in attendees
  descriptionKeywords: { enabled: boolean; keywords: string[] }; // case-insensitive substring in event.description
}

export const DEFAULT_BOOKING_RULES: BookingRules = {
  externalAttendee: { enabled: true },
  titleKeywords: { enabled: false, keywords: [] },
  invitedEmails: { enabled: false, emails: [] },
  descriptionKeywords: { enabled: false, keywords: [] },
};

export interface UserDoc {
  _id: ObjectId;
  email: string;
  firstName: string;
  lastName: string;
  telephone: string | null;
  googleTokens: EncryptedTokens | null;
  watchChannelId: string | null;
  watchResourceId: string | null;
  watchExpiry: Date | null;
  watchSyncToken: string | null;
  slackUserId: string | null;
  notifChannels: ("sms" | "email")[];
  bookingRules?: BookingRules; // optional for backwards-compat with existing users — fall back to DEFAULT
  notifPrefs?: NotifPrefs; // optional for backwards-compat — fall back to DEFAULT_NOTIF_PREFS
  roomPriority?: ("Venus" | "Mars" | "Mercury" | "Earth" | "Jupiter")[]; // optional, fall back to DEFAULT_ROOM_PRIORITY
  /**
   * Where to write the room name in the Google Calendar event after a successful booking:
   *  - "location": fill the event's location field (default, most visible to invitees)
   *  - "description": prepend a "[Roombooker · X]" marker line to the description
   *  - "none": don't touch the event at all
   */
  roomLocationMode?: "location" | "description" | "none";
  /**
   * Whether to share the Google meeting title on the Skedda booking (visible to
   * other Antler France users).
   *  - "none" (default): never send title, keeps the booking anonymous
   *  - "anonymized": send a stripped-down generic title (e.g. "Demo client")
   *  - "full": send the raw title verbatim
   */
  skeddaTitleMode?: "none" | "anonymized" | "full";
  /**
   * Safety buffer (in minutes) applied around the Google Calendar event when
   * reserving on Skedda. The Calendar meeting time stays unchanged — only the
   * Skedda booking is extended `bufferMinutes` before AND after. Useful for
   * setup, demo overruns, or walking between rooms.
   *  - undefined / 0 (default): no buffer, Skedda matches Calendar exactly
   *  - 15: reserve 15 min before and 15 min after (total +30 min on Skedda)
   */
  bufferMinutes?: number;
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_ROOM_PRIORITY: ("Venus" | "Mars" | "Mercury" | "Earth" | "Jupiter")[] = [
  "Venus", "Mars", "Mercury", "Earth", "Jupiter",
];

async function usersCol(): Promise<Collection<UserDoc>> {
  const db = await getDb();
  const col = db.collection<UserDoc>("users");
  if (!global.__usersIndexCreated) {
    await col.createIndex({ email: 1 }, { unique: true });
    await col.createIndex({ watchChannelId: 1 }, { sparse: true });
    global.__usersIndexCreated = true;
  }
  return col;
}

declare global {
  var __usersIndexCreated: boolean | undefined;
}

export async function findUserByEmail(email: string): Promise<UserDoc | null> {
  const col = await usersCol();
  return col.findOne({ email });
}

export async function findUserById(id: ObjectId): Promise<UserDoc | null> {
  const col = await usersCol();
  return col.findOne({ _id: id });
}

export async function upsertUserOnLogin(args: {
  email: string;
  firstName: string;
  lastName: string;
  tokens: DecryptedTokens;
}): Promise<UserDoc> {
  const col = await usersCol();
  const now = new Date();
  const encryptedTokens: EncryptedTokens = {
    accessToken: encrypt(args.tokens.accessToken),
    refreshToken: encrypt(args.tokens.refreshToken),
    expiresAt: args.tokens.expiresAt,
  };
  const result = await col.findOneAndUpdate(
    { email: args.email },
    {
      $set: {
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        googleTokens: encryptedTokens,
        updatedAt: now,
      },
      $setOnInsert: {
        telephone: null,
        watchChannelId: null,
        watchResourceId: null,
        watchExpiry: null,
        watchSyncToken: null,
        slackUserId: null,
        notifChannels: ["sms", "email"],
        bookingRules: DEFAULT_BOOKING_RULES,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!result) throw new Error("Upsert failed");
  return result;
}

export async function setBookingRules(userId: ObjectId, rules: BookingRules): Promise<void> {
  const col = await usersCol();
  await col.updateOne(
    { _id: userId },
    { $set: { bookingRules: rules, updatedAt: new Date() } },
  );
}

export async function setRoomPriority(
  userId: ObjectId,
  priority: ("Venus" | "Mars" | "Mercury" | "Earth" | "Jupiter")[],
): Promise<void> {
  const col = await usersCol();
  await col.updateOne(
    { _id: userId },
    { $set: { roomPriority: priority, updatedAt: new Date() } },
  );
}

export async function setNotifPrefs(userId: ObjectId, prefs: NotifPrefs): Promise<void> {
  const col = await usersCol();
  await col.updateOne(
    { _id: userId },
    { $set: { notifPrefs: prefs, updatedAt: new Date() } },
  );
}

export async function setRoomLocationMode(
  userId: ObjectId,
  mode: "location" | "description" | "none",
): Promise<void> {
  const col = await usersCol();
  await col.updateOne(
    { _id: userId },
    { $set: { roomLocationMode: mode, updatedAt: new Date() } },
  );
}

export async function setSkeddaTitleMode(
  userId: ObjectId,
  mode: "none" | "anonymized" | "full",
): Promise<void> {
  const col = await usersCol();
  await col.updateOne(
    { _id: userId },
    { $set: { skeddaTitleMode: mode, updatedAt: new Date() } },
  );
}

export async function setBufferMinutes(userId: ObjectId, minutes: number): Promise<void> {
  const col = await usersCol();
  await col.updateOne(
    { _id: userId },
    { $set: { bufferMinutes: minutes, updatedAt: new Date() } },
  );
}

export async function setTelephone(userId: ObjectId, telephone: string): Promise<void> {
  const col = await usersCol();
  await col.updateOne(
    { _id: userId },
    { $set: { telephone, updatedAt: new Date() } },
  );
}

export async function setWatchInfo(args: {
  userId: ObjectId;
  channelId: string;
  resourceId: string;
  expiry: Date;
  syncToken: string;
}): Promise<void> {
  const col = await usersCol();
  await col.updateOne(
    { _id: args.userId },
    {
      $set: {
        watchChannelId: args.channelId,
        watchResourceId: args.resourceId,
        watchExpiry: args.expiry,
        watchSyncToken: args.syncToken,
        updatedAt: new Date(),
      },
    },
  );
}

export async function updateWatchSyncToken(userId: ObjectId, syncToken: string): Promise<void> {
  const col = await usersCol();
  await col.updateOne(
    { _id: userId },
    { $set: { watchSyncToken: syncToken, updatedAt: new Date() } },
  );
}

export async function clearWatchInfo(userId: ObjectId): Promise<void> {
  const col = await usersCol();
  await col.updateOne(
    { _id: userId },
    {
      $set: {
        watchChannelId: null,
        watchResourceId: null,
        watchExpiry: null,
        watchSyncToken: null,
        updatedAt: new Date(),
      },
    },
  );
}

export async function findUserByWatchChannelId(channelId: string): Promise<UserDoc | null> {
  const col = await usersCol();
  return col.findOne({ watchChannelId: channelId });
}

/**
 * Hard-delete a user document. Used by the admin "remove from team" action —
 * after this returns, a fresh OAuth signin with the same email will create
 * a brand-new doc (different ObjectId, no carry-over of phone, prefs, watch,
 * etc.). Bookings + audit entries keep the OLD ObjectId reference and
 * become orphans (intentionally — we want a clean break).
 */
export async function deleteUserDoc(userId: ObjectId): Promise<void> {
  const col = await usersCol();
  await col.deleteOne({ _id: userId });
}

export async function findUsersWithExpiringWatch(within: Date): Promise<UserDoc[]> {
  const col = await usersCol();
  return col
    .find({ watchChannelId: { $ne: null }, watchExpiry: { $lte: within } })
    .toArray();
}

export function decryptTokens(tokens: EncryptedTokens): DecryptedTokens {
  return {
    accessToken: decrypt(tokens.accessToken),
    refreshToken: decrypt(tokens.refreshToken),
    expiresAt: tokens.expiresAt,
  };
}
