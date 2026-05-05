import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  session.destroy();
  return NextResponse.redirect(new URL("/", process.env.PUBLIC_APP_URL || "http://localhost:3030"), 303);
}
