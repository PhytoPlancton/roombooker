/**
 * Lightweight in-process crons. Started once per Node process via
 * instrumentation.ts. Two jobs:
 *
 *  - renewExpiringWatches  (24h): re-activate Google Calendar watches that
 *    expire within 48h. Notifies the sales by SMS/email.
 *  - processPendingBookings (6h): retry every booking with status='pending'
 *    whose meeting is now within the 10-day Skedda window.
 *
 * Idempotent and singleton: relies on globalThis flags so HMR or duplicate
 * imports don't spawn extra timers.
 */

import { ObjectId } from "mongodb";
import { differenceInDays } from "date-fns";
import { getDb } from "./db";
import { findUsersWithExpiringWatch } from "./users";
import { activateWatchForUser } from "./watch";
import { processBookingForEvent } from "./booking-engine";
import { audit } from "./audit";

declare global {
  var __roombooker_cron_started: boolean | undefined;
}

const RENEW_INTERVAL_MS = 24 * 3600 * 1000;
const PENDING_INTERVAL_MS = 6 * 3600 * 1000;
const STARTUP_DELAY_MS = 30 * 1000; // give the server a head start

export async function renewExpiringWatches(): Promise<void> {
  try {
    const within = new Date(Date.now() + 48 * 3600 * 1000);
    const users = await findUsersWithExpiringWatch(within);
    await audit({
      action: "watch_activated",
      details: { cron: "renew", scanned: users.length },
    });
    for (const user of users) {
      try {
        await activateWatchForUser(user._id, { source: "cron_renewal" });
      } catch (err) {
        await audit({
          action: "error",
          userId: user._id,
          details: { where: "cron_renew", message: String(err) },
        });
      }
    }
  } catch (err) {
    console.error("[cron] renewExpiringWatches failed", err);
  }
}

export async function processPendingBookings(): Promise<void> {
  try {
    const db = await getDb();
    const horizon = new Date(Date.now() + 10 * 86400_000);
    const pending = await db
      .collection("bookings")
      .find({
        status: "pending",
        "meeting.startsAt": { $lte: horizon, $gte: new Date() },
      })
      .toArray();

    await audit({
      action: "booking_engine_started",
      details: { cron: "pending_retry", scanned: pending.length },
    });

    for (const b of pending) {
      try {
        await processBookingForEvent({
          iCalUID: b.iCalUID as string,
          googleEventId: b.googleEventId as string,
          userId: new ObjectId((b.userId as ObjectId).toString()),
          meeting: {
            title: b.meeting.title,
            startsAt: new Date(b.meeting.startsAt),
            endsAt: new Date(b.meeting.endsAt),
          },
        });
      } catch (err) {
        await audit({
          action: "error",
          iCalUID: b.iCalUID as string,
          details: { where: "cron_pending", message: String(err) },
        });
      }
    }
  } catch (err) {
    console.error("[cron] processPendingBookings failed", err);
  }
}

export function startCrons(): void {
  if (globalThis.__roombooker_cron_started) return;
  globalThis.__roombooker_cron_started = true;

  console.log("[cron] starting in-process crons (renew=24h, pending=6h)");

  // Run once shortly after boot, then on interval.
  setTimeout(() => {
    void renewExpiringWatches();
    void processPendingBookings();
  }, STARTUP_DELAY_MS);

  setInterval(() => void renewExpiringWatches(), RENEW_INTERVAL_MS);
  setInterval(() => void processPendingBookings(), PENDING_INTERVAL_MS);
}

/**
 * Helper used by the cron itself: how many days ahead is a meeting?
 * Re-exported for tests.
 */
export const _isWithinWindow = (startsAt: Date) =>
  differenceInDays(startsAt, new Date()) <= 10;
