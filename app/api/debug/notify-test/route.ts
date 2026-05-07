import { NextResponse, type NextRequest } from "next/server";
import { findUserByEmail } from "@/lib/users";
import { sendSms, sendEmail } from "@/lib/notify";

/**
 * Debug helper to test notification delivery without waiting for a real meeting.
 *
 * GET /api/debug/notify-test?secret=<token>&email=<sales-email>&channel=sms|email|both
 *
 * Returns a JSON with the result of each channel attempted, so you can see
 * whether EDJ Labs or Brevo is up and accepting your number/email.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const expected = process.env.GOOGLE_WEBHOOK_TOKEN;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const email = searchParams.get("email");
  if (!email) {
    return NextResponse.json(
      { error: "missing email param. Pass ?email=<sales-email>" },
      { status: 400 },
    );
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "user not found", email }, { status: 404 });
  }

  const channel = (searchParams.get("channel") || "both").toLowerCase();
  const text = `RoomBooker test ${new Date().toISOString().slice(11, 19)}`;

  const result: { sms?: unknown; email?: unknown } = {};

  if (channel === "sms" || channel === "both") {
    if (!user.telephone) {
      result.sms = { skipped: "no telephone in profile" };
    } else {
      result.sms = await sendSms({ phoneNumber: user.telephone, text });
    }
  }

  if (channel === "email" || channel === "both") {
    if (!process.env.BREVO_SENDER_EMAIL) {
      result.email = { skipped: "BREVO_SENDER_EMAIL not configured" };
    } else {
      result.email = await sendEmail({
        to: { email: user.email, name: user.firstName },
        subject: "RoomBooker — test",
        htmlContent: `<p>${text}</p>`,
      });
    }
  }

  return NextResponse.json({
    user: { email: user.email, telephone: user.telephone },
    result,
  });
}
