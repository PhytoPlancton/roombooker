/**
 * Stateless magic-link tokens for cancel-via-SMS links.
 * Format: <bookingId>.<sig> where sig = HMAC-SHA256(SESSION_SECRET, "cancel:" + bookingId).slice(0,16).
 *
 * The HMAC IS the auth — no need to look up a session. The token is reusable
 * (idempotent: a second click on a cancelled booking is a no-op).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const SEPARATOR = ".";
const SIG_HEX_LENGTH = 16;

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET missing");
  return s;
}

function hmac(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex").slice(0, SIG_HEX_LENGTH);
}

export function signCancelToken(bookingId: string): string {
  const sig = hmac(`cancel:${bookingId}`);
  return `${bookingId}${SEPARATOR}${sig}`;
}

/** Returns the bookingId if valid, null otherwise. Constant-time signature compare. */
export function verifyCancelToken(token: string): string | null {
  const idx = token.indexOf(SEPARATOR);
  if (idx < 0) return null;
  const bookingId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  if (sig.length !== SIG_HEX_LENGTH) return null;
  const expected = hmac(`cancel:${bookingId}`);
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return null;
    if (timingSafeEqual(a, b)) return bookingId;
  } catch {
    return null;
  }
  return null;
}
