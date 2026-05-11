/**
 * Releases a Skedda booking we previously created. Centralized here so both:
 *  - the dashboard "cancel" button (lib/dashboard/actions.ts)
 *  - the Calendar webhook (when the meeting is cancelled in Google Calendar)
 * use the exact same flow.
 */

import { ObjectId } from "mongodb";
import { findBookingById, findBookingByICalUID, markBookingResult, type BookingDoc } from "./bookings";
import { cancelSkeddaBookingHttp } from "./skedda-http";
import { audit } from "./audit";

interface ReleaseResult {
  ok: boolean;
  reason?:
    | "not_found"
    | "wrong_user"
    | "not_active"
    | "missing_cancel_creds"
    | "skedda_error"
    | "locked_in";
  errorMessage?: string;
}

async function doRelease(booking: BookingDoc, source: "dashboard" | "calendar_cancel"): Promise<ReleaseResult> {
  if (booking.status !== "booked") {
    return { ok: false, reason: "not_active" };
  }
  if (!booking.skeddaBookingRef || !booking.skeddaCancelToken || !booking.skeddaCookies) {
    return { ok: false, reason: "missing_cancel_creds" };
  }

  const result = await cancelSkeddaBookingHttp({
    skeddaBookingId: booking.skeddaBookingRef,
    cancelToken: booking.skeddaCancelToken,
    cookies: booking.skeddaCookies,
  });

  if (!result.success) {
    await audit({
      action: "error",
      userId: booking.userId,
      iCalUID: booking.iCalUID,
      details: {
        where: "release_booking",
        source,
        skeddaBookingRef: booking.skeddaBookingRef,
        skeddaReason: result.reason,
        errorMessage: result.errorMessage,
      },
    });
    if (result.reason === "locked_in") {
      return { ok: false, reason: "locked_in", errorMessage: result.errorMessage };
    }
    return { ok: false, reason: "skedda_error", errorMessage: result.errorMessage };
  }

  await markBookingResult({ iCalUID: booking.iCalUID, status: "cancelled" });
  await audit({
    action: "skedda_success",
    userId: booking.userId,
    iCalUID: booking.iCalUID,
    details: {
      step: "cancelled",
      source,
      skeddaBookingRef: booking.skeddaBookingRef,
    },
  });
  return { ok: true };
}

export async function releaseBookingByIdAsUser(bookingId: ObjectId, userId: ObjectId): Promise<ReleaseResult> {
  const booking = await findBookingById(bookingId);
  if (!booking) return { ok: false, reason: "not_found" };
  if (!booking.userId.equals(userId)) return { ok: false, reason: "wrong_user" };
  return doRelease(booking, "dashboard");
}

export async function releaseBookingByICalUIDAuto(iCalUID: string): Promise<ReleaseResult> {
  const booking = await findBookingByICalUID(iCalUID);
  if (!booking) return { ok: false, reason: "not_found" };
  return doRelease(booking, "calendar_cancel");
}

/** Magic-link cancel: token already authenticated upstream (HMAC), no user check. */
export async function releaseBookingByIdMagic(bookingId: ObjectId): Promise<ReleaseResult & { booking?: BookingDoc }> {
  const booking = await findBookingById(bookingId);
  if (!booking) return { ok: false, reason: "not_found" };
  const result = await doRelease(booking, "dashboard");
  return { ...result, booking };
}
