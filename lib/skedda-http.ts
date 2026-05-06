/**
 * Skedda HTTP client (no browser, no Playwright).
 *
 * Reverse-engineered flow:
 *   1. GET /booking            → set X-Skedda-RequestVerificationCookie, parse __RequestVerificationToken from HTML
 *   2. GET /webs               → JSON with venue[0].publicRegisterPayload (acts as the "registerMetadata")
 *   3. POST /venueusers        → create a guest venueuser, returns { id, antiForgeryToken } and X-Skedda-ApplicationCookie
 *   4. POST /bookings          → create the booking, returns { id }
 *   5. DELETE /bookings/{id}   → cancel
 *
 * Important: the antiForgeryToken returned by /venueusers IS the CSRF token to use for /bookings.
 * Cookies must be carried through all 4 calls.
 */

import type { RoomName } from "./bookings";
import { audit } from "./audit";

export const ROOM_SPACE_IDS: Record<RoomName, number> = {
  Venus: 1117978,
  Mars: 1117995,
  Mercury: 1119104,
  Earth: 1117994,
  Jupiter: 1117977,
};

const VENUE_ID = "189147"; // Antler France
const SKEDDA_BASE = "https://antlerfrance.skedda.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

export interface BookSkeddaArgs {
  room: RoomName;
  spaceId: number;
  startsAt: Date;
  endsAt: Date;
  firstName: string;
  lastName: string;
  email: string;        // sales' real email — used as guest_id base
  telephone: string;    // E.164 (+33...)
  title: string;
  iCalUID?: string;
  userId?: import("mongodb").ObjectId;
}

export type BookSkeddaResult =
  | {
      success: true;
      skeddaBookingId: string;
      cancelToken: string;       // antiForgeryToken — needed for DELETE later
      cookies: string;           // serialized cookies — needed for DELETE later
    }
  | {
      success: false;
      reason:
        | "slot_unavailable"
        | "outside_hours"
        | "window_too_far"
        | "form_unexpected"
        | "navigation_failed"
        | "unknown";
      errorMessage: string;
    };

interface SkeddaSession {
  cookies: Map<string, string>;
  csrfToken: string;
}

function serializeCookies(cookies: Map<string, string>): string {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function parseSetCookie(headers: Headers, cookies: Map<string, string>): void {
  // Node fetch returns combined cookies via getSetCookie() (Node 20+) or set-cookie header
  const list = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.()
    ?? (headers.get("set-cookie") ? [headers.get("set-cookie")!] : []);
  for (const raw of list) {
    const firstPart = raw.split(";")[0];
    const eq = firstPart.indexOf("=");
    if (eq < 0) continue;
    const name = firstPart.slice(0, eq).trim();
    const value = firstPart.slice(eq + 1).trim();
    if (name) cookies.set(name, value);
  }
}

function commonHeaders(session: SkeddaSession | null = null, extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": UA,
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "*/*",
    Referer: `${SKEDDA_BASE}/booking`,
    Origin: SKEDDA_BASE,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    ...extra,
  };
  if (session) {
    h.Cookie = serializeCookies(session.cookies);
    h["X-Skedda-RequestVerificationToken"] = session.csrfToken;
  }
  return h;
}

async function step(args: BookSkeddaArgs, label: string, extra: Record<string, unknown> = {}) {
  await audit({
    action: "skedda_attempt",
    userId: args.userId ?? null,
    iCalUID: args.iCalUID ?? null,
    details: { step: label, room: args.room, ...extra },
  });
}

/** YYYY-MM-DDTHH:mm:ss without timezone — Skedda interprets in venue timezone (Europe/Berlin for Antler France). */
function formatLocalIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    "-" + pad(d.getUTCMonth() + 1) +
    "-" + pad(d.getUTCDate()) +
    "T" + pad(d.getUTCHours()) +
    ":" + pad(d.getUTCMinutes()) +
    ":" + pad(d.getUTCSeconds())
  );
}

