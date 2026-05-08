import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/session";
import { findUserById } from "@/lib/users";
import { LandingPage } from "./_components/LandingPage";

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function Home({ searchParams }: PageProps) {
  const { error } = await searchParams;
  const session = await getSession();

  if (session.userId) {
    const user = await findUserById(new ObjectId(session.userId));
    if (user) redirect(user.telephone ? "/dashboard" : "/onboarding");
  }

  return <LandingPage flashError={error || null} />;
}
