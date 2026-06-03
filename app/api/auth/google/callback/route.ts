import { NextResponse, type NextRequest } from "next/server";
import { exchangeCodeForTokens, fetchUserInfo, hasRequiredScope } from "@/lib/google";
import { getSession } from "@/lib/session";
import { upsertUserOnLogin } from "@/lib/users";
import { activateWatchForUser } from "@/lib/watch";
import { audit } from "@/lib/audit";

function publicBase(req: NextRequest): string {
  // Always prefer PUBLIC_APP_URL — req.url reflects the internal container address (0.0.0.0:3000)
  // when behind a reverse proxy (Traefik), causing redirects to a non-public URL.
  const base = process.env.PUBLIC_APP_URL;
  if (base) return base.replace(/\/$/, "");
  return new URL(req.url).origin;
}

export async function GET(req: NextRequest) {
  const base = publicBase(req);
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${base}/?error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${base}/?error=missing_params`);
  }

  const session = await getSession();
  if (!session.oauthState || session.oauthState !== state) {
    return NextResponse.redirect(`${base}/?error=invalid_state`);
  }
  // Consume the state — it must not be re-usable
  session.oauthState = undefined;

  try {
    const tokens = await exchangeCodeForTokens(code);

    // Hard-stop if the user un-ticked the Calendar permission on the consent
    // screen (Google lets them do this per-scope since 2020). Without
    // calendar.events the watch can't be created and no booking will ever
    // fire — better to refuse the login than save a half-broken user doc
    // that fails silently later.
    if (!hasRequiredScope(tokens.grantedScopes)) {
      const profile = await fetchUserInfo(tokens.accessToken).catch(() => null);
      await audit({
        action: "error",
        details: {
          where: "oauth_callback",
          reason: "missing_calendar_scope",
          email: profile?.email ?? null,
          grantedScopes: tokens.grantedScopes,
        },
      });
      await session.save();
      return NextResponse.redirect(`${base}/?error=missing_calendar_scope`);
    }

    const profile = await fetchUserInfo(tokens.accessToken);

    const user = await upsertUserOnLogin({
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      tokens,
    });

    session.userId = user._id.toString();
    session.email = user.email;
    await session.save();

    // Auto-activate the Google Calendar watch right after signin. The
    // historical UX where the user had to manually click "Activer la
    // surveillance" on the dashboard was a footgun — every new signup
    // landed on a dead dashboard and many never realised they had to
    // press a button. Now the watch is up by the time they arrive.
    //
    // Idempotent: if a watch already exists (returning user re-OAuthing
    // because tokens were reset or refreshed), activateWatchForUser
    // stops the old channel before creating a new one. Failures here
    // do NOT block the login — the user lands on the dashboard either
    // way and can retry from the UI if needed.
    const watchExpiry = user.watchExpiry ? new Date(user.watchExpiry) : null;
    const watchActive = !!user.watchChannelId && !!watchExpiry && watchExpiry.getTime() > Date.now();
    if (!watchActive) {
      try {
        await activateWatchForUser(user._id, { source: "oauth_signin" });
      } catch (err) {
        await audit({
          action: "error",
          userId: user._id,
          details: {
            where: "oauth_callback:auto_activate_watch",
            message: err instanceof Error ? err.message : String(err),
          },
        });
        // fall through — user can still hit "Activer" manually from dashboard
      }
    }

    const dest = user.telephone ? "/dashboard" : "/onboarding";
    return NextResponse.redirect(`${base}${dest}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(`${base}/?error=${encodeURIComponent(msg)}`);
  }
}
