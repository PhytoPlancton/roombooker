"use server";

import { requireUser } from "@/lib/session";
import { setBookingRules, setRoomLocationMode, setTelephone, type BookingRules } from "@/lib/users";
import { track, flushAnalytics } from "@/lib/analytics";

function normalizeTelephone(raw: string): string | null {
  const digits = raw.replace(/[\s.\-_()]/g, "");
  if (/^\+33[1-9]\d{8}$/.test(digits)) return digits;
  if (/^0[1-9]\d{8}$/.test(digits)) return "+33" + digits.slice(1);
  return null;
}

export type SaveTelephoneResult =
  | { ok: true }
  | { ok: false; error: string };

export async function saveTelephone(formData: FormData): Promise<SaveTelephoneResult> {
  const { userId } = await requireUser();
  const raw = formData.get("telephone");
  if (typeof raw !== "string") {
    return { ok: false, error: "Numéro manquant" };
  }
  const normalized = normalizeTelephone(raw);
  if (!normalized) {
    return { ok: false, error: "Format invalide (ex : 06 12 34 56 78)" };
  }
  await setTelephone(userId, normalized);
  await track({ userId, event: "onboarding_phone_added", properties: { hasPhone: true } });
  await flushAnalytics();
  return { ok: true };
}

export async function saveOnboardingRules(args: {
  rules: BookingRules;
  roomLocationMode: "location" | "description" | "none";
}): Promise<{ ok: boolean }> {
  const { userId } = await requireUser();
  await setBookingRules(userId, args.rules);
  await setRoomLocationMode(userId, args.roomLocationMode);
  await track({
    userId,
    event: "onboarding_rules_set",
    properties: {
      externalAttendeeEnabled: args.rules.externalAttendee.enabled,
      titleKeywordsEnabled: args.rules.titleKeywords.enabled,
      invitedEmailsEnabled: args.rules.invitedEmails.enabled,
      descriptionKeywordsEnabled: args.rules.descriptionKeywords.enabled,
      roomLocationMode: args.roomLocationMode,
    },
  });
  await flushAnalytics();
  return { ok: true };
}
