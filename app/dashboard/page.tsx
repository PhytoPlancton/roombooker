import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/session";
import { findUserById } from "@/lib/users";
import { listBookingsForUser } from "@/lib/bookings";
import { activateWatchAction, cancelBookingAction, deactivateWatchAction } from "./actions";

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

  const bookings = await listBookingsForUser(user._id, 20);
  const watchActive = !!user.watchChannelId && !!user.watchExpiry && user.watchExpiry > new Date();

  return (
    <main style={{ padding: "3rem 2rem", maxWidth: 920, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem" }}>RoomBooker</h1>
          <p style={{ color: "#666", fontSize: "0.95rem" }}>
            Connecté en tant que {user.email}
          </p>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            style={{
              padding: "0.5rem 1rem",
              background: "transparent",
              border: "1px solid #ccc",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            Déconnexion
          </button>
        </form>
      </header>

      {error && (
        <div style={{
          padding: "0.75rem 1rem",
          background: "#fee",
          color: "#900",
          borderRadius: 4,
          marginBottom: "1rem",
          fontSize: "0.9rem",
        }}>
          ❌ {decodeURIComponent(error)}
        </div>
      )}

      {success && (
        <div style={{
          padding: "0.75rem 1rem",
          background: "#efe",
          color: "#070",
          borderRadius: 4,
          marginBottom: "1rem",
          fontSize: "0.9rem",
        }}>
          ✅ {
            success === "watch_activated" ? "Surveillance activée" :
            success === "watch_deactivated" ? "Surveillance désactivée" :
            success === "cancelled" ? "Réservation annulée" :
            "Action effectuée"
          }
        </div>
      )}

      <section style={{
        padding: "1.5rem",
        background: "#fff",
        border: "1px solid #e5e5e5",
        borderRadius: 8,
        marginBottom: "1.5rem",
      }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Statut</h2>
        <p style={{ color: "#444", lineHeight: 1.8, marginBottom: "1rem" }}>
          ✅ Google Calendar connecté<br/>
          ✅ Téléphone : {user.telephone}<br/>
          {watchActive ? (
            <>✅ Surveillance Calendar active (expire le {user.watchExpiry!.toLocaleString("fr-FR")})</>
          ) : (
            <>⏳ Surveillance Calendar inactive</>
          )}
        </p>

        {watchActive ? (
          <form action={deactivateWatchAction}>
            <button
              type="submit"
              style={{
                padding: "0.5rem 1rem",
                background: "transparent",
                border: "1px solid #c00",
                color: "#c00",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
            >
              Désactiver la surveillance
            </button>
          </form>
        ) : (
          <form action={activateWatchAction}>
            <button
              type="submit"
              style={{
                padding: "0.5rem 1rem",
                background: "#1a73e8",
                border: 0,
                color: "#fff",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: "0.9rem",
                fontWeight: 600,
              }}
            >
              Activer la surveillance
            </button>
          </form>
        )}
      </section>

      <section style={{
        padding: "1.5rem",
        background: "#fff",
        border: "1px solid #e5e5e5",
        borderRadius: 8,
      }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Réservations récentes</h2>
        {bookings.length === 0 ? (
          <p style={{ color: "#888" }}>
            Aucune réservation pour le moment. Crée un meeting Google Calendar avec un invité externe
            et la salle sera automatiquement réservée.
          </p>
        ) : (
          <table style={{ width: "100%", fontSize: "0.95rem", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                <th style={{ padding: "0.5rem 0" }}>Meeting</th>
                <th style={{ padding: "0.5rem 0" }}>Date</th>
                <th style={{ padding: "0.5rem 0" }}>Salle</th>
                <th style={{ padding: "0.5rem 0" }}>Statut</th>
                <th style={{ padding: "0.5rem 0" }}></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b._id.toString()} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "0.5rem 0" }}>{b.meeting.title}</td>
                  <td style={{ padding: "0.5rem 0", color: "#666" }}>
                    {b.meeting.startsAt.toLocaleString("fr-FR")}
                  </td>
                  <td style={{ padding: "0.5rem 0" }}>{b.room || "—"}</td>
                  <td style={{ padding: "0.5rem 0" }}>
                    {b.status === "booked" && "✅ Réservée"}
                    {b.status === "pending" && "⏳ En cours"}
                    {b.status === "failed" && `❌ ${b.failureReason || "échec"}`}
                    {b.status === "cancelled" && "🚫 Annulée"}
                  </td>
                  <td style={{ padding: "0.5rem 0", textAlign: "right" }}>
                    {b.status === "booked" && b.skeddaCancelToken && (
                      <form action={cancelBookingAction}>
                        <input type="hidden" name="bookingId" value={b._id.toString()} />
                        <button
                          type="submit"
                          style={{
                            padding: "0.25rem 0.6rem",
                            background: "transparent",
                            border: "1px solid #c00",
                            color: "#c00",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontSize: "0.8rem",
                          }}
                          title="Annuler la réservation Skedda"
                        >
                          Annuler
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
