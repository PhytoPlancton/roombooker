import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/session";
import { findUserById } from "@/lib/users";
import { listBookingsForUser } from "@/lib/bookings";
import { ROOMS } from "@/lib/ui/rooms";
import { Icon } from "@/components/ui/Icon";
import { PlanetIcon } from "@/components/ui/PlanetIcon";
import { formatHHMM } from "@/lib/ui/format";

export default async function RoomsPage() {
  const session = await getSession();
  if (!session.userId) redirect("/");
  const user = await findUserById(new ObjectId(session.userId));
  if (!user) redirect("/");
  if (!user.telephone) redirect("/onboarding");

  const allBookings = await listBookingsForUser(user._id, 100);
  // Show ALL active bookings grouped by room (matches the dashboard's "Mes salles réservées" widget)
  const activeBookings = allBookings.filter((b) => b.status !== "cancelled");

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Mes <em>salles</em>.
          </h1>
          <p className="page-subtitle">
            <span className="me-pill">
              <Icon.user size={11} /> Toi
            </span>{" "}
            État des 5 salles, et tous tes meetings réservés sur chacune.
          </p>
        </div>
      </div>

      <div className="rooms-grid">
        {ROOMS.map((r) => {
          const myBookings = activeBookings
            .filter((b) => b.room === r.id)
            .sort((a, b) => (a.meeting.startsAt > b.meeting.startsAt ? 1 : -1));
          return (
            <section key={r.id} className="room-card">
              <header className="room-card-head">
                <div className="room-card-head-l">
                  <div
                    className="room-avatar room-avatar-lg"
                    style={{
                      background: "var(--bg-soft)",
                      border: "1px solid var(--line)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <PlanetIcon planet={r.id} size={36} />
                  </div>
                  <div>
                    <h3 className="room-card-name">{r.name}</h3>
                    <span className="room-card-cap">
                      {r.cap} places · {r.desc}
                    </span>
                  </div>
                </div>
              </header>

              <div className="room-card-status">
                <span
                  className={`status-pill ${myBookings.length > 0 ? "free" : ""}`}
                  style={
                    myBookings.length === 0
                      ? { background: "var(--bg-soft)", color: "var(--ink-3)", border: "1px solid var(--line)" }
                      : undefined
                  }
                >
                  <span className="status-pill-dot" />
                  {myBookings.length > 0
                    ? `${myBookings.length} de tes meeting${myBookings.length > 1 ? "s" : ""}`
                    : "Aucun de tes meetings"}
                </span>
              </div>

              {myBookings.length > 0 && (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {myBookings.map((b) => (
                    <li
                      key={b._id.toString()}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        background: "var(--bg-soft)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: 12,
                      }}
                    >
                      <span
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 600,
                          color: "var(--ink-2)",
                          minWidth: 90,
                        }}
                      >
                        {formatHHMM(new Date(b.meeting.startsAt))} – {formatHHMM(new Date(b.meeting.endsAt))}
                      </span>
                      <span style={{ flex: 1, color: "var(--ink)" }}>—</span>
                      <span className="sync-badge">
                        <Icon.check size={11} />
                        {b.status === "booked" ? "OK" : b.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <footer className="room-card-foot">
                <span className="room-card-mine">
                  <Icon.user size={12} />
                  <strong>{myBookings.length}</strong> meeting{myBookings.length > 1 ? "s" : ""} au total
                </span>
              </footer>
            </section>
          );
        })}
      </div>
    </div>
  );
}
