import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/session";
import { findUserById } from "@/lib/users";
import { saveTelephone } from "./actions";

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
    <main style={{ padding: "4rem 2rem", maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>Bienvenue {user.firstName} 👋</h1>
      <p style={{ color: "#666", marginBottom: "2rem", lineHeight: 1.5 }}>
        Encore une info — Skedda exige un numéro de téléphone pour valider une réservation.
        Tu ne le ressaisiras plus jamais.
      </p>

      {error && (
        <div style={{
          padding: "0.75rem 1rem",
          background: "#fee",
          color: "#900",
          borderRadius: 4,
          marginBottom: "1rem",
        }}>
          {error}
        </div>
      )}

      <form action={saveTelephone}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
          Téléphone (FR)
        </label>
        <input
          type="tel"
          name="telephone"
          required
          placeholder="06 12 34 56 78 ou +33612345678"
          style={{
            width: "100%",
            padding: "0.75rem",
            fontSize: "1rem",
            border: "1px solid #ccc",
            borderRadius: 4,
            marginBottom: "1.5rem",
          }}
        />

        <button
          type="submit"
          style={{
            padding: "0.75rem 1.5rem",
            background: "#1a73e8",
            color: "#fff",
            border: 0,
            borderRadius: 4,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Continuer
        </button>
      </form>
    </main>
  );
}
