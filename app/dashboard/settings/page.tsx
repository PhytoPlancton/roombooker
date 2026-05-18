import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/session";
import { findUserById, DEFAULT_BOOKING_RULES, DEFAULT_ROOM_PRIORITY, DEFAULT_NOTIF_PREFS, type NotifPrefs, type NotifType } from "@/lib/users";
import { SettingsView } from "./_components/SettingsView";

/**
 * Merge a partially-stored prefs object with DEFAULT_NOTIF_PREFS, **per type
 * AND per channel**. A shallow merge would drop newly-added channels (e.g.
 * "whatsapp" was added in v0.10.29 — users whose doc was written before that
 * have ChannelPrefs without it). This deep merge guarantees the client
 * component always receives a complete shape.
 */
function fillNotifPrefs(stored: Partial<NotifPrefs> | undefined): NotifPrefs {
  const out = {} as NotifPrefs;
  for (const t of Object.keys(DEFAULT_NOTIF_PREFS) as NotifType[]) {
    out[t] = { ...DEFAULT_NOTIF_PREFS[t], ...(stored?.[t] ?? {}) };
  }
  return out;
}

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
      skeddaTitleMode={user.skeddaTitleMode ?? "none"}
      notifPrefs={fillNotifPrefs(user.notifPrefs)}
      watchActive={watchActive}
      watchExpiryISO={watchExpiryISO}
      initialSection={section || "connections"}
      flashSuccess={success || null}
      flashError={error || null}
    />
  );
}
