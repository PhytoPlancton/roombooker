import { ObjectId } from "mongodb";
import { startWatch, stopWatch } from "./calendar";
import { findUserById, setWatchInfo, clearWatchInfo, type UserDoc } from "./users";
import { audit } from "./audit";
import { notifyUser } from "./notify";

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
  options: { source?: "manual" | "calendar_resync" | "cron_renewal" } = {},
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

  // Only notify the sales when the re-init was NOT triggered by them
  // (manual click on dashboard = they already know).
  if (source !== "manual" && wasActive) {
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
        notifChannels: user.notifChannels,
      },
      smsText: `RoomBooker: ${reason}. Aucune action requise.`,
      emailSubject: "RoomBooker — surveillance Calendar re-initialisée",
      emailHtml: `<p>Bonjour ${user.firstName},</p><p>${reason}. Tes futurs meetings continuent d'être bookés normalement, tu n'as rien à faire.</p>`,
    });
  }
}

export async function deactivateWatchForUser(userId: ObjectId): Promise<void> {
  const user = await findUserById(userId);
  if (!user) return;
  if (user.watchChannelId && user.watchResourceId) {
    await stopWatch({
      user,
      channelId: user.watchChannelId,
      resourceId: user.watchResourceId,
    });
  }
  await clearWatchInfo(userId);
}

export function watchExpiringSoon(user: UserDoc, withinMs = 48 * 3600 * 1000): boolean {
  if (!user.watchExpiry) return false;
  return user.watchExpiry.getTime() - Date.now() < withinMs;
}
