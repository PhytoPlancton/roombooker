import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { buildAuthUrl } from "@/lib/google";
import { getSession } from "@/lib/session";

export async function GET() {
  const state = randomBytes(16).toString("hex");

  // Store state in session for CSRF check on callback
  const session = await getSession();
  session.oauthState = state;
  await session.save();

  const url = buildAuthUrl(state);
  return NextResponse.redirect(url);
}
