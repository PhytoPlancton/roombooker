import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { findUserById } from "@/lib/users";
import { ObjectId } from "mongodb";

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function Home({ searchParams }: PageProps) {
  const { error } = await searchParams;
  const session = await getSession();

  if (session.userId) {
    const user = await findUserById(new ObjectId(session.userId));
    if (user) {
      redirect(user.telephone ? "/dashboard" : "/onboarding");
    }
  }

  return (
    <main style={{ padding: "4rem 2rem", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>RoomBooker</h1>
      <p style={{ fontSize: "1.1rem", color: "#444", lineHeight: 1.6, marginBottom: "2rem" }}>
        Réservez automatiquement une salle physique quand vous créez un meeting Google Calendar
        avec un invité externe.
      </p>

      {error && (
        <div style={{
          padding: "0.75rem 1rem",
          background: "#fee",
          color: "#900",
          borderRadius: 4,
          marginBottom: "1.5rem",
        }}>
          Erreur : {error}
        </div>
      )}

      <Link
        href="/api/auth/google/start"
        style={{
          display: "inline-block",
          padding: "0.75rem 1.5rem",
          background: "#1a73e8",
          color: "#fff",
          borderRadius: 4,
          fontWeight: 600,
        }}
      >
        Connecter mon Google Calendar
      </Link>

      <p style={{ marginTop: "2rem", fontSize: "0.9rem", color: "#888" }}>
        Vous serez redirigé vers Google pour autoriser l'accès à votre Calendar.
        Aucun mot de passe n'est stocké, seuls des tokens chiffrés en base.
      </p>
    </main>
  );
}
