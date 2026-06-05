"use client";

/**
 * Client-side PostHog bootstrap.
 *
 * Why this exists separately from lib/analytics.ts: posthog-js is browser-only
 * and pulls in a sizable runtime — we want it inside a "use client" island
 * that only renders inside the dashboard, not on the public landing page where
 * SEO + first paint matter.
 *
 * Activation: set NEXT_PUBLIC_POSTHOG_KEY. If unset, the provider becomes a
 * no-op — the rest of the dashboard works exactly the same.
 *
 * What we track here:
 *  - Page views (Next.js App Router doesn't auto-trigger them, so we listen
 *    to pathname changes)
 *  - Custom UI events when called via `posthog.capture(...)` from inside the
 *    dashboard components
 *
 * Identification: when `userId` is provided we bind the browser session to
 * the server-side distinct_id, so client events show up under the same
 * Person as the server events (booking_succeeded, etc.).
 */

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as Provider } from "posthog-js/react";

let initDone = false;
function maybeInit(): boolean {
  if (typeof window === "undefined") return false;
  if (initDone) return true;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return false;
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    // We control page view firing manually so it works with App Router.
    capture_pageview: false,
    // Session replays are part of PostHog's free tier — record everything,
    // we can sample down later if/when volume becomes an issue.
    session_recording: { recordCrossOriginIframes: false },
    // Respect Do-Not-Track / EU consent without extra config.
    respect_dnt: true,
    persistence: "localStorage+cookie",
  });
  initDone = true;
  return true;
}

/**
 * Bind the browser session to the server-side user identity. Call at the
 * top of the dashboard layout when we have a userId in session.
 */
function PostHogIdentify({
  userId,
  email,
}: {
  userId: string | null;
  email: string | null;
}) {
  useEffect(() => {
    if (!maybeInit()) return;
    if (userId) {
      posthog.identify(userId, email ? { email } : undefined);
    } else {
      posthog.reset();
    }
  }, [userId, email]);
  return null;
}

/**
 * Track Next.js App Router page transitions manually. Without this the
 * dashboard would show as a single page view per session.
 */
function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!maybeInit()) return;
    const query = searchParams?.toString();
    const url = pathname + (query ? `?${query}` : "");
    posthog.capture("$pageview", { $current_url: window.location.origin + url });
  }, [pathname, searchParams]);
  return null;
}

export function PostHogClientProvider({
  children,
  userId,
  email,
}: {
  children: React.ReactNode;
  userId: string | null;
  email: string | null;
}) {
  // If no key, render children directly without the provider tree so we
  // don't carry the runtime cost.
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return <>{children}</>;
  }
  maybeInit();
  return (
    <Provider client={posthog}>
      <PostHogIdentify userId={userId} email={email} />
      <PageViewTracker />
      {children}
    </Provider>
  );
}
