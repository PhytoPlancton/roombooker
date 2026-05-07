"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { ROOMS, roomById } from "@/lib/ui/rooms";
import { durationLabel, shortDayLabel } from "@/lib/ui/format";
import type { EventVM } from "@/lib/ui/serialize";
import type { RoomName } from "@/lib/bookings";
import { EventDrawer } from "./EventDrawer";
import { activateWatchAction, cancelBookingAction, deactivateWatchAction } from "../actions";

interface DashboardShellProps {
  user: { name: string; email: string; firstName: string };
  events: EventVM[];
  watchActive: boolean;
  flashError: string | null;
  flashSuccess: string | null;
}

export function DashboardShell({ user, events, watchActive, flashError, flashSuccess }: DashboardShellProps) {
  const router = useRouter();
  const [filterRoom, setFilterRoom] = useState<"all" | RoomName>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "issues">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(flashSuccess || flashError || null);

  // Auto-dismiss flash toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  // Live refresh: refetch the server data every 8s while the tab is visible.
  // Faster cadence (3s) when there's at least one pending/syncing booking that
  // is expected to flip soon. router.refresh() preserves all client state
  // (drawer, filters, selection) — it just re-runs the page server component.
  const hasPending = events.some((e) => e.status === "syncing");
  useEffect(() => {
    const interval = hasPending ? 3000 : 8000;
    const tick = () => {
      if (typeof document !== "undefined" && !document.hidden) router.refresh();
    };
    const onVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) router.refresh();
    };
    const id = setInterval(tick, interval);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      clearInterval(id);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, [router, hasPending]);

  const showToast = (text: string) => setToast(text);

  // Show every active booking, sorted by date ascending (closest first)
  const filtered = useMemo(() => {
    return events
      .filter((e) => filterRoom === "all" || e.room === filterRoom)
      .filter((e) => filterStatus === "all" || e.status === "conflict" || e.status === "error")
      .sort((a, b) => (a.startISO > b.startISO ? 1 : -1));
  }, [events, filterRoom, filterStatus]);

  const counts = useMemo(() => {
    const c = { synced: 0, syncing: 0, conflict: 0, error: 0 };
    events.forEach((e) => {
      if (e.status in c) c[e.status as keyof typeof c]++;
    });
    return c;
  }, [events]);

  const roomLoad = useMemo(() => {
    const out: Record<string, number> = {};
    ROOMS.forEach((r) => (out[r.id] = 0));
    events.forEach((e) => {
      if (e.room && out[e.room] !== undefined) out[e.room]++;
    });
    return out;
  }, [events]);

  const selectedEvent = events.find((e) => e.id === selectedId) || null;

  return (
    <>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">
              Salut <em>{user.firstName || "toi"}</em> 👋
            </h1>
            <p className="page-subtitle">
              <span className="me-pill">
                <Icon.user size={11} /> Toi · {user.email}
              </span>{" "}
              Voici <strong>tes meetings à toi</strong>. Tout ce que tu poses sur Google arrive sur Skedda.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <form action={watchActive ? deactivateWatchAction : activateWatchAction}>
              <button
                type="submit"
                className="sync-toggle"
                data-active={watchActive}
                title={watchActive ? "Cliquer pour mettre la synchro en pause" : "Cliquer pour réactiver la synchro"}
              >
                <span className="sync-toggle-dot" />
                {watchActive ? "Sync active" : "Sync en pause"}
              </button>
            </form>
            <a className="btn btn-primary" href="https://antlerfrance.skedda.com/booking" target="_blank" rel="noopener noreferrer">
              <Icon.link size={14} /> Ouvrir Skedda
            </a>
          </div>
        </div>

        <KpiRow
          counts={counts}
          events={events}
          activeIssueFilter={filterStatus === "issues"}
          onToggleIssueFilter={() => setFilterStatus((s) => (s === "issues" ? "all" : "issues"))}
        />

        <div className="grid-main">
          <section className="card">
            <header className="card-header">
              <h2 className="card-title">
                <Icon.user size={14} /> Mes meetings synchronisés
                <span className="card-title-count">{filtered.length}</span>
              </h2>
              <div className="chips">
                <button
                  className="chip"
                  data-active={filterRoom === "all"}
                  onClick={() => setFilterRoom("all")}
                  type="button"
                >
                  Toutes les salles
                </button>
                {ROOMS.map((r) => (
                  <button
                    key={r.id}
                    className="chip"
                    data-active={filterRoom === r.id}
                    onClick={() => setFilterRoom(r.id)}
                    type="button"
                  >
                    <span className="chip-dot" style={{ background: r.color }} />
                    {r.name}
                  </button>
                ))}
              </div>
            </header>

            <ul className="events">
              {filtered.map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  selected={e.id === selectedId && drawerOpen}
                  onClick={() => {
                    setSelectedId(e.id);
                    setDrawerOpen(true);
                  }}
                />
              ))}
              {filtered.length === 0 && (
                <li style={{ padding: "60px 20px", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
                  Aucun meeting sur ce jour.
                </li>
              )}
            </ul>
          </section>

          <aside className="side-stack">
            <section className="card">
              <header className="card-header">
                <h2 className="card-title">Mes salles réservées</h2>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>au total</span>
              </header>
              <div className="room-list">
                {ROOMS.map((r) => {
                  const shown = roomLoad[r.id] || 0;
                  return (
                    <div key={r.id} className="room-item" onClick={() => setFilterRoom(r.id)}>
                      <div className="room-avatar" style={{ background: r.color }}>
                        {r.name[0]}
                      </div>
                      <div>
                        <p className="room-info-name">{r.name}</p>
                        <span className="room-info-cap">{r.cap !== null ? `${r.cap} pl.` : "—"}</span>
                      </div>
                      <div className="room-load">
                        <strong>{shown}</strong>
                        <span>réservé{shown !== 1 ? "es" : "e"} par toi</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </aside>
        </div>
      </div>

      <EventDrawer
        event={selectedEvent}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        cancelAction={cancelBookingAction}
        onActionToast={showToast}
      />

      <div className="toast-wrap" data-open={!!toast}>
        <div className="toast">
          <span className="toast-icon">
            <Icon.check size={11} />
          </span>
          {toast}
        </div>
      </div>
    </>
  );
}

function KpiRow({
  counts,
  events,
  activeIssueFilter,
  onToggleIssueFilter,
}: {
  counts: { synced: number; syncing: number; conflict: number; error: number };
  events: EventVM[];
  activeIssueFilter: boolean;
  onToggleIssueFilter: () => void;
}) {
  const issuesCount = counts.conflict + counts.error;
  // Real metric: bookings actually synced this calendar month
  const now = new Date();
  const m = now.getMonth();
  const y = now.getFullYear();
  const syncedThisMonth = events.filter((e) => {
    if (e.status !== "synced") return false;
    const d = new Date(e.startISO);
    return d.getMonth() === m && d.getFullYear() === y;
  }).length;
  const upcoming = events.filter((e) => e.status === "synced" && new Date(e.startISO) > now).length;

  // Estimated time saved: each manual Skedda booking takes ~40s (open Skedda,
  // navigate to slot, fill form, confirm). Multiplied by all-time synced bookings.
  const totalSynced = counts.synced;
  const minutesSaved = Math.round((totalSynced * 40) / 60);
  return (
    <div className="kpi-row kpi-row-2">
      <button
        type="button"
        className="kpi"
        onClick={issuesCount > 0 ? onToggleIssueFilter : undefined}
        style={{
          textAlign: "left",
          cursor: issuesCount > 0 ? "pointer" : "default",
          outline: activeIssueFilter ? "2px solid var(--warning)" : "none",
          outlineOffset: "-2px",
        }}
        aria-pressed={activeIssueFilter}
      >
        <Spark color="var(--warning)" pattern="dip" />
        <span className="kpi-label">
          À regarder · sur tes meetings
          {issuesCount > 0 && (
            <span style={{ marginLeft: 6, fontSize: 11, color: "var(--ink-3)", textTransform: "none", letterSpacing: 0 }}>
              {activeIssueFilter ? "(cliquer pour tout voir)" : "(cliquer pour filtrer)"}
            </span>
          )}
        </span>
        <span className="kpi-value">{issuesCount}</span>
        <span className="kpi-meta warn">
          {counts.conflict ? <strong>{counts.conflict} conflit{counts.conflict > 1 ? "s" : ""} de salle</strong> : "Aucun conflit ✓"}
          {counts.error ? (
            <>
              {" · "}
              <strong>{counts.error} erreur{counts.error > 1 ? "s" : ""} de sync</strong>
            </>
          ) : null}
        </span>
      </button>
      <div className="kpi">
        <Spark color="var(--brand)" pattern="up" />
        <span className="kpi-label">Temps gagné · estimé</span>
        <span className="kpi-value">
          {minutesSaved}
          <span style={{ fontSize: 18, color: "var(--ink-3)", marginLeft: 4, fontWeight: 500 }}>min</span>
        </span>
        <span className="kpi-meta">
          <strong>{syncedThisMonth}</strong> salle{syncedThisMonth > 1 ? "s" : ""} bookée{syncedThisMonth > 1 ? "s" : ""} ce mois · <strong>{upcoming}</strong> à venir
        </span>
      </div>
    </div>
  );
}

function Spark({ color, pattern }: { color: string; pattern: "up" | "flat" | "dip" }) {
  const paths = {
    up: "M2,22 L10,18 L18,20 L26,12 L34,14 L42,8 L50,10 L58,4 L62,6",
    flat: "M2,14 L10,12 L18,15 L26,11 L34,14 L42,12 L50,15 L58,12 L62,14",
    dip: "M2,8 L10,10 L18,18 L26,14 L34,22 L42,20 L50,16 L58,18 L62,15",
  };
  return (
    <svg className="kpi-spark" viewBox="0 0 64 28" fill="none">
      <path d={paths[pattern]} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="62" cy={pattern === "up" ? 6 : pattern === "flat" ? 14 : 15} r="2" fill={color} />
    </svg>
  );
}

function EventRow({ event, selected, onClick }: { event: EventVM; selected: boolean; onClick: () => void }) {
  const room = event.room ? roomById(event.room) : null;
  return (
    <li className="event" data-selected={selected} onClick={onClick}>
      <div className="event-time">
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
          {shortDayLabel(new Date(event.startISO))}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{event.start}</span>
        <small>{event.end}</small>
      </div>
      <div className="event-body">
        <h3 className="event-title">{event.title}</h3>
        <div className="event-meta">
          {room ? (
            <span className="room-pill">
              <span className="room-icon" style={{ background: room.color }}>
                {room.name[0]}
              </span>
              {room.name}
            </span>
          ) : (
            <span className="room-pill">
              <span className="room-icon" style={{ background: "var(--ink-4)" }}>?</span>—
            </span>
          )}
          <span className="event-meta-sep">·</span>
          <span>
            <Icon.user size={12} /> {event.organizerInitials}
          </span>
          <span className="event-meta-sep">·</span>
          <span>{durationLabel(event.start, event.end)}</span>
          <span className="event-meta-sep">·</span>
          <span>{event.attendees.length} invités</span>
        </div>
      </div>
      <div className="event-status">
        <SyncBadge status={event.status} />
      </div>
    </li>
  );
}

function SyncBadge({ status }: { status: EventVM["status"] }) {
  if (status === "synced")
    return (
      <span className="sync-badge">
        <Icon.check size={11} />
        Synced
      </span>
    );
  if (status === "syncing")
    return (
      <span className="sync-badge pending">
        <span className="dot" />
        Syncing…
      </span>
    );
  if (status === "conflict")
    return (
      <span className="sync-badge conflict">
        <Icon.alert size={11} />
        Conflit
      </span>
    );
  if (status === "error")
    return (
      <span className="sync-badge error">
        <Icon.alert size={11} />
        Erreur
      </span>
    );
  return null;
}