/** Step 1+2: open a session with Skedda, returning the bootstrap CSRF token and the publicRegisterPayload. */
async function bootstrapSession(): Promise<{ session: SkeddaSession; publicRegisterPayload: string }> {
  const cookies = new Map<string, string>();

  // 1. GET /booking → cookie + token
  const bookingResp = await fetch(`${SKEDDA_BASE}/booking`, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
    },
    redirect: "follow",
  });
  if (!bookingResp.ok) {
    throw new Error(`GET /booking failed: ${bookingResp.status}`);
  }
  parseSetCookie(bookingResp.headers, cookies);

  const html = await bookingResp.text();
  const m = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  if (!m) throw new Error("__RequestVerificationToken not found in /booking HTML");
  const csrfToken = m[1];

  const session: SkeddaSession = { cookies, csrfToken };

  // 2. GET /webs → publicRegisterPayload
  const websResp = await fetch(`${SKEDDA_BASE}/webs`, { headers: commonHeaders(session) });
  if (!websResp.ok) {
    throw new Error(`GET /webs failed: ${websResp.status}`);
  }
  parseSetCookie(websResp.headers, cookies);
  const websJson = (await websResp.json()) as { venue?: Array<{ publicRegisterPayload?: string }>; errors?: unknown };
  const payload = websJson.venue?.[0]?.publicRegisterPayload;
  if (!payload) {
    throw new Error("publicRegisterPayload missing in /webs response (session may be flagged)");
  }
  return { session, publicRegisterPayload: payload };
}

/** Step 3: create a guest venueuser. Returns the venueuser id and the new CSRF token to use for subsequent calls. */
async function createGuestVenueUser(
  session: SkeddaSession,
  publicRegisterPayload: string,
  args: { firstName: string; lastName: string; email: string; telephone: string },
): Promise<{ venueUserId: string; antiForgeryToken: string }> {
  const body = {
    venueuser: {
      termsAgreed: true,
      twoLetterCountryCode: "FR",
      contactNumber: args.telephone, // Skedda accepts both 06... and +33... formats
      firstName: args.firstName,
      lastName: args.lastName,
      username: args.email,
      registerToken: null,
      registerMetadata: publicRegisterPayload,
      resetAccessToken: false,
      updateCreditCard: false,
      pendingDeletion: false,
      createStripeCustomer: false,
      removeExternalLogins: false,
    },
  };

  const resp = await fetch(`${SKEDDA_BASE}/venueusers`, {
    method: "POST",
    headers: commonHeaders(session, { "Content-Type": "application/json; charset=utf-8" }),
    body: JSON.stringify(body),
  });
  parseSetCookie(resp.headers, session.cookies);

  const data = (await resp.json()) as {
    venueusers?: Array<{ id: string; antiForgeryToken: string }>;
    errors?: Array<{ detail: string }>;
  };

  if (!resp.ok || !data.venueusers?.[0]) {
    const detail = data.errors?.[0]?.detail || `${resp.status}`;
    const err = new Error(detail);
    (err as { skeddaReason?: string }).skeddaReason = classifyError(detail);
    throw err;
  }

  const vu = data.venueusers[0];
  return { venueUserId: vu.id, antiForgeryToken: vu.antiForgeryToken };
}

