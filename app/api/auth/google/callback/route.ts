import { NextResponse, type NextRequest } from "next/server";
import { exchangeCodeForTokens, fetchUserInfo } from "@/lib/google";
import { getSession } from "@/lib/session";
import { upsertUserOnLogin } from "@/lib/users";

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

    const dest = user.telephone ? "/dashboard" : "/onboarding";
    return NextResponse.redirect(`${base}${dest}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(`${base}/?error=${encodeURIComponent(msg)}`);
  }
}
