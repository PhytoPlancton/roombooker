import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/session";
import { findUserById } from "@/lib/users";
import { listBookingsForUser } from "@/lib/bookings";
import { DEFAULT_BOOKING_RULES } from "@/lib/users";
import { activateWatchAction, cancelBookingAction, deactivateWatchAction, saveRulesAction } from "./actions";

function RuleRow({
  id,
  label,
  help,
  placeholder,
  enabled,
  listValue,
}: {
  id: string;
  label: string;
  help: string;
  placeholder?: string;
  enabled: boolean;
  listValue: string | null;
}) {
  return (
    <div style={{ marginBottom: "1.1rem", paddingBottom: "1rem", borderBottom: "1px dashed #eee" }}>
      <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}>
        <input
          type="checkbox"
          name={`${id}_enabled`}
          defaultChecked={enabled}
          style={{ width: 18, height: 18 }}
        />
        <span style={{ fontWeight: 600 }}>{label}</span>
      </label>
      <p style={{ color: "#666", fontSize: "0.85rem", margin: "0.25rem 0 0.5rem 1.8rem" }}>
        {help}
      </p>
      {listValue !== null && (
        <input
          type="text"
          name={`${id}_list`}
          defaultValue={listValue}
          placeholder={placeholder}
          style={{
            marginLeft: "1.8rem",
            width: "calc(100% - 1.8rem)",
            padding: "0.5rem",
            fontSize: "0.9rem",
            border: "1px solid #ccc",
            borderRadius: 4,
          }}
        />
      )}
    </div>
  );
}

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
  const rules = user.bookingRules ?? DEFAULT_BOOKING_RULES;

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
            success === "rules_saved" ? "Règles enregistrées" :
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
        marginBottom: "1.5rem",
      }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.25rem" }}>Mes règles de réservation auto</h2>
        <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "1.25rem" }}>
          Une réunion est réservée si <strong>au moins une règle activée</strong> correspond. Les meetings récurrents,
          déjà avec une location, ou dont tu n'es pas l'organisateur ne sont jamais bookés.
        </p>

        <form action={saveRulesAction}>
          <RuleRow
            id="externalAttendee"
            label="Au moins un invité externe"
            help="Déclenche si un invité a un email hors @muchbetter.ai. Recommandé."
            enabled={rules.externalAttendee.enabled}
            listValue={null}
          />
          <RuleRow
            id="titleKeywords"
            label="Mot-clé dans le titre"
            help="Déclenche si le titre contient un de ces mots (insensible à la casse, virgule pour séparer)."
            placeholder="demo, pitch, client"
            enabled={rules.titleKeywords.enabled}
            listValue={rules.titleKeywords.keywords.join(", ")}
          />
          <RuleRow
            id="invitedEmails"
            label="Email d'invité spécifique"
            help="Déclenche si un de ces emails est invité au meeting."
            placeholder="prospect@bigco.com, alice@example.com"
            enabled={rules.invitedEmails.enabled}
            listValue={rules.invitedEmails.emails.join(", ")}
          />
          <RuleRow
            id="descriptionKeywords"
            label="Mot-clé dans la description"
            help="Déclenche si la description du meeting contient un de ces mots. Pratique pour forcer un booking."
            placeholder="ROOM_BOOK, room"
            enabled={rules.descriptionKeywords.enabled}
            listValue={rules.descriptionKeywords.keywords.join(", ")}
          />

          <button
            type="submit"
            style={{
              marginTop: "1rem",
              padding: "0.6rem 1.2rem",
              background: "#1a73e8",
              color: "#fff",
              border: 0,
              borderRadius: 4,
              fontWeight: 600,
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            Enregistrer les règles
          </button>
        </form>
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
