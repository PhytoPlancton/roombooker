/**
 * Admin diagnostic — list every Google Calendar a user has access to, plus
 * a count of recent events on each one. Lets us confirm whether the user's
 * meetings live on their `primary` (which is the only calendar our watch
 * subscribes to) or on a secondary/shared/delegated calendar that the watch
 * would miss.
 *
 * Use when a user reports "the booking auto never fires for me" despite a
 * green watch — often the events sit on a non-primary calendar (team
 * calendar, customer-meetings calendar, delegated executive calendar, etc.)
 * and our watch never sees them.
 *
 * Same token-guard as the rest of /api/debug/*.
 *
 * Usage:
 *   curl "https://roombooker.nmt.ovh/api/debug/list-calendars?secret=$TOKEN&email=callista.durepaire@muchbetter.ai" | jq
 */

import { NextResponse, type NextRequest } from "next/server";
import { google } from "googleapis";
import { findUserByEmail, decryptTokens } from "@/lib/users";

export async function GET(req: NextRequest) {
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

  const user = await findUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "user_not_found", email }, { status: 404 });
  }
  if (!user.googleTokens) {
    return NextResponse.json(
      { error: "no_google_tokens", email, hint: "User n'a pas (encore) reconnecté son compte Google." },
      { status: 400 },
    );
  }

  const tokens = decryptTokens(user.googleTokens);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "oauth_env_missing" }, { status: 500 });
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiresAt.getTime(),
  });
  const cal = google.calendar({ version: "v3", auth: oauth2 });

  // 1) Calendars the user has access to. `primary: true` means it's the one
  //    we currently watch.
  const list = await cal.calendarList.list({ maxResults: 250 });
  const items = list.data.items ?? [];

  // 2) For each calendar, count recent events (past 30 days) so we can see
  //    which ones the user actually uses for work.
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const calendars = await Promise.all(
    items.map(async (c) => {
      let recentEventCount: number | null = null;
      try {
        const events = await cal.events.list({
          calendarId: c.id!,
          timeMin: since,
          maxResults: 50,
          singleEvents: true,
        });
        recentEventCount = (events.data.items ?? []).length;
      } catch (err) {
        // Some calendars (e.g. holidays, birthdays) refuse events.list — fine.
        recentEventCount = null;
      }
      return {
        id: c.id,
        summary: c.summary,
        primary: c.primary === true,
        accessRole: c.accessRole, // "owner" | "writer" | "reader" | "freeBusyReader"
        selected: c.selected !== false, // whether the user has it ticked in the UI
        recentEventCount,
      };
    }),
  );

  // Sort: primary first, then by recent activity desc.
  calendars.sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1;
    return (b.recentEventCount ?? -1) - (a.recentEventCount ?? -1);
  });

  return NextResponse.json({
    email: user.email,
    watch: {
      // Just to be explicit about what we currently watch.
      watchedCalendarId: "primary",
      watchActive: !!user.watchChannelId,
    },
    calendarCount: calendars.length,
    calendars,
    hint:
      "Si la primary a recentEventCount=0 mais qu'une autre calendar avec accessRole=writer/owner " +
      "a beaucoup d'events, le user met ses meetings ailleurs que sur primary — le watch les rate.",
  });
}
