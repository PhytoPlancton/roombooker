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
  createdAt: Date;
  updatedAt: Date;
}

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
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!result) throw new Error("Upsert failed");
  return result;
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
