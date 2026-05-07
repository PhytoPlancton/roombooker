import { ObjectId } from "mongodb";
import { findBookingById } from "@/lib/bookings";
import { verifyCancelToken } from "@/lib/magic-link";
import { confirmCancelMagic } from "./actions";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}

export default async function CancelMagicPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { done, error } = await searchParams;
  const bookingIdStr = verifyCancelToken(token);

  const wrap = (children: React.ReactNode) => (
    <main style={{ padding: "3rem 2rem", maxWidth: 540, margin: "0 auto", fontFamily: "-apple-system, sans-serif" }}>
      {children}
    </main>
  );

  if (done === "ok") {
    return wrap(
      <>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>✅ Réservation annulée</h1>
        <p style={{ color: "#444" }}>La salle a été libérée sur Skedda.</p>
      </>,
    );
  }

  if (!bookingIdStr) {
    return wrap(
      <>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Lien invalide</h1>
        <p style={{ color: "#444" }}>Ce lien d'annulation n'est pas valide ou a expiré.</p>
      </>,
    );
  }

  let bookingId: ObjectId;
  try {
    bookingId = new ObjectId(bookingIdStr);
  } catch {
    return wrap(<p>Lien malformé.</p>);
  }

  const booking = await findBookingById(bookingId);
  if (!booking) {
    return wrap(<p>Réservation introuvable.</p>);
  }

  if (booking.status === "cancelled") {
    return wrap(
      <>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Déjà annulée</h1>
        <p style={{ color: "#444" }}>Cette réservation a déjà été annulée.</p>
      </>,
    );
  }

  if (booking.status !== "booked") {
    return wrap(
      <>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Rien à annuler</h1>
        <p style={{ color: "#444" }}>Statut actuel : {booking.status}.</p>
      </>,
    );
  }

  const time = booking.meeting.startsAt.toLocaleString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  return wrap(
    <>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Annuler la réservation ?</h1>
      <div style={{
        padding: "1rem",
        background: "#f5f5f5",
        borderRadius: 6,
        marginBottom: "1.5rem",
        lineHeight: 1.6,
      }}>
        <strong>Salle :</strong> {booking.room || "—"}<br/>
        <strong>Créneau :</strong> {time}<br/>
      </div>
      {error && (
        <div style={{ padding: "0.75rem", background: "#fee", color: "#900", borderRadius: 4, marginBottom: "1rem" }}>
          ❌ {decodeURIComponent(error)}
        </div>
      )}
      <form action={confirmCancelMagic}>
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          style={{
            padding: "0.75rem 1.5rem",
            background: "#c00",
            color: "#fff",
            border: 0,
            borderRadius: 4,
            cursor: "pointer",
            fontSize: "1rem",
            fontWeight: 600,
          }}
        >
          Confirmer l'annulation
        </button>
      </form>
    </>,
  );
}
