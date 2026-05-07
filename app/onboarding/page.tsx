import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/session";
import { findUserById } from "@/lib/users";
import { OnboardingFlow } from "./_components/OnboardingFlow";

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const { error } = await searchParams;
  const session = await getSession();
  if (!session.userId) redirect("/");

  const user = await findUserById(new ObjectId(session.userId));
  if (!user) redirect("/");
  if (user.telephone) redirect("/dashboard");

  return (
    <OnboardingFlow
      userEmail={user.email}
      firstName={user.firstName}
      lastName={user.lastName}
      flashError={error || null}
    />
  );
}
