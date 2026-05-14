import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";

// Minimum scope set: calendar.events covers list + watch + patch on the
// user's primary calendar — everything the app needs (sync, push, location
// update). calendar.readonly was redundant and broader than necessary.
// Keeping the scope list tight makes Google verification simpler too.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export function getOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth env vars missing (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function buildAuthUrl(state: string): string {
  const oauth2 = getOAuthClient();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force refresh_token return
    scope: GOOGLE_SCOPES,
    state,
    include_granted_scopes: true,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2 = getOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Missing tokens in Google response (was the user prompted for consent?)");
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000),
  };
}

export async function fetchUserInfo(accessToken: string) {
  const oauth2 = getOAuthClient();
  oauth2.setCredentials({ access_token: accessToken });
  const userinfo = google.oauth2({ version: "v2", auth: oauth2 });
  const { data } = await userinfo.userinfo.get();
  return {
    email: data.email!,
    firstName: data.given_name || "",
    lastName: data.family_name || "",
  };
}
