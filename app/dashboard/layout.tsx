import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/session";
import { findUserById } from "@/lib/users";
import { listBookingsForUser } from "@/lib/bookings";
import { Topnav } from "@/components/layout/Topnav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.userId) redirect("/");
  const user = await findUserById(new ObjectId(session.userId));
  if (!user) redirect("/");
  if (!user.telephone) redirect("/onboarding");

  const bookings = await listBookingsForUser(user._id, 50);
  const syncedCount = bookings.filter((b) => b.status === "booked").length;
  const userName = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const isAdmin = user.email === "nicolas.monniot@muchbetter.ai";

  return (
    <div className="app">
      <Topnav userName={userName} syncedCount={syncedCount} isAdmin={isAdmin} />
      <main>{children}</main>
    </div>
  );
}
