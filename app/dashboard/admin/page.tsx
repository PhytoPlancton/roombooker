import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/session";
import { findUserById } from "@/lib/users";
import { getAdminStats } from "@/lib/admin-stats";
import { getChannelAvailability } from "@/lib/service-state";
import { AdminView } from "./_components/AdminView";

const ADMIN_EMAIL = "nicolas.monniot@muchbetter.ai";

export default async function AdminPage() {
  const session = await getSession();
  if (!session.userId) redirect("/");
  const user = await findUserById(new ObjectId(session.userId));
  if (!user) redirect("/");
  if (user.email !== ADMIN_EMAIL) redirect("/dashboard");

  const [stats, availability] = await Promise.all([
    getAdminStats(),
    getChannelAvailability(),
  ]);
  return <AdminView stats={stats} availability={availability} />;
}
