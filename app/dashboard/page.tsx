import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/session";
import { findUserById } from "@/lib/users";
import { listBookingsForUser } from "@/lib/bookings";
import { serializeBooking, type EventVM } from "@/lib/ui/serialize";
import { humanizeError } from "@/lib/error-messages";
import { DashboardShell } from "./_components/DashboardShell";

interface PageProps {
  searchParams: Promise<{ error?: string; success?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const { error, success } = await searchParams;

  const session = await getSession();
  if (!session.userId) redirect("/");
  const user = await findUserById(new ObjectId(session.userId));
  if (!user) redirect("/");
  if (!user.telephone) redirect("/onboarding");

  const userName = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const bookings = await listBookingsForUser(user._id, 50);
  const events: EventVM[] = bookings.map((b) => serializeBooking(b, userName));

  const watchActive = !!user.watchChannelId && !!user.watchExpiry && user.watchExpiry > new Date();

  return (
    <DashboardShell
      user={{ name: userName, email: user.email, firstName: user.firstName }}
      events={events}
      watchActive={watchActive}
      flashError={error ? humanizeError(error) : null}
      flashSuccess={success || null}
    />
  );
}
