"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { setTelephone } from "@/lib/users";

function normalizeTelephone(raw: string): string | null {
  const digits = raw.replace(/[\s.\-_()]/g, "");
  if (/^\+33[1-9]\d{8}$/.test(digits)) return digits;
  if (/^0[1-9]\d{8}$/.test(digits)) return "+33" + digits.slice(1);
  return null;
}

export async function saveTelephone(formData: FormData) {
  const { userId } = await requireUser();
  const raw = formData.get("telephone");
  if (typeof raw !== "string") {
    redirect("/onboarding?error=Numéro%20manquant");
  }

  const normalized = normalizeTelephone(raw);
  if (!normalized) {
    redirect("/onboarding?error=Format%20invalide%20(ex%20%3A%2006%2012%2034%2056%2078)");
  }

  await setTelephone(userId, normalized);
  redirect("/dashboard");
}
