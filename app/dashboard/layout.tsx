import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { Suspense } from "react";
import { getSession } from "@/lib/session";
import { findUserById } from "@/lib/users";
import { Topnav } from "@/components/layout/Topnav";
import { PostHogClientProvider } from "@/components/analytics/PostHogProvider";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.userId) redirect("/");
  const user = await findUserById(new ObjectId(session.userId));
  if (!user) redirect("/");
  if (!user.telephone) redirect("/onboarding");

  const userName = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const isAdmin = user.email === "nicolas.monniot@muchbetter.ai";

  return (
    <Suspense fallback={null}>
      <PostHogClientProvider userId={user._id.toString()} email={user.email}>
        <div className="app">
          <Topnav userName={userName} isAdmin={isAdmin} />
          <main>{children}</main>
        </div>
      </PostHogClientProvider>
    </Suspense>
  );
}
