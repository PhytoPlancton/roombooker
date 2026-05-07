"use server";

import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { activateWatchForUser, deactivateWatchForUser } from "@/lib/watch";
import { releaseBookingByIdAsUser } from "@/lib/release-booking";
import { setBookingRules, type BookingRules } from "@/lib/users";

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

function parseListField(raw: FormDataEntryValue | null, lowercase = false): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (lowercase ? s.toLowerCase() : s));
}

export async function saveRulesAction(formData: FormData): Promise<void> {
  const { userId } = await requireUser();
  const rules: BookingRules = {
    externalAttendee: {
      enabled: formData.get("externalAttendee_enabled") === "on",
    },
    titleKeywords: {
      enabled: formData.get("titleKeywords_enabled") === "on",
      keywords: parseListField(formData.get("titleKeywords_list")),
    },
    invitedEmails: {
      enabled: formData.get("invitedEmails_enabled") === "on",
      emails: parseListField(formData.get("invitedEmails_list"), true),
    },
    descriptionKeywords: {
      enabled: formData.get("descriptionKeywords_enabled") === "on",
      keywords: parseListField(formData.get("descriptionKeywords_list")),
    },
  };
  await setBookingRules(userId, rules);
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?section=rules&success=rules_saved");
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
