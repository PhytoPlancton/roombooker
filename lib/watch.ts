import { ObjectId } from "mongodb";
import { startWatch, stopWatch } from "./calendar";
import { findUserById, setWatchInfo, clearWatchInfo, type UserDoc } from "./users";

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

export async function activateWatchForUser(userId: ObjectId): Promise<void> {
  const user = await findUserById(userId);
  if (!user) throw new Error("User not found");
  if (!user.googleTokens) throw new Error("User has no Google tokens");

  // If a watch already exists, stop it first
  if (user.watchChannelId && user.watchResourceId) {
    await stopWatch({
      user,
      channelId: user.watchChannelId,
      resourceId: user.watchResourceId,
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