/** Step 4: create the booking. */
async function createBooking(
  session: SkeddaSession,
  args: { venueUserId: string; spaceId: number; startsAt: Date; endsAt: Date; title: string },
): Promise<{ bookingId: string }> {
  const body = {
    booking: {
      title: args.title,
      price: 0,
      type: 1,
      paymentStatus: 0,
      customFields: [{ id: "notes", value: null }],
      allowInviteOthers: false,
      addConference: false,
      hideAttendees: true,
      availabilityStatus: 1,
      conferenceLinkType: 0,
      attendees: [],
      start: formatLocalIso(args.startsAt),
      end: formatLocalIso(args.endsAt),
      spaces: [String(args.spaceId)],
      addOns: [],
      venueuser: args.venueUserId,
      venue: VENUE_ID,
      unrecognizedOrganizer: false,
      stripPrivateEventDetails: false,
    },
  };

  const resp = await fetch(`${SKEDDA_BASE}/bookings`, {
    method: "POST",
    headers: commonHeaders(session, { "Content-Type": "application/json; charset=utf-8" }),
    body: JSON.stringify(body),
  });
  parseSetCookie(resp.headers, session.cookies);

  const data = (await resp.json()) as {
    booking?: { id: string };
    errors?: Array<{ detail: string }>;
  };

  if (!resp.ok || !data.booking?.id) {
    const detail = data.errors?.[0]?.detail || `${resp.status}`;
    const err = new Error(detail);
    (err as { skeddaReason?: string }).skeddaReason = classifyError(detail);
    throw err;
  }

  return { bookingId: data.booking.id };
}

type FailReason = Extract<BookSkeddaResult, { success: false }>["reason"];

function classifyError(detail: string): FailReason {
  const t = detail.toLowerCase();
  if (/more than \d+ day/.test(t) || t.includes("booking window")) return "window_too_far";
  if (t.includes("hours of availability") || t.includes("outside")) return "outside_hours";
  if (t.includes("clash") || t.includes("already booked") || t.includes("not available") || t.includes("conflict")) {
    return "slot_unavailable";
  }
  if (t.includes("super detectives") || t.includes("security")) return "navigation_failed";
  return "unknown";
}

export async function bookSkeddaHttp(args: BookSkeddaArgs): Promise<BookSkeddaResult> {
  try {
    await step(args, "bootstrap");
    const { session, publicRegisterPayload } = await bootstrapSession();

    await step(args, "create_venueuser");
    // Use a unique guest email per booking to avoid the "user already exists" error.
    // We embed the iCalUID short hash so the same meeting always uses the same guest email
    // (idempotent if Skedda dedups, no-op otherwise).
    const seed = (args.iCalUID || `${args.email}-${args.startsAt.toISOString()}`).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24).toLowerCase();
    const guestEmail = `rb-${seed}@example.com`;

    const { venueUserId, antiForgeryToken } = await createGuestVenueUser(session, publicRegisterPayload, {
      firstName: args.firstName,
      lastName: args.lastName,
      email: guestEmail,
      telephone: args.telephone,
    });

    // Switch to the new CSRF token for subsequent calls
    session.csrfToken = antiForgeryToken;

    await step(args, "create_booking", { venueUserId });
    const { bookingId } = await createBooking(session, {
      venueUserId,
      spaceId: args.spaceId,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      title: args.title,
    });

    await step(args, "booked", { bookingId });

    return {
      success: true,
      skeddaBookingId: bookingId,
      cancelToken: antiForgeryToken,
      cookies: serializeCookies(session.cookies),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    const reason = (err as { skeddaReason?: FailReason }).skeddaReason || "navigation_failed";
    return {
      success: false,
      reason,
      errorMessage: message,
    };
  }
}

/** Cancel a previously-created booking. Requires the cookies + cancelToken returned from bookSkeddaHttp. */
export async function cancelSkeddaBookingHttp(args: {
  skeddaBookingId: string;
  cancelToken: string;
  cookies: string;
}): Promise<{ success: boolean; errorMessage?: string }> {
  try {
    const resp = await fetch(`${SKEDDA_BASE}/bookings/${args.skeddaBookingId}`, {
      method: "DELETE",
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        Referer: `${SKEDDA_BASE}/booking`,
        Origin: SKEDDA_BASE,
        Cookie: args.cookies,
        "X-Skedda-RequestVerificationToken": args.cancelToken,
      },
    });
    if (resp.status === 204 || resp.ok) return { success: true };
    const text = await resp.text().catch(() => "");
    return { success: false, errorMessage: `${resp.status}: ${text.slice(0, 200)}` };
  } catch (err) {
    return { success: false, errorMessage: err instanceof Error ? err.message : "unknown" };
  }
}
