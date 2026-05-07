"use server";

import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";
import { verifyCancelToken } from "@/lib/magic-link";
import { releaseBookingByIdMagic } from "@/lib/release-booking";

export async function confirmCancelMagic(formData: FormData): Promise<void> {
  const token = formData.get("token");
  if (typeof token !== "string") {
    redirect("/c/invalid?error=missing_token");
  }
  const bookingIdStr = verifyCancelToken(token);
  if (!bookingIdStr) {
    redirect(`/c/${token}?error=invalid_token`);
  }
  let bookingId: ObjectId;
  try {
    bookingId = new ObjectId(bookingIdStr);
  } catch {
    redirect(`/c/${token}?error=malformed_id`);
  }

  const result = await releaseBookingByIdMagic(bookingId);
  if (!result.ok) {
    const msg = encodeURIComponent(result.errorMessage || result.reason || "unknown");
    redirect(`/c/${token}?error=${msg}`);
  }
  redirect(`/c/${token}?done=ok`);
}
