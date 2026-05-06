import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { cancelSkeddaBookingHttp } from "@/lib/skedda-http";

/**
 * Cancels every Skedda booking that was created via this app and for which
 * we have stored the cancel credentials.
 *
 * GET /api/debug/skedda-cancel-all?secret=<GOOGLE_WEBHOOK_TOKEN>
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const expected = process.env.GOOGLE_WEBHOOK_TOKEN;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const candidates = await db
    .collection("bookings")
    .find({
      status: "booked",
      skeddaBookingRef: { $ne: null },
      skeddaCancelToken: { $ne: null },
      skeddaCookies: { $ne: null },
    })
    .toArray();

  const results: Array<{ skeddaId: string; success: boolean; errorMessage?: string }> = [];
  for (const b of candidates) {
    const res = await cancelSkeddaBookingHttp({
      skeddaBookingId: b.skeddaBookingRef as string,
      cancelToken: b.skeddaCancelToken as string,
      cookies: b.skeddaCookies as string,
    });
    results.push({ skeddaId: b.skeddaBookingRef as string, ...res });
    if (res.success) {
      await db.collection("bookings").updateOne(
        { _id: b._id },
        { $set: { status: "cancelled", updatedAt: new Date() } },
      );
    }
  }

  return NextResponse.json({
    attempted: candidates.length,
    succeeded: results.filter((r) => r.success).length,
    results,
  });
}
