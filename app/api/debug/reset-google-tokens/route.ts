/**
 * Admin tool — wipe a user's stored Google tokens AND their watch state so
 * they can redo the OAuth flow from scratch. Use when a user landed in a
 * broken state: e.g. they granted login scopes but skipped Calendar on the
 * granular consent screen, leaving us with a valid access_token that has
 * zero Calendar permissions ("insufficient permissions" on watch activation).
 *
 * Side effects:
 *  - googleTokens → null   (so /api/auth/google/start gets a fresh consent)
 *  - watchChannelId / watchResourceId / watchExpiry / watchSyncToken → null
 *  - phone, prefs, rules, etc. → kept (so the user doesn't lose their setup)
 *
 * Does NOT call Google's revoke endpoint — we don't have a valid token to
 * revoke anyway, and Google will re-issue a refresh_token on next consent
 * because we always send prompt=consent.
 *
 * Same token-guard as the rest of /api/debug/*.
 *
 * Usage:
 *   curl -X POST "https://roombooker.nmt.ovh/api/debug/reset-google-tokens?secret=$TOKEN&email=callista@muchbetter.ai"
 */

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const expected = process.env.GOOGLE_WEBHOOK_TOKEN;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const email = searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  const db = await getDb();
  const result = await db.collection("users").findOneAndUpdate(
    { email },
    {
      $set: {
        googleTokens: null,
        watchChannelId: null,
        watchResourceId: null,
        watchExpiry: null,
        watchSyncToken: null,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );

  if (!result) {
    return NextResponse.json({ error: "user_not_found", email }, { status: 404 });
  }

  await audit({
    action: "watch_deactivated",
    userId: result._id,
    details: {
      reason: "admin_reset_google_tokens",
      email,
    },
  });

  return NextResponse.json({
    ok: true,
    email,
    message:
      "Tokens et watch effacés. Demande à l'utilisateur de se reconnecter " +
      "via la page d'accueil — Google va re-afficher l'écran de consent. " +
      "Il doit cocher TOUTES les cases (notamment 'Voir et modifier les événements').",
  });
}
