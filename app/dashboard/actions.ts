"use server";

import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { activateWatchForUser, deactivateWatchForUser } from "@/lib/watch";
import { releaseBookingByIdAsUser } from "@/lib/release-booking";
import { setChannelAvailability, getChannelAvailability, type ChannelAvailability } from "@/lib/service-state";
import { findUserById } from "@/lib/users";
import { sendSms, sendEmail, sendWhatsapp } from "@/lib/notify";
import { findBookingById } from "@/lib/bookings";
import { processBookingForEvent } from "@/lib/booking-engine";
import { audit } from "@/lib/audit";
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
      whatsapp: formData.get("booking_success_whatsapp") === "on",
    },
    booking_deferred: {
      sms: formData.get("booking_deferred_sms") === "on",
      email: formData.get("booking_deferred_email") === "on",
      whatsapp: formData.get("booking_deferred_whatsapp") === "on",
    },
    booking_cancelled: {
      sms: formData.get("booking_cancelled_sms") === "on",
      email: formData.get("booking_cancelled_email") === "on",
      whatsapp: formData.get("booking_cancelled_whatsapp") === "on",
    },
    booking_failure: {
      sms: formData.get("booking_failure_sms") === "on",
      email: formData.get("booking_failure_email") === "on",
      whatsapp: formData.get("booking_failure_whatsapp") === "on",
    },
    watch_resync: {
      sms: formData.get("watch_resync_sms") === "on",
      email: formData.get("watch_resync_email") === "on",
      whatsapp: formData.get("watch_resync_whatsapp") === "on",
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

const ADMIN_EMAIL = "nicolas.monniot@muchbetter.ai";

export async function setChannelAvailabilityAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await requireUser();
  const user = await findUserById(userId);
  if (!user || user.email !== ADMIN_EMAIL) return { ok: false, error: "forbidden" };

  const rawChannel = formData.get("channel");
  const rawEnabled = formData.get("enabled");
  const valid: Array<keyof ChannelAvailability> = ["sms", "email", "whatsapp"];
  if (typeof rawChannel !== "string" || !(valid as readonly string[]).includes(rawChannel)) {
    return { ok: false, error: "invalid_channel" };
  }
  const channel = rawChannel as keyof ChannelAvailability;
  const enabled = rawEnabled === "on" || rawEnabled === "true" || rawEnabled === "1";

  await setChannelAvailability(channel, enabled);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

/**
 * Send a test message via the requested channel to the current user. Lets
 * them verify the canal works end-to-end (provider up, number/email reachable,
 * not in spam) before relying on real notifications.
 */
export async function testChannelAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await requireUser();
  const user = await findUserById(userId);
  if (!user) return { ok: false, error: "user_not_found" };

  const rawChannel = formData.get("channel");
  const valid = ["sms", "email", "whatsapp"] as const;
  if (typeof rawChannel !== "string" || !(valid as readonly string[]).includes(rawChannel)) {
    return { ok: false, error: "invalid_channel" };
  }
  const channel = rawChannel as (typeof valid)[number];

  const availability = await getChannelAvailability();
  if (!availability[channel]) return { ok: false, error: "channel_paused" };

  if ((channel === "sms" || channel === "whatsapp") && !user.telephone) {
    return { ok: false, error: "no_phone" };
  }

  const now = new Date().toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
  const text = `RoomBooker : test ${channel.toUpperCase()} reçu à ${now}. Si tu lis ça, le canal fonctionne ✓`;

  let result: { success: boolean; error?: string };
  if (channel === "sms") {
    result = await sendSms({ phoneNumber: user.telephone!, text });
  } else if (channel === "whatsapp") {
    result = await sendWhatsapp({ phoneNumber: user.telephone!, text });
  } else {
    result = await sendEmail({
      to: { email: user.email, name: user.firstName },
      subject: `RoomBooker — test Email ${now}`,
      htmlContent: `<p>${text}</p><p>Si tu lis ça, le canal fonctionne ✓</p>`,
    });
  }

  await audit({
    action: result.success ? "notify_sent" : "error",
    userId,
    details: {
      channel,
      type: "channel_test",
      to: channel === "email" ? user.email : user.telephone,
      success: result.success,
      error: result.error,
    },
  });

  if (!result.success) {
    return { ok: false, error: result.error || "send_failed" };
  }
  return { ok: true };
}

/**
 * Re-run the booking engine on a single booking. Used by the "Forcer la
 * synchro" button on the dashboard drawer — useful when a booking is stuck
 * "Syncing…" or marked "Erreur" / "Conflit" and the user wants to retry
 * without having to delete + recreate the meeting in Calendar.
 *
 * Status semantics:
 *  - failed / conflict / pending  → re-run the engine
 *  - booked                       → no-op, return current state
 *  - cancelled                    → refuse (user explicitly cancelled)
 */
export async function forceResyncAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await requireUser();
  const raw = formData.get("bookingId");
  if (typeof raw !== "string") return { ok: false, error: "missing_id" };
  let bookingId: ObjectId;
  try {
    bookingId = new ObjectId(raw);
  } catch {
    return { ok: false, error: "invalid_id" };
  }

  const booking = await findBookingById(bookingId);
  if (!booking) return { ok: false, error: "not_found" };
  if (!booking.userId.equals(userId)) return { ok: false, error: "wrong_user" };

  if (booking.status === "booked") {
    return { ok: false, error: "already_booked" };
  }
  if (booking.status === "cancelled") {
    return { ok: false, error: "cancelled" };
  }

  await audit({
    action: "booking_engine_started",
    userId,
    iCalUID: booking.iCalUID,
    details: { source: "force_resync", priorStatus: booking.status },
  });

  // Fire-and-forget — the engine writes its own audits + flips status.
  void processBookingForEvent({
    iCalUID: booking.iCalUID,
    googleEventId: booking.googleEventId,
    userId,
    meeting: booking.meeting,
  }).catch((err) => {
    audit({
      action: "error",
      userId,
      iCalUID: booking.iCalUID,
      details: { where: "force_resync", message: String(err) },
    });
  });

  revalidatePath("/dashboard");
  return { ok: true };
}
