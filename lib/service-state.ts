/**
 * Global service-state singleton — admin-controlled kill switches for the 3
 * notification channels (SMS / Email / WhatsApp). When a channel is "paused":
 *  - notifyUser() skips it entirely and audits the skip
 *  - the user's Settings UI greys out the matching toggle (preserving their
 *    saved on/off state) with an amber "en pause" hint
 *
 * Stored as a singleton doc { _id: "channels", sms, email, whatsapp } in the
 * "serviceState" collection. Read-cached 30s in-process so we don't hammer
 * Mongo on every webhook.
 */

import { getDb } from "./db";

export interface ChannelAvailability {
  sms: boolean;
  email: boolean;
  whatsapp: boolean;
}

const DEFAULT_AVAILABILITY: ChannelAvailability = {
  sms: true,
  email: true,
  whatsapp: true,
};

interface CacheEntry {
  value: ChannelAvailability;
  fetchedAt: number;
}

declare global {
  var __channelAvailCache: CacheEntry | undefined;
}

const CACHE_TTL_MS = 30_000;

export async function getChannelAvailability(): Promise<ChannelAvailability> {
  const now = Date.now();
  if (global.__channelAvailCache && now - global.__channelAvailCache.fetchedAt < CACHE_TTL_MS) {
    return global.__channelAvailCache.value;
  }
  const db = await getDb();
  const doc = await db.collection("serviceState").findOne({ _id: "channels" as unknown as object });
  const value: ChannelAvailability = doc
    ? {
        sms: doc.sms !== false,
        email: doc.email !== false,
        whatsapp: doc.whatsapp !== false,
      }
    : DEFAULT_AVAILABILITY;
  global.__channelAvailCache = { value, fetchedAt: now };
  return value;
}

export async function setChannelAvailability(
  channel: keyof ChannelAvailability,
  enabled: boolean,
): Promise<void> {
  const db = await getDb();
  await db.collection("serviceState").updateOne(
    { _id: "channels" as unknown as object },
    { $set: { [channel]: enabled, updatedAt: new Date() } },
    { upsert: true },
  );
  // Invalidate cache so the next read picks up the change immediately.
  global.__channelAvailCache = undefined;
}
