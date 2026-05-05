import type { SessionOptions } from "iron-session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";

export interface SessionData {
  userId?: string;
  email?: string;
  oauthState?: string;
}

function getSessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password) {
    throw new Error("SESSION_SECRET missing — generate via: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  }
  if (password.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 chars");
  }
  return {
    password,
    cookieName: "rb_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 jours
    },
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, getSessionOptions());
}

export async function requireUser(): Promise<{ userId: ObjectId; email: string }> {
  const session = await getSession();
  if (!session.userId || !session.email) {
    throw new UnauthorizedError();
  }
  return { userId: new ObjectId(session.userId), email: session.email };
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}
