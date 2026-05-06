"use server";

import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { activateWatchForUser, deactivateWatchForUser } from "@/lib/watch";
import { releaseBookingByIdAsUser } from "@/lib/release-booking";

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

export async function cancelBookingAction(formData: FormData): Promise<void> {
  const { userId } = await requireUser();
  const raw = formData.get("bookingId");
  if (typeof raw !== "string") {
    redirect("/dashboard?error=missing_id");
  }
  let bookingId: ObjectId;
  try {
    bookingId = new ObjectId(raw);
  } catch {
    redirect("/dashboard?error=invalid_id");
  }
  const result = await releaseBookingByIdAsUser(bookingId, userId);
  revalidatePath("/dashboard");
  if (result.ok) {
    redirect("/dashboard?success=cancelled");
  }
  const reason = encodeURIComponent(result.errorMessage || result.reason || "unknown");
  redirect(`/dashboard?error=${reason}`);
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
