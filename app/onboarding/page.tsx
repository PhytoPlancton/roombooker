import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/session";
import { findUserById } from "@/lib/users";
import { OnboardingFlow } from "./_components/OnboardingFlow";

const ADMIN_EMAIL = "nicolas.monniot@muchbetter.ai";

interface PageProps {
  searchParams: Promise<{ error?: string; demo?: string }>;
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const { error, demo } = await searchParams;
  const session = await getSession();
  if (!session.userId) redirect("/");

  const user = await findUserById(new ObjectId(session.userId));
  if (!user) redirect("/");

  const wantsDemo = demo === "1";
  const canDemo = wantsDemo && user.email === ADMIN_EMAIL;

  // Normal flow: skip onboarding if telephone is already set.
  // Demo flow: bypass that gate so admin can replay the entire onboarding.
  if (!canDemo && user.telephone) redirect("/dashboard");

  return (
    <OnboardingFlow
      userEmail={user.email}
      firstName={user.firstName}
      lastName={user.lastName}
      flashError={error || null}
      initialPhone={canDemo ? user.telephone : null}
      initialRules={canDemo ? user.bookingRules ?? null : null}
      initialRoomLocationMode={canDemo ? user.roomLocationMode ?? null : null}
      demoMode={canDemo}
    />
  );
}
