/**
 * Module unifié pour envoyer des notifs (SMS, email).
 * Slack désactivé en MVP (SLACK_ENABLED=false).
 */

import { audit } from "./audit";
import { DEFAULT_NOTIF_PREFS, type NotifType, type NotifPrefs } from "./users";
import type { ObjectId } from "mongodb";

interface SmsArgs {
  phoneNumber: string; // E.164 ex: +33612345678 OR iCloud email
  text: string;
}

interface EmailArgs {
  to: { email: string; name?: string };
  subject: string;
  htmlContent: string;
}

interface EdjSmsResponse {
  success: boolean;
  sent?: Array<unknown> | null;
  failed?: Array<{ address: string; status: string; error: string }> | null;
}

export async function sendSms(args: SmsArgs): Promise<{ success: boolean; error?: string }> {
  const token = process.env.EDJ_SMS_API_TOKEN;
  if (!token) return { success: false, error: "EDJ_SMS_API_TOKEN missing" };

  try {
    const res = await fetch("https://api.edj-labs.com/messages/send", {
      method: "POST",
      headers: {
        "X-Api-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ address: args.phoneNumber, text: args.text }),
    });

    // EDJ Labs returns HTTP 200 even when the gateway fails. The real status
    // is in the `failed` array. We must inspect it.
    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    const json = (await res.json()) as EdjSmsResponse;
    if (json.failed && json.failed.length > 0) {
      const f = json.failed[0];
      return { success: false, error: `gateway: ${f.error} (status=${f.status})` };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return { success: false, error: message };
  }
}

export async function sendEmail(args: EmailArgs): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "RoomBooker";

  if (!apiKey) return { success: false, error: "BREVO_API_KEY missing" };
  if (!senderEmail) {
    console.warn("[email] BREVO_SENDER_EMAIL not set, skipping email");
    return { success: false, error: "BREVO_SENDER_EMAIL missing" };
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [args.to],
        subject: args.subject,
        htmlContent: args.htmlContent,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[email] failed", { status: res.status, body });
      return { success: false, error: `${res.status}: ${body}` };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[email] exception", { message });
    return { success: false, error: message };
  }
}

/**
 * Sends a notification of a given type via the channel(s) the user has enabled
 * for that type. Audits each delivery attempt.
 */
export async function notifyUser(args: {
  user: {
    _id?: ObjectId;
    email: string;
    firstName: string;
    telephone: string | null;
    notifPrefs?: NotifPrefs;
  };
  type: NotifType;
  iCalUID?: string;
  smsText: string;
  emailSubject: string;
  emailHtml: string;
}): Promise<void> {
  const { user, type, smsText, emailSubject, emailHtml, iCalUID } = args;
  const prefs = (user.notifPrefs ?? DEFAULT_NOTIF_PREFS)[type];

  if (prefs.sms && user.telephone) {
    const r = await sendSms({ phoneNumber: user.telephone, text: smsText });
    await audit({
      action: r.success ? "notify_sent" : "error",
      userId: user._id ?? null,
      iCalUID: iCalUID ?? null,
      details: { channel: "sms", type, to: user.telephone, success: r.success, error: r.error },
    });
  }
  if (prefs.email) {
    const r = await sendEmail({
      to: { email: user.email, name: user.firstName },
      subject: emailSubject,
      htmlContent: emailHtml,
    });
    await audit({
      action: r.success ? "notify_sent" : "error",
      userId: user._id ?? null,
      iCalUID: iCalUID ?? null,
      details: { channel: "email", type, to: user.email, success: r.success, error: r.error },
    });
  }
}
