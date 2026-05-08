"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { initials } from "@/lib/ui/format";
import type { AdminStats, ActivityItem } from "@/lib/admin-stats";

function formatHM(minutes: number): { value: string; unit: string } {
  if (minutes <= 0) return { value: "0", unit: "min" };
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return { value: String(m), unit: "min" };
  if (m === 0) return { value: String(h), unit: "h" };
  return { value: `${h} h ${String(m).padStart(2, "0")}`, unit: "" };
}

function relTime(d: Date | null): string {
  if (!d) return "—";
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `il y a ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const days = Math.floor(h / 24);
  return `il y a ${days}j`;
}

function ActivityIcon({ kind }: { kind: ActivityItem["kind"] }) {
  if (kind === "error") return <span className="activity-dot activity-dot-error" />;
  if (kind === "notify") return <span className="activity-dot activity-dot-info" />;
  if (kind === "watch") return <span className="activity-dot activity-dot-info" />;
  return <span className="activity-dot activity-dot-ok" />;
}

export function AdminView({ stats }: { stats: AdminStats }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [refreshedAt, setRefreshedAt] = useState<Date>(new Date());
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    setRefreshedAt(new Date());
  }, [stats]);

  // Keep relative-time labels alive
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = () => {
    startTransition(() => router.refresh());
  };

  const time = formatHM(stats.minutesSaved);
  const errorState: "ok" | "alert" = stats.errors > 0 ? "alert" : "ok";
  const stale = (now.getTime() - refreshedAt.getTime()) / 1000 > 90;

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <em>Pilotage</em> Roombooker.
          </h1>
          <p className="page-subtitle">
            <span className="me-pill">
              <Icon.user size={11} /> Admin
            </span>
            Vue interne — santé du système et valeur livrée à l'équipe.
          </p>
        </div>
        <div className="settings-row">
          <span className="topnav-status" data-stale={stale} title={refreshedAt.toLocaleTimeString("fr-FR")}>
            <span className="status-dot" />
            <span>Mis à jour {relTime(refreshedAt)}</span>
          </span>
          <Link className="btn btn-ghost" href="/onboarding?demo=1" title="Rejoue l'onboarding sans rien sauvegarder">
            <Icon.sparkle size={14} /> Simuler l'onboarding
          </Link>
          <button className="btn btn-ghost" onClick={handleRefresh} disabled={isPending} type="button">
            <Icon.refresh size={14} /> Actualiser
          </button>
        </div>
      </div>

      <div className="kpi-hero">
        <div>
          <div className="kpi-label">Temps gagné · équipe</div>
          <div className="kpi-hero-value">
            {time.value}
            {time.unit && <span className="kpi-hero-unit"> {time.unit}</span>}
          </div>
          <div className="kpi-hero-meta">
            ~3 min gagnées par réservation · sur <strong>{stats.bookingsBooked}</strong> réservations · {stats.totalUsers} commerciaux
          </div>
        </div>
        <div className="kpi-hero-side">
          <div className="kpi-hero-side-row">
            <span>7 derniers jours</span>
            <strong>+{stats.bookingsLast7d}</strong>
          </div>
          <div className="kpi-hero-side-row">
            <span>Dernière activité</span>
            <strong>{relTime(stats.lastActivity)}</strong>
          </div>
        </div>
      </div>

      <div className="kpi-row kpi-row-5">
        <div className="kpi">
          <div className="kpi-label">Réservations</div>
          <div className="kpi-value">{stats.bookingsBooked}</div>
          <div className="kpi-meta">depuis le lancement</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">SMS envoyés</div>
          <div className="kpi-value">{stats.smsSent}</div>
          <div className="kpi-meta">notifications</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Emails envoyés</div>
          <div className="kpi-value">{stats.emailsSent}</div>
          <div className="kpi-meta">notifications</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Connexions actives</div>
          <div className="kpi-value">
            {stats.activeConnections}
            <span style={{ fontSize: 18, color: "var(--ink-3)", fontWeight: 500 }}> / {stats.totalUsers}</span>
          </div>
          <div className="kpi-meta">Google Calendar</div>
        </div>
        <div className="kpi kpi-errors" data-state={errorState}>
          <div className="kpi-label">{errorState === "alert" ? "À regarder" : "Incidents"}</div>
          <div className="kpi-value">{stats.errors}</div>
          <div className="kpi-meta">
            {errorState === "alert"
              ? `${stats.errorsLast7d} sur 7 derniers jours`
              : "tout fonctionne"}
          </div>
        </div>
      </div>

      <div className="admin-secondary">
        <section className="admin-card">
          <div className="admin-card-head">
            <h2 className="settings-h-sub" style={{ margin: 0 }}>Activité récente</h2>
            <span className="kpi-meta">10 derniers événements</span>
          </div>
          {stats.recentActivity.length === 0 ? (
            <div className="admin-empty">Pas encore d'activité.</div>
          ) : (
            <ul className="activity-list">
              {stats.recentActivity.map((a, i) => (
                <li key={i} className="activity-row">
                  <ActivityIcon kind={a.kind} />
                  <span className="activity-text">{a.text}</span>
                  <span className="activity-time">{relTime(new Date(a.ts))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-card">
          <div className="admin-card-head">
            <h2 className="settings-h-sub" style={{ margin: 0 }}>Équipe</h2>
            <span className="kpi-meta">{stats.users.length} commerciaux</span>
          </div>
          {stats.users.length === 0 ? (
            <div className="admin-empty">Pas encore de commercial inscrit.</div>
          ) : (
            <table className="admin-team">
              <thead>
                <tr>
                  <th>Commercial</th>
                  <th>Résa</th>
                  <th>Temps</th>
                  <th>Dernière</th>
                  <th>Sync</th>
                </tr>
              </thead>
              <tbody>
                {stats.users.map((u) => {
                  const t = formatHM(u.minutesSaved);
                  return (
                    <tr key={u.userId}>
                      <td>
                        <span className="admin-team-user">
                          <span className="avatar avatar-sm">{initials(u.name)}</span>
                          <span>{u.name}</span>
                        </span>
                      </td>
                      <td>{u.bookings}</td>
                      <td>{u.minutesSaved > 0 ? `${t.value}${t.unit ? " " + t.unit : ""}` : "—"}</td>
                      <td>{relTime(u.lastBookingAt)}</td>
                      <td>
                        <span className={`status-pill ${u.watchActive ? "free" : "occupied"}`}>
                          <span className="status-pill-dot" />
                          {u.watchActive ? "Actif" : "Inactif"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
