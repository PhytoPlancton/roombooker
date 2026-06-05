/**
 * PostHog analytics — server-side instrumentation for Roombooker.
 *
 * Why server-side first: every event that matters (booking attempted,
 * confirmed, failed, cancelled, notification sent, watch activated...)
 * happens server-side. Client-side page views can come later via
 * posthog-js if we want richer funnels.
 *
 * Activate by setting POSTHOG_API_KEY (project key, also exposed as
 * NEXT_PUBLIC_POSTHOG_KEY when we add client-side). POSTHOG_HOST
 * defaults to https://us.i.posthog.com — set it explicitly to the EU
 * cloud if needed (https://eu.i.posthog.com). If the key is missing,
 * track()/identify() become no-ops so the rest of the app keeps working
 * in local dev without PostHog wired up.
 *
 * Distinct ID convention: we always use the user's MongoDB _id as a
 * string. Each user identify() call sends their email + name as person
 * properties so PostHog's "Persons" view stays human-readable.
 */

import { PostHog } from "posthog-node";
import type { ObjectId } from "mongodb";

declare global {
  // eslint-disable-next-line no-var
  var __posthog_client: PostHog | null | undefined;
}

function getClient(): PostHog | null {
  if (global.__posthog_client !== undefined) return global.__posthog_client;
  const key = process.env.POSTHOG_API_KEY;
  if (!key) {
    global.__posthog_client = null;
    return null;
  }
  global.__posthog_client = new PostHog(key, {
    host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
    // Serverless-friendly: flush each event as it comes. Slight throughput
    // cost vs. batching, but avoids losing events on cold-stop and keeps
    // the audit log + posthog in lockstep.
    flushAt: 1,
    flushInterval: 0,
  });
  return global.__posthog_client;
}

export type AnalyticsEvent =
  // Auth & onboarding
  | "user_signed_in"
  | "user_signed_up"
  | "onboarding_phone_added"
  | "onboarding_rules_set"
  // Calendar watch lifecycle
  | "watch_activated"
  | "watch_renewed"
  | "watch_deactivated"
  // Meeting evaluation (before booking)
  | "meeting_received"
  | "meeting_skipped"
  // Booking lifecycle
  | "booking_engine_started"
  | "booking_succeeded"
  | "booking_failed"
  | "booking_deferred"
  | "booking_cancelled_by_user"
  | "force_resync_clicked"
  // Feature usage
  | "buffer_applied"
  | "buffer_fallback_used"
  | "room_exception_matched"
  // Notifications
  | "notification_sent"
  | "notification_failed"
  // Settings
  | "rule_updated"
  | "room_exception_changed"
  | "room_priority_changed"
  | "buffer_toggled"
  | "notif_pref_changed"
  | "channel_tested"
  // Admin
  | "user_deleted_by_admin"
  | "channel_killswitch_toggled";

function toDistinctId(userId: ObjectId | string | null | undefined): string | null {
  if (!userId) return null;
  return typeof userId === "string" ? userId : userId.toString();
}

/**
 * Fire-and-forget event tracking. Awaiting is OPTIONAL: in long-lived
 * processes we let the flush queue drain on its own; in serverless we
 * already configured flushAt=1 so PostHog ships the event before this
 * function returns from `await`. Errors are swallowed — analytics
 * should never break the request path.
 */
export async function track(args: {
  userId: ObjectId | string | null;
  event: AnalyticsEvent;
  properties?: Record<string, unknown>;
}): Promise<void> {
  const c = getClient();
  if (!c) return;
  const distinctId = toDistinctId(args.userId) ?? "anonymous";
  try {
    c.capture({
      distinctId,
      event: args.event,
      properties: args.properties ?? {},
    });
  } catch (err) {
    console.error("[posthog] track failed", { event: args.event, err });
  }
}

/**
 * Bind a stable identity to a distinct_id so the Persons view shows
 * human-readable info (email, name) and cross-session funnels work.
 * Call this on signin/signup; cheap to re-call (PostHog upserts the
 * person record).
 */
export async function identify(args: {
  userId: ObjectId | string;
  email: string;
  firstName?: string;
  lastName?: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  const c = getClient();
  if (!c) return;
  const distinctId = toDistinctId(args.userId);
  if (!distinctId) return;
  try {
    c.identify({
      distinctId,
      properties: {
        email: args.email,
        firstName: args.firstName ?? null,
        lastName: args.lastName ?? null,
        name: `${args.firstName ?? ""} ${args.lastName ?? ""}`.trim() || args.email,
        ...(args.properties ?? {}),
      },
    });
  } catch (err) {
    console.error("[posthog] identify failed", err);
  }
}

/**
 * Useful in Next.js route handlers / server actions that may exit before
 * the background flush. Awaits the in-flight queue so we don't drop
 * events when the request finishes.
 */
export async function flushAnalytics(): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.flush();
  } catch (err) {
    console.error("[posthog] flush failed", err);
  }
}
