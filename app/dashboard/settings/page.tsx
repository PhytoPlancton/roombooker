import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/session";
import { findUserById, DEFAULT_BOOKING_RULES, DEFAULT_ROOM_PRIORITY, DEFAULT_NOTIF_PREFS } from "@/lib/users";
import { SettingsView } from "./_components/SettingsView";

interface PageProps {
  searchParams: Promise<{ section?: string; success?: string; error?: string }>;
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const { section, success, error } = await searchParams;
  const session = await getSession();
  if (!session.userId) redirect("/");
  const user = await findUserById(new ObjectId(session.userId));
  if (!user) redirect("/");
  if (!user.telephone) redirect("/onboarding");

  const watchActive = !!user.watchChannelId && !!user.watchExpiry && user.watchExpiry > new Date();
  const watchExpiryISO = user.watchExpiry ? user.watchExpiry.toISOString() : null;

  return (
    <SettingsView
      user={{
        name: `${user.firstName} ${user.lastName}`.trim() || user.email,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        telephone: user.telephone,
      }}
      rules={user.bookingRules ?? DEFAULT_BOOKING_RULES}
      priority={user.roomPriority ?? DEFAULT_ROOM_PRIORITY}
      roomLocationMode={user.roomLocationMode ?? "location"}
      notifPrefs={user.notifPrefs ?? DEFAULT_NOTIF_PREFS}
      watchActive={watchActive}
      watchExpiryISO={watchExpiryISO}
      initialSection={section || "connections"}
      flashSuccess={success || null}
      flashError={error || null}
    />
  );
}
