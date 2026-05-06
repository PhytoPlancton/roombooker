import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { cancelSkeddaBookingHttp } from "@/lib/skedda-http";

/**
 * Admin endpoint to cancel a Skedda booking.
 * Looks up the cancelToken + cookies from the bookings collection.
 *
 * Usage: GET /api/debug/skedda-cancel?secret=<GOOGLE_WEBHOOK_TOKEN>&id=<skeddaBookingRef>
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const expected = process.env.GOOGLE_WEBHOOK_TOKEN;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const skeddaId = searchParams.get("id");
  if (!skeddaId) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const db = await getDb();
  const booking = await db
    .collection("bookings")
    .findOne({ skeddaBookingRef: skeddaId });

  if (!booking) {
    return NextResponse.json({ error: "booking not found in db" }, { status: 404 });
  }

  if (!booking.skeddaCancelToken || !booking.skeddaCookies) {
    return NextResponse.json(
      { error: "booking has no cancel credentials stored" },
      { status: 400 },
    );
  }

  const result = await cancelSkeddaBookingHttp({
    skeddaBookingId: skeddaId,
    cancelToken: booking.skeddaCancelToken,
    cookies: booking.skeddaCookies,
  });

  if (result.success) {
    await db.collection("bookings").updateOne(
      { _id: booking._id },
      { $set: { status: "cancelled", updatedAt: new Date() } },
    );
  }

  return NextResponse.json(result);
}
