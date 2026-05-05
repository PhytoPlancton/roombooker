/**
 * Module unifié pour envoyer des notifs (SMS, email).
 * Slack désactivé en MVP (SLACK_ENABLED=false).
 */

interface SmsArgs {
  phoneNumber: string; // E.164 ex: +33612345678
  text: string;
}

interface EmailArgs {
  to: { email: string; name?: string };
  subject: string;
  htmlContent: string;
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
    if (!res.ok) {
      const body = await res.text();
      console.error("[sms] failed", { status: res.status, body });
      return { success: false, error: `${res.status}: ${body}` };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[sms] exception", { message });
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
 * Envoie une notif au sales sur tous ses canaux configurés.
 */
export async function notifyUser(args: {
  user: {
    email: string;
    firstName: string;
    telephone: string | null;
    notifChannels: ("sms" | "email")[];
  };
  smsText: string;
  emailSubject: string;
  emailHtml: string;
}): Promise<void> {
  const { user, smsText, emailSubject, emailHtml } = args;
  const tasks: Promise<unknown>[] = [];

  if (user.notifChannels.includes("sms") && user.telephone) {
    tasks.push(sendSms({ phoneNumber: user.telephone, text: smsText }));
  }
  if (user.notifChannels.includes("email")) {
    tasks.push(
      sendEmail({
        to: { email: user.email, name: user.firstName },
        subject: emailSubject,
        htmlContent: emailHtml,
      }),
    );
  }

  await Promise.allSettled(tasks);
}
