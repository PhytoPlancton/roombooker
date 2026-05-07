"use server";

import { requireUser } from "@/lib/session";
import { setTelephone } from "@/lib/users";

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
  return { ok: true };
}
