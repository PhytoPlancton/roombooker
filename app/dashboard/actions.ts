"use server";

import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { activateWatchForUser, deactivateWatchForUser } from "@/lib/watch";
import { releaseBookingByIdAsUser } from "@/lib/release-booking";
import {
  setBookingRules,
  setNotifPrefs,
  setRoomLocationMode,
  setRoomPriority,
  setSkeddaTitleMode,
  setTelephone,
  type BookingRules,
  type NotifPrefs,
} from "@/lib/users";

const VALID_ROOMS = ["Venus", "Mars", "Mercury", "Earth", "Jupiter"] as const;
type RoomKey = typeof VALID_ROOMS[number];

function normalizeTelephone(raw: string): string | null {
  const digits = raw.replace(/[\s.\-_()]/g, "");
  if (/^\+33[1-9]\d{8}$/.test(digits)) return digits;
  if (/^0[1-9]\d{8}$/.test(digits)) return "+33" + digits.slice(1);
  return null;
}

export type UpdatePhoneResult =
  | { ok: true; phone: string }
  | { ok: false; error: string };

export async function updatePhoneAction(formData: FormData): Promise<UpdatePhoneResult> {
  const { userId } = await requireUser();
  const raw = formData.get("telephone");
  if (typeof raw !== "string") return { ok: false, error: "Numéro manquant" };
  const normalized = normalizeTelephone(raw);
  if (!normalized) return { ok: false, error: "Format invalide (ex : 06 12 34 56 78)" };
  await setTelephone(userId, normalized);
  revalidatePath("/dashboard/settings");
  return { ok: true, phone: normalized };
}

export async function saveNotifPrefsAction(formData: FormData): Promise<{ ok: boolean }> {
  const { userId } = await requireUser();
  const prefs: NotifPrefs = {
    booking_success: {
      sms: formData.get("booking_success_sms") === "on",
      email: formData.get("booking_success_email") === "on",
    },
    booking_deferred: {
      sms: formData.get("booking_deferred_sms") === "on",
      email: formData.get("booking_deferred_email") === "on",
    },
    booking_cancelled: {
      sms: formData.get("booking_cancelled_sms") === "on",
      email: formData.get("booking_cancelled_email") === "on",
    },
    booking_failure: {
      sms: formData.get("booking_failure_sms") === "on",
      email: formData.get("booking_failure_email") === "on",
    },
    watch_resync: {
      sms: formData.get("watch_resync_sms") === "on",
      email: formData.get("watch_resync_email") === "on",
    },
  };
  await setNotifPrefs(userId, prefs);
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function saveRoomLocationModeAction(formData: FormData): Promise<{ ok: boolean }> {
  const { userId } = await requireUser();
  const raw = formData.get("mode");
  const valid = ["location", "description", "none"] as const;
  type Mode = typeof valid[number];
  const mode = (typeof raw === "string" && (valid as readonly string[]).includes(raw) ? raw : "location") as Mode;
  await setRoomLocationMode(userId, mode);
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function saveSkeddaTitleModeAction(formData: FormData): Promise<{ ok: boolean }> {
  const { userId } = await requireUser();
  const raw = formData.get("mode");
  const valid = ["none", "anonymized", "full"] as const;
  type Mode = typeof valid[number];
  const mode = (typeof raw === "string" && (valid as readonly string[]).includes(raw) ? raw : "none") as Mode;
  await setSkeddaTitleMode(userId, mode);
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function saveRoomPriorityAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await requireUser();
  const raw = formData.get("priority");
  if (typeof raw !== "string") return { ok: false, error: "missing" };
  const list = raw.split(",").map((s) => s.trim()).filter((s): s is RoomKey => (VALID_ROOMS as readonly string[]).includes(s));
  if (list.length !== VALID_ROOMS.length) return { ok: false, error: "incomplete" };
  await setRoomPriority(userId, list);
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

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
  if (result.reason === "locked_in") {
    const msg = encodeURIComponent(
      "Skedda a verrouillé cette résa (créneau trop proche ou déjà commencé). Contacte l'admin du venue Antler pour annuler.",
    );
    redirect(`/dashboard?error=${msg}`);
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
