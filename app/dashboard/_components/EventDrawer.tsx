"use client";

import { Icon } from "@/components/ui/Icon";
import { roomById, ATTENDEE_COLORS } from "@/lib/ui/rooms";
import { durationLabel, initials, shortDayLabel } from "@/lib/ui/format";
import type { EventVM } from "@/lib/ui/serialize";

interface EventDrawerProps {
  event: EventVM | null;
  open: boolean;
  onClose: () => void;
  cancelAction: (formData: FormData) => Promise<void>;
  onActionToast: (text: string) => void;
}

export function EventDrawer({ event, open, onClose, cancelAction, onActionToast }: EventDrawerProps) {
  if (!event) return <div className="drawer" data-open="false" />;

  const room = event.room ? roomById(event.room) : null;
  const isConflict = event.status === "conflict";
  const isError = event.status === "error";
  const heroClass = isConflict ? "conflict" : isError ? "error" : "";

  const stub = (label: string) => () => onActionToast(`${label} : bientôt dispo`);

  return (
    <>
      <div className="scrim" data-open={open} onClick={onClose} />
      <aside className="drawer" data-open={open}>
        <header className="drawer-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="drawer-title">{event.title}</h2>
            <div className="drawer-sub">
              {room && (
                <>
                  <span className="room-pill">
                    <span className="room-icon" style={{ background: room.color }}>
                      {room.name[0]}
                    </span>
                    {room.name}
                  </span>
                  <span>·</span>
                </>
              )}
              <span>
                {shortDayLabel(new Date(event.startISO))} · {event.start} – {event.end}
              </span>
              <span>·</span>
              <span>{durationLabel(event.start, event.end)}</span>
            </div>
          </div>
          <button className="drawer-close" onClick={onClose} type="button" aria-label="Fermer">
            <Icon.x />
          </button>
        </header>

        <div className="drawer-body">
          <div className={`sync-hero ${heroClass}`}>
            <div className="sync-side">
              <span className="sync-side-head">
                <span className="sync-side-logo">
                  <Icon.google size={14} />
                </span>
                Google Calendar
              </span>
              <span className="sync-side-status">{event.title}</span>
              <span className="sync-side-time">Source · agenda</span>
            </div>
            <div
              className={`sync-arrow ${event.status === "syncing" ? "pending" : event.status === "conflict" ? "conflict" : event.status === "error" ? "error" : ""}`}
            >
              {event.status === "synced" ? (
                <Icon.check size={20} />
              ) : event.status === "syncing" ? (
                <Icon.refresh size={18} />
              ) : event.status === "conflict" ? (
                <Icon.alert size={18} />
              ) : (
                <Icon.unlink size={18} />
              )}
            </div>
            <div className="sync-side" style={{ textAlign: "right", alignItems: "flex-end" }}>
              <span className="sync-side-head">
                <span className="sync-side-logo">
                  <Icon.skedda size={14} />
                </span>
                Skedda
              </span>
              <span className="sync-side-status">
                {event.status === "synced" && room ? `${room.name} réservée` : null}
                {event.status === "syncing" ? "Synchronisation…" : null}
                {event.status === "conflict" ? "Salle déjà prise" : null}
                {event.status === "error" ? event.failureReason || "Erreur" : null}
              </span>
              <span className="sync-side-time">
                {event.status === "synced" && event.skeddaBookingRef ? `ID #${event.skeddaBookingRef}` : "—"}
              </span>
            </div>
          </div>

          {isConflict && (
            <div className="conflict-card">
              <h4 className="conflict-title">
                <Icon.alert size={14} />
                Conflit sur {room?.name || "la salle"}
              </h4>
              <p className="conflict-text">
                {event.failureReason || "La salle est déjà réservée sur ce créneau."} Choisis comment résoudre :
              </p>
              <div className="conflict-options">
                <button className="conflict-option" onClick={stub("Réassigner")} type="button">
                  <span className="conflict-option-icon" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                    <Icon.pin size={14} />
                  </span>
                  <div>
                    <strong>Réassigner sur une autre salle</strong>
                    <span>On essaie la salle suivante par priorité.</span>
                  </div>
                </button>
                <button className="conflict-option" onClick={stub("Décaler")} type="button">
                  <span className="conflict-option-icon" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
                    <Icon.clock size={14} />
                  </span>
                  <div>
                    <strong>Décaler le meeting</strong>
                    <span>On propose le prochain créneau libre.</span>
                  </div>
                </button>
                <button className="conflict-option" onClick={stub("Garder Google")} type="button">
                  <span className="conflict-option-icon" style={{ background: "var(--bg-soft)", color: "var(--ink-2)" }}>
                    <Icon.x size={14} />
                  </span>
                  <div>
                    <strong>Garder seulement sur Google</strong>
                    <span>On annule la tentative Skedda.</span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {isError && (
            <div className="conflict-card" style={{ borderColor: "var(--danger)", background: "var(--danger-soft)" }}>
              <h4 className="conflict-title" style={{ color: "var(--danger)" }}>
                <Icon.alert size={14} />
                Erreur Skedda
              </h4>
              <p className="conflict-text">{event.failureReason || "Erreur inconnue lors de la synchronisation."}</p>
              <button className="btn btn-primary" onClick={stub("Reconnecter")} type="button">
                <Icon.link size={14} />
                Re-tester la synchro
              </button>
            </div>
          )}

          <div className="detail-list">
            <div className="detail-row">
              <span className="detail-label">Organisateur</span>
              <div className="detail-value">
                <strong>{event.organizer}</strong>
              </div>
            </div>
            {event.attendeeEmails.length > 0 && (
              <div className="detail-row">
                <span className="detail-label">Invités</span>
                <div className="detail-value">
                  <div className="attendee-list">
                    {event.attendeeEmails.map((email, i) => (
                      <span key={i} className="attendee">
                        <span className="attendee-pic" style={{ background: ATTENDEE_COLORS[i % ATTENDEE_COLORS.length] }}>
                          {initials(email.split("@")[0].replace(/[^a-zA-Z]/g, " "))}
                        </span>
                        {email}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {room && (
              <div className="detail-row">
                <span className="detail-label">Salle</span>
                <div className="detail-value">
                  <strong>{room.name}</strong>
                  {room.cap !== null && <> — {room.cap} place{room.cap > 1 ? "s" : ""}</>}
                  {room.desc && <div className="detail-value-sub">{room.desc}</div>}
                </div>
              </div>
            )}
            <div className="detail-row">
              <span className="detail-label">Source</span>
              <div className="detail-value">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Icon.google size={14} /> Google Calendar
                </span>
              </div>
            </div>
            {event.skeddaBookingRef && (
              <div className="detail-row">
                <span className="detail-label">Skedda</span>
                <div className="detail-value">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Icon.skedda size={14} /> Booking · ID{" "}
                    <code style={{ fontSize: 12, color: "var(--ink-3)" }}>{event.skeddaBookingRef}</code>
                  </span>
                  <div className="detail-value-sub">
                    Créé par roombooker · {event.status === "synced" ? "actif" : "—"}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="drawer-footer">
          <button className="btn" onClick={stub("Forcer la synchro")} type="button">
            <Icon.refresh size={14} />
            Forcer la synchro
          </button>
          <div style={{ flex: 1 }} />
          {event.status === "synced" && (
            <form action={cancelAction}>
              <input type="hidden" name="bookingId" value={event.bookingDocId} />
              <button className="btn btn-danger" type="submit">
                <Icon.unlink size={14} />
                Annuler la résa
              </button>
            </form>
          )}
          <a className="btn btn-primary" href="https://antlerfrance.skedda.com/booking" target="_blank" rel="noopener noreferrer">
            Ouvrir dans Skedda <Icon.arrow size={14} />
          </a>
        </footer>
      </aside>
    </>
  );
}
