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

/**
 * Strip diacritics so SMS stays in 7-bit GSM-03.38 encoding (160 chars/credit).
 * Without this, a single "é" forces UCS-2 → 70 chars/credit → 2 SMS per booking.
 *   "Mémoire · créneau" → "Memoire . creneau"
 * Applied centrally at the gateway so every caller is consistent.
 */
function stripAccents(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // A few non-GSM punctuation chars worth replacing too — otherwise they
    // also force UCS-2 encoding and halve the per-SMS character budget.
    .replace(/[«»]/g, '"')        // « »  → "
    .replace(/[‘’]/g, "'")        // ‘ ’  → '
    .replace(/[“”]/g, '"')        // " "  → "
    .replace(/[–—]/g, "-")        // – —  → -
    .replace(/[·•]/g, ".");       // · •  → .
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
      body: JSON.stringify({ address: args.phoneNumber, text: stripAccents(args.text) }),
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
  // EDJ Labs Emailing API. Sender is enforced server-side
  // (postmaster@edj-labs.com); the display name is configured in the EDJ
  // dashboard, not per-request.
  const token = process.env.EDJ_EMAIL_API_TOKEN;
  if (!token) return { success: false, error: "EDJ_EMAIL_API_TOKEN missing" };

  try {
    const res = await fetch("https://api.edj-labs.com/email/send", {
      method: "POST",
      headers: {
        "X-Api-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipients: [args.to.email],
        subject: args.subject,
        html: args.htmlContent,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[email] failed", { status: res.status, body: body.slice(0, 300) });
      return { success: false, error: `${res.status}: ${body.slice(0, 200)}` };
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
  // Per-type fallback: if the user's stored prefs predate this type (e.g.
  // booking_cancelled added in v0.10.14), fall back to the default for THAT
  // type only — not the whole prefs object — so we never crash on missing keys.
  const prefs = user.notifPrefs?.[type] ?? DEFAULT_NOTIF_PREFS[type];

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
