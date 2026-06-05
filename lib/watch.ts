import { ObjectId } from "mongodb";
import { startWatch, stopWatch } from "./calendar";
import { findUserById, setWatchInfo, clearWatchInfo, type UserDoc } from "./users";
import { audit } from "./audit";
import { notifyUser } from "./notify";
import { track } from "./analytics";

function getWebhookConfig() {
  const publicUrl = process.env.PUBLIC_APP_URL;
  const webhookToken = process.env.GOOGLE_WEBHOOK_TOKEN;
  if (!publicUrl) throw new Error("PUBLIC_APP_URL missing");
  if (!webhookToken) throw new Error("GOOGLE_WEBHOOK_TOKEN missing");
  if (publicUrl.startsWith("http://localhost")) {
    throw new Error(
      "PUBLIC_APP_URL doit être HTTPS et publique pour que Google puisse pousser les notifications. " +
      "Utilise ngrok pour le dev local ou déploie l'app.",
    );
  }
  return {
    webhookUrl: publicUrl.replace(/\/$/, "") + "/api/webhooks/calendar",
    webhookToken,
  };
}

export async function activateWatchForUser(
  userId: ObjectId,
  options: { source?: "manual" | "calendar_resync" | "cron_renewal" | "oauth_signin" } = {},
): Promise<void> {
  const source = options.source ?? "manual";

  const user = await findUserById(userId);
  if (!user) throw new Error("User not found");
  if (!user.googleTokens) throw new Error("User has no Google tokens");

  const wasActive = !!(user.watchChannelId && user.watchResourceId);

  // If a watch already exists, stop it first
  if (wasActive) {
    await stopWatch({
      user,
      channelId: user.watchChannelId!,
      resourceId: user.watchResourceId!,
    });
  }

  const { webhookUrl, webhookToken } = getWebhookConfig();
  const watch = await startWatch({ user, webhookUrl, webhookToken });

  await setWatchInfo({
    userId,
    channelId: watch.channelId,
    resourceId: watch.resourceId,
    expiry: watch.expiry,
    syncToken: watch.syncToken,
  });

  await audit({
    action: "watch_activated",
    userId,
    details: { source, expiry: watch.expiry.toISOString(), wasActive },
  });
  await track({
    userId,
    // Distinguish a fresh activation from a renewal so the funnel reads right.
    event: wasActive ? "watch_renewed" : "watch_activated",
    properties: { source, expiry: watch.expiry.toISOString() },
  });

  // Only notify the sales when the re-init was NOT triggered by them.
  //  - "manual"       → they clicked the button on the dashboard, they know
  //  - "oauth_signin" → they just signed in, they're actively looking at us
  // The notify is intended for SILENT renewals (cron, calendar_resync).
  if (source !== "manual" && source !== "oauth_signin" && wasActive) {
    const reason =
      source === "cron_renewal"
        ? "Surveillance Calendar renouvelée auto"
        : "Surveillance Calendar re-initialisée auto";
    await notifyUser({
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        telephone: user.telephone,
        notifPrefs: user.notifPrefs,
      },
      type: "watch_resync",
      smsText: `RoomBooker : ${reason}. Aucune action requise.`,
      emailSubject: "Surveillance Calendar réinitialisée",
      emailHtml: `<p>${reason}. Rien à faire — les meetings continuent d'être bookés normalement.</p>`,
    });
  }
}

export async function deactivateWatchForUser(userId: ObjectId): Promise<void> {
  const user = await findUserById(userId);
  if (!user) return;
  const hadActiveWatch = !!(user.watchChannelId && user.watchResourceId);
  if (hadActiveWatch) {
    await stopWatch({
      user,
      channelId: user.watchChannelId!,
      resourceId: user.watchResourceId!,
    });
  }
  await clearWatchInfo(userId);
  await audit({
    action: "watch_deactivated",
    userId,
    details: { hadActiveWatch },
  });
  await track({
    userId,
    event: "watch_deactivated",
    properties: { hadActiveWatch },
  });
}

export function watchExpiringSoon(user: UserDoc, withinMs = 48 * 3600 * 1000): boolean {
  if (!user.watchExpiry) return false;
  return user.watchExpiry.getTime() - Date.now() < withinMs;
}
