/**
 * Tiny self-check for the PostHog integration. Hits this endpoint to verify
 *  - the container picked up POSTHOG_API_KEY / NEXT_PUBLIC_POSTHOG_KEY
 *  - the host config looks sensible
 *  - the running build is at least v0.11.0 (the field shape itself proves it,
 *    since this file ships in v0.11.x and later)
 *
 * Same token-guard as the rest of /api/debug/*.
 *
 *   curl "https://roombooker.nmt.ovh/api/debug/posthog-status?secret=$TOKEN"
 */

import { NextResponse, type NextRequest } from "next/server";
import { track, flushAnalytics } from "@/lib/analytics";

function mask(v: string | undefined): string | null {
  if (!v) return null;
  if (v.length < 8) return "(too short)";
  return v.slice(0, 6) + "…" + v.slice(-3);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const expected = process.env.GOOGLE_WEBHOOK_TOKEN;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Also fire a synthetic event so PostHog flips from "waiting" to "events
  // received". This is intentional — admins hit this URL to verify the
  // pipe; if the pipe works, the synthetic event will show up in the
  // Activity → Live events view within seconds.
  const fire = searchParams.get("fire") === "1";
  if (fire) {
    await track({
      userId: "system",
      event: "user_signed_in", // any valid AnalyticsEvent will do for the smoke test
      properties: { synthetic: true, source: "debug_posthog_status" },
    });
    await flushAnalytics();
  }

  return NextResponse.json({
    serverKey: {
      present: !!process.env.POSTHOG_API_KEY,
      preview: mask(process.env.POSTHOG_API_KEY),
      expectedPrefix: "phc_",
      looksRight: (process.env.POSTHOG_API_KEY ?? "").startsWith("phc_"),
    },
    clientKey: {
      present: !!process.env.NEXT_PUBLIC_POSTHOG_KEY,
      preview: mask(process.env.NEXT_PUBLIC_POSTHOG_KEY),
      looksRight: (process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "").startsWith("phc_"),
    },
    host: {
      server: process.env.POSTHOG_HOST ?? "(default: https://us.i.posthog.com)",
      client: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "(default: https://us.i.posthog.com)",
    },
    syntheticEventFired: fire,
    hint: fire
      ? "Vérifie PostHog → Activity → Live events dans 5-10s. Si l'event 'user_signed_in' avec source='debug_posthog_status' apparaît, la pipe fonctionne."
      : "Ajoute &fire=1 à l'URL pour envoyer un event de test et vérifier la pipe end-to-end.",
  });
}
