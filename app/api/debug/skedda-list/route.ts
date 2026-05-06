import { NextResponse, type NextRequest } from "next/server";

/**
 * Lists all Skedda bookings in the next N days. Read-only.
 * GET /api/debug/skedda-list?secret=<token>&days=14
 */
const SKEDDA_BASE = "https://antlerfrance.skedda.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
const ROOM_NAMES: Record<string, string> = {
  "1117977": "Jupiter",
  "1117978": "Venus",
  "1117994": "Earth",
  "1117995": "Mars",
  "1119104": "Mercury",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const expected = process.env.GOOGLE_WEBHOOK_TOKEN;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const days = Math.min(parseInt(searchParams.get("days") || "14", 10), 60);
  const start = new Date().toISOString().slice(0, 10) + "T00:00:00";
  const end = new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10) + "T23:59:59";

  // Bootstrap a session
  const sessionResp = await fetch(`${SKEDDA_BASE}/booking`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
  });
  const cookies = sessionResp.headers.getSetCookie?.() || [];
  const cookieHeader = cookies.map((c) => c.split(";")[0]).join("; ");
  const html = await sessionResp.text();
  const m = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  if (!m) {
    return NextResponse.json({ error: "could not bootstrap Skedda session" }, { status: 502 });
  }
  const csrfToken = m[1];

  const listResp = await fetch(
    `${SKEDDA_BASE}/bookingslists?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    {
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        Referer: `${SKEDDA_BASE}/booking`,
        Cookie: cookieHeader,
        "X-Skedda-RequestVerificationToken": csrfToken,
      },
    },
  );

  if (!listResp.ok) {
    return NextResponse.json({ error: "skedda list failed", status: listResp.status }, { status: 502 });
  }

  const data = (await listResp.json()) as { bookings?: Array<Record<string, unknown>> };
  const bookings = (data.bookings || []).map((b) => ({
    id: b.id,
    title: b.title,
    start: b.start,
    end: b.end,
    spaces: (b.spaces as string[] | undefined)?.map((s) => ROOM_NAMES[s] || s),
    venueuser: b.venueuser,
  }));

  return NextResponse.json({ count: bookings.length, window: { start, end }, bookings });
}
