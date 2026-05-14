"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { isToday, isThisWeek, startOfDay } from "date-fns";
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
  const [sortMode, setSortMode] = useState<"upcoming" | "recent">("upcoming");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(20);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(flashSuccess || flashError || null);

  // Persist the sort choice across reloads (per browser).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("roombooker.meetingsSort");
    if (saved === "recent" || saved === "upcoming") setSortMode(saved);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("roombooker.meetingsSort", sortMode);
  }, [sortMode]);

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

  const baseFiltered = useMemo(() => {
    return events
      .filter((e) => filterRoom === "all" || e.room === filterRoom)
      .filter((e) => filterStatus === "all" || e.status === "conflict" || e.status === "error");
  }, [events, filterRoom, filterStatus]);

  // "À venir" view: upcoming non-cancelled bucketed by Today / This week / Later,
  // and the past+cancelled list disclosed via "Voir l'historique".
  const grouped = useMemo(() => {
    const todayStart = startOfDay(new Date());
    const upcoming = baseFiltered
      .filter((e) => e.status !== "cancelled" && new Date(e.startISO) >= todayStart)
      .sort((a, b) => (a.startISO > b.startISO ? 1 : -1));
    const todays: EventVM[] = [];
    const thisWeek: EventVM[] = [];
    const later: EventVM[] = [];
    for (const e of upcoming) {
      const d = new Date(e.startISO);
      if (isToday(d)) todays.push(e);
      else if (isThisWeek(d, { weekStartsOn: 1 })) thisWeek.push(e);
      else later.push(e);
    }
    const history = baseFiltered
      .filter((e) => e.status === "cancelled" || new Date(e.startISO) < todayStart)
      .sort((a, b) => (a.startISO > b.startISO ? -1 : 1));
    return { todays, thisWeek, later, history, upcomingCount: upcoming.length };
  }, [baseFiltered]);

  // "Récents" view: flat list ordered by last activity.
  const recentSorted = useMemo(() => {
    return [...baseFiltered].sort((a, b) => (a.updatedAtISO > b.updatedAtISO ? -1 : 1));
  }, [baseFiltered]);

  const issuesCount = useMemo(() => {
    return baseFiltered.filter((e) => e.status === "conflict" || e.status === "error").length;
  }, [baseFiltered]);

  // When there's nothing upcoming, auto-disclose the history so the user
  // doesn't stare at an empty card.
  useEffect(() => {
    if (sortMode === "upcoming" && grouped.upcomingCount === 0 && grouped.history.length > 0) {
      setHistoryOpen(true);
    }
  }, [sortMode, grouped.upcomingCount, grouped.history.length]);

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
            <header className="card-header card-header-title-only">
              <h2 className="card-title">
                <Icon.user size={14} /> Mes meetings synchronisés
                {sortMode === "upcoming" ? (
                  <span className="card-title-count">
                    {grouped.upcomingCount} à venir
                    {issuesCount > 0 && ` · ${issuesCount} ⚠`}
                  </span>
                ) : (
                  <span className="card-title-count">{recentSorted.length}</span>
                )}
              </h2>
            </header>
            <div className="card-controls">
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
              <div
                className="scope-toggle"
                role="tablist"
                aria-label="Trier les meetings"
              >
                <button
                  className="scope-btn"
                  data-active={sortMode === "upcoming"}
                  aria-pressed={sortMode === "upcoming"}
                  onClick={() => setSortMode("upcoming")}
                  type="button"
                >
                  À venir
                </button>
                <button
                  className="scope-btn"
                  data-active={sortMode === "recent"}
                  aria-pressed={sortMode === "recent"}
                  onClick={() => setSortMode("recent")}
                  type="button"
                >
                  Récents
                </button>
              </div>
            </div>

            <ul className="events">
              {sortMode === "upcoming" ? (
                <>
                  {grouped.upcomingCount === 0 && (
                    <li className="events-empty-banner">
                      Aucun meeting à venir. Voici tes derniers synchronisés.
                    </li>
                  )}
                  {grouped.todays.length > 0 && (
                    <li className="events-section-h">Aujourd'hui · {grouped.todays.length}</li>
                  )}
                  {grouped.todays.map((e) => (
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
                  {grouped.thisWeek.length > 0 && (
                    <li className="events-section-h">Cette semaine · {grouped.thisWeek.length}</li>
                  )}
                  {grouped.thisWeek.map((e) => (
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
                  {grouped.later.length > 0 && (
                    <li className="events-section-h">Plus tard · {grouped.later.length}</li>
                  )}
                  {grouped.later.map((e) => (
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
                  {grouped.history.length > 0 && (
                    <li className="events-disclosure-wrap">
                      <button
                        className="events-disclosure"
                        onClick={() => setHistoryOpen((o) => !o)}
                        type="button"
                        aria-expanded={historyOpen}
                      >
                        <Icon.chevR
                          size={12}
                        />
                        <span>
                          {historyOpen
                            ? "Masquer l'historique"
                            : `Voir l'historique (${grouped.history.length})`}
                        </span>
                      </button>
                    </li>
                  )}
                  {historyOpen &&
                    grouped.history.slice(0, historyLimit).map((e) => (
                      <EventRow
                        key={e.id}
                        event={e}
                        past
                        selected={e.id === selectedId && drawerOpen}
                        onClick={() => {
                          setSelectedId(e.id);
                          setDrawerOpen(true);
                        }}
                      />
                    ))}
                  {historyOpen && grouped.history.length > historyLimit && (
                    <li>
                      <button
                        className="events-load-more"
                        onClick={() => setHistoryLimit((l) => l + 20)}
                        type="button"
                      >
                        Voir plus
                      </button>
                    </li>
                  )}
                </>
              ) : (
                <>
                  {recentSorted.map((e) => (
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
                  {recentSorted.length === 0 && (
                    <li style={{ padding: "60px 20px", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
                      Aucun meeting.
                    </li>
                  )}
                </>
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

function EventRow({ event, selected, onClick, past }: { event: EventVM; selected: boolean; onClick: () => void; past?: boolean }) {
  const room = event.room ? roomById(event.room) : null;
  return (
    <li className="event" data-selected={selected} data-past={past || undefined} onClick={onClick}>
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
        <SyncBadge event={event} />
      </div>
    </li>
  );
}

function SyncBadge({ event }: { event: EventVM }) {
  const status = event.status;
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
  if (status === "deferred") {
    // Days until the cron will fire (meeting day − 10). At least 1 — once the
    // meeting enters Skedda's 10-day window, classifyStatus flips to "syncing".
    const msUntilBookable =
      new Date(event.startISO).getTime() - Date.now() - 10 * 86400_000;
    const daysUntilBookable = Math.max(1, Math.ceil(msUntilBookable / 86400_000));
    const bookableOn = new Date(Date.now() + msUntilBookable).toLocaleDateString(
      "fr-FR",
      { day: "2-digit", month: "long", timeZone: "Europe/Paris" },
    );
    return (
      <span
        className="sync-badge deferred"
        title={`Réservation programmée pour le ${bookableOn}. Skedda n'ouvre les créneaux que 10 jours à l'avance — on s'en occupe automatiquement, tu recevras un SMS dès que la salle est confirmée.`}
      >
        <Icon.clock size={11} />
        Programmé · J-{daysUntilBookable}
      </span>
    );
  }
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
  if (status === "cancelled")
    return (
      <span className="sync-badge cancelled">
        <Icon.x size={11} />
        Annulé
      </span>
    );
  return null;
}
