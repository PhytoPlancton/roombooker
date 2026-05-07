import { google, type calendar_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { randomBytes } from "node:crypto";
import { decryptTokens, type UserDoc } from "./users";

function clientForUser(user: UserDoc): OAuth2Client {
  if (!user.googleTokens) throw new Error("User has no Google tokens");
  const tokens = decryptTokens(user.googleTokens);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth env vars missing");

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiresAt.getTime(),
  });
  return oauth2;
}

export function calendarFor(user: UserDoc): calendar_v3.Calendar {
  return google.calendar({ version: "v3", auth: clientForUser(user) });
}

/**
 * Initialise une synchro incrémentale et un watch push.
 * Returns: { syncToken, channelId, resourceId, expiry }
 */
export async function startWatch(args: {
  user: UserDoc;
  webhookUrl: string;
  webhookToken: string;
}) {
  const cal = calendarFor(args.user);

  // 1. Initial sync to get a syncToken (we don't process these — they are existing events)
  let syncToken: string | undefined;
  let pageToken: string | undefined;
  do {
    const res = await cal.events.list({
      calendarId: "primary",
      pageToken,
      singleEvents: true,
      maxResults: 2500,
    });
    pageToken = res.data.nextPageToken ?? undefined;
    syncToken = res.data.nextSyncToken ?? syncToken;
  } while (pageToken);

  if (!syncToken) {
    throw new Error("Failed to obtain initial syncToken");
  }

  // 2. Open the push channel
  const channelId = randomBytes(16).toString("hex");
  const watch = await cal.events.watch({
    calendarId: "primary",
    requestBody: {
      id: channelId,
      type: "web_hook",
      address: args.webhookUrl,
      token: args.webhookToken,
    },
  });

  if (!watch.data.resourceId || !watch.data.expiration) {
    throw new Error("Watch response missing resourceId or expiration");
  }

  return {
    syncToken,
    channelId,
    resourceId: watch.data.resourceId,
    expiry: new Date(Number(watch.data.expiration)),
  };
}

export async function stopWatch(args: {
  user: UserDoc;
  channelId: string;
  resourceId: string;
}): Promise<void> {
  const cal = calendarFor(args.user);
  try {
    await cal.channels.stop({
      requestBody: { id: args.channelId, resourceId: args.resourceId },
    });
  } catch (err) {
    // Ignore "not found" — the channel may already have expired
    const code = (err as { code?: number }).code;
    if (code !== 404 && code !== 410) throw err;
  }
}

/**
 * Pull les events qui ont changé depuis le syncToken précédent.
 * Returns: { changedEvents, newSyncToken }
 * Si le syncToken a expiré (410 GONE), retourne { needsFullResync: true }.
 */
export async function syncSince(args: {
  user: UserDoc;
  syncToken: string;
}): Promise<
  | { needsFullResync: true }
  | { changedEvents: calendar_v3.Schema$Event[]; newSyncToken: string }
> {
  const cal = calendarFor(args.user);
  const changed: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  try {
    do {
      const res = await cal.events.list({
        calendarId: "primary",
        syncToken: pageToken ? undefined : args.syncToken,
        pageToken,
        maxResults: 250,
      });
      for (const ev of res.data.items ?? []) changed.push(ev);
      pageToken = res.data.nextPageToken ?? undefined;
      nextSyncToken = res.data.nextSyncToken ?? nextSyncToken;
    } while (pageToken);
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 410) return { needsFullResync: true };
    throw err;
  }

  if (!nextSyncToken) {
    throw new Error("Sync completed but no new syncToken returned");
  }

  return { changedEvents: changed, newSyncToken: nextSyncToken };
}

export async function updateEventLocation(args: {
  user: UserDoc;
  eventId: string;
  location: string;
}): Promise<void> {
  const cal = calendarFor(args.user);
  await cal.events.patch({
    calendarId: "primary",
    eventId: args.eventId,
    requestBody: { location: args.location },
  });
}

const ROOM_MARKER_RE = /^\[Roombooker · [^\]]+\]\n+/;

/**
 * Writes the room reference to the Calendar event according to the user's
 * preference. No-op when mode === "none".
 */
export async function applyRoomToCalendarEvent(args: {
  user: UserDoc;
  eventId: string;
  room: string;
}): Promise<void> {
  const mode = args.user.roomLocationMode || "location";
  if (mode === "none") return;
  const cal = calendarFor(args.user);
  if (mode === "location") {
    await cal.events.patch({
      calendarId: "primary",
      eventId: args.eventId,
      requestBody: { location: args.room },
    });
    return;
  }
  // mode === "description": fetch current description, strip any prior
  // marker, prepend the new one.
  const got = await cal.events.get({ calendarId: "primary", eventId: args.eventId });
  const current = (got.data.description || "").replace(ROOM_MARKER_RE, "");
  const next = `[Roombooker · ${args.room}]\n\n${current}`;
  await cal.events.patch({
    calendarId: "primary",
    eventId: args.eventId,
    requestBody: { description: next },
  });
}

/**
 * Reverts whatever applyRoomToCalendarEvent had written. Used at release time
 * so we don't leave stale "Salle: Mars" in the event after a cancellation.
 * Tolerates user manual edits — only strips our own marker.
 */
export async function removeRoomFromCalendarEvent(args: {
  user: UserDoc;
  eventId: string;
  room: string;
}): Promise<void> {
  const mode = args.user.roomLocationMode || "location";
  if (mode === "none") return;
  const cal = calendarFor(args.user);
  if (mode === "location") {
    // Only clear the location if it still matches what we wrote.
    const got = await cal.events.get({ calendarId: "primary", eventId: args.eventId });
    const current = (got.data.location || "").trim();
    if (current.toLowerCase() === args.room.trim().toLowerCase()) {
      await cal.events.patch({
        calendarId: "primary",
        eventId: args.eventId,
        requestBody: { location: "" },
      });
    }
    return;
  }
  // mode === "description"
  const got = await cal.events.get({ calendarId: "primary", eventId: args.eventId });
  const current = got.data.description || "";
  const stripped = current.replace(ROOM_MARKER_RE, "");
  if (stripped !== current) {
    await cal.events.patch({
      calendarId: "primary",
      eventId: args.eventId,
      requestBody: { description: stripped },
    });
  }
}
