import { NextResponse, type NextRequest } from "next/server";
import { exchangeCodeForTokens, fetchUserInfo } from "@/lib/google";
import { getSession } from "@/lib/session";
import { upsertUserOnLogin } from "@/lib/users";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, req.url));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/?error=missing_params", req.url));
  }

  const session = await getSession();
  if (!session.oauthState || session.oauthState !== state) {
    return NextResponse.redirect(new URL("/?error=invalid_state", req.url));
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

    // If onboarding not done (no telephone), go to onboarding. Otherwise dashboard.
    const dest = user.telephone ? "/dashboard" : "/onboarding";
    return NextResponse.redirect(new URL(dest, req.url));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(msg)}`, req.url));
  }
}
