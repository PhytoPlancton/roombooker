"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { activateWatchForUser, deactivateWatchForUser } from "@/lib/watch";

export async function activateWatchAction(): Promise<void> {
  let success = false;
  try {
    const { userId } = await requireUser();
    await activateWatchForUser(userId);
    success = true;
  } catch (err) {
    const msg = encodeURIComponent(err instanceof Error ? err.message : "unknown_error");
    redirect(`/dashboard?error=${msg}`);
  }
  if (success) {
    revalidatePath("/dashboard");
    redirect("/dashboard?success=watch_activated");
  }
}

export async function deactivateWatchAction(): Promise<void> {
  let success = false;
  try {
    const { userId } = await requireUser();
    await deactivateWatchForUser(userId);
    success = true;
  } catch (err) {
    const msg = encodeURIComponent(err instanceof Error ? err.message : "unknown_error");
    redirect(`/dashboard?error=${msg}`);
  }
  if (success) {
    revalidatePath("/dashboard");
    redirect("/dashboard?success=watch_deactivated");
  }
}
