import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const expected = process.env.GOOGLE_WEBHOOK_TOKEN;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);
  const db = await getDb();
  const docs = await db
    .collection("auditLog")
    .find({})
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();

  return NextResponse.json({ count: docs.length, entries: docs });
}
