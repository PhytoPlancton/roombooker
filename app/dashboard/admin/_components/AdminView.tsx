"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { initials } from "@/lib/ui/format";
import type { AdminStats, ActivityItem } from "@/lib/admin-stats";
import type { ChannelAvailability } from "@/lib/service-state";
import { deleteUserAction, setChannelAvailabilityAction } from "../../actions";

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

export function AdminView({
  stats,
  availability,
  currentUserId,
}: {
  stats: AdminStats;
  availability: ChannelAvailability;
  currentUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [refreshedAt, setRefreshedAt] = useState<Date>(new Date());
  const [now, setNow] = useState<Date>(new Date());
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

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

      <section className="admin-card">
        <div className="admin-card-head">
          <h2 className="settings-h-sub" style={{ margin: 0 }}>
            Utilisation Skedda
          </h2>
          <span className="kpi-meta">
            Skedda n'expose pas nos crédits restants — on suit nos volumes et les refus pour repérer un quota qui se rapproche.
          </span>
        </div>
        <div className="kpi-row" style={{ marginBottom: 0 }}>
          <div className="kpi">
            <div className="kpi-label">Bookings · 24h</div>
            <div className="kpi-value">{stats.bookingsLast24h}</div>
            <div className="kpi-meta">succès sur Skedda</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Bookings · 7j</div>
            <div className="kpi-value">{stats.bookingsLast7d}</div>
            <div className="kpi-meta">succès sur Skedda</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Bookings · 30j</div>
            <div className="kpi-value">{stats.bookingsLast30d}</div>
            <div className="kpi-meta">succès sur Skedda</div>
          </div>
          <div
            className="kpi kpi-errors"
            data-state={stats.quotaExceededLast7d > 0 ? "alert" : "ok"}
          >
            <div className="kpi-label">Quotas refusés · 7j</div>
            <div className="kpi-value">{stats.quotaExceededLast7d}</div>
            <div className="kpi-meta">
              {stats.quotaExceededLast7d > 0
                ? "Skedda a refusé pour quota"
                : "aucun refus crédit récent"}
            </div>
          </div>
        </div>
      </section>

      <section className="admin-card admin-channels">
        <div className="admin-card-head">
          <h2 className="settings-h-sub" style={{ margin: 0 }}>
            État des canaux de notification
          </h2>
          <span className="kpi-meta">
            Coupe un canal côté Roombooker — tous les users voient le toggle correspondant grisé en pause.
          </span>
        </div>
        <div className="admin-channels-grid">
          <ChannelKillSwitch channel="sms" label="SMS" on={availability.sms} />
          <ChannelKillSwitch channel="whatsapp" label="WhatsApp" on={availability.whatsapp} />
          <ChannelKillSwitch channel="email" label="Email" on={availability.email} />
        </div>
      </section>

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
                  <th title="Bookings confirmés sur Skedda / bookings tentés au total">Skedda</th>
                  <th title="SMS de notification effectivement délivrés">SMS</th>
                  <th title="Dernière fois que ce user a ouvert l'app">Dern. login</th>
                  <th title="Dernière fois que Roombooker a fait quelque chose pour ce user (booking, watch, notif…). Inclut le flux webhook en background.">Dern. activité</th>
                  <th>Sync</th>
                  <th style={{ width: 36 }} aria-label="Supprimer" />
                </tr>
              </thead>
              <tbody>
                {stats.users.map((u) => {
                  const isSelf = u.userId === currentUserId;
                  // X / Y display: confirmed bookings over total attempts.
                  // When all attempts succeeded (or zero of either), drop the
                  // denominator to avoid visual noise.
                  const showRatio = u.bookingsAttempted > u.bookings;
                  return (
                    <tr key={u.userId}>
                      <td>
                        <span className="admin-team-user">
                          <span className="avatar avatar-sm">{initials(u.name)}</span>
                          <span>{u.name}</span>
                        </span>
                      </td>
                      <td>
                        <strong>{u.bookings}</strong>
                        {showRatio && (
                          <span style={{ color: "var(--ink-3)" }}>
                            {" "}/ {u.bookingsAttempted}
                          </span>
                        )}
                      </td>
                      <td>{u.smsCount > 0 ? u.smsCount : "—"}</td>
                      <td>{relTime(u.lastSigninAt)}</td>
                      <td>{relTime(u.lastActivityAt)}</td>
                      <td>
                        <span className={`status-pill ${u.watchActive ? "free" : "occupied"}`}>
                          <span className="status-pill-dot" />
                          {u.watchActive ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td>
                        {!isSelf && (
                          <DeleteUserButton
                            userId={u.userId}
                            name={u.name}
                            email={u.email}
                            onResult={(msg) => setToast(msg)}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <div className="toast-wrap" data-open={!!toast}>
        <div className="toast">
          <span className="toast-icon">
            <Icon.check size={11} />
          </span>
          {toast}
        </div>
      </div>
    </main>
  );
}

/**
 * Destructive admin action: wipes a team member's account. Uses a
 * two-click confirmation pattern — first click swaps the icon to a
 * "confirm" red pill that auto-reverts after 4s if not clicked again.
 * Avoids accidental clicks while not requiring a full modal.
 */
function DeleteUserButton({
  userId,
  name,
  email,
  onResult,
}: {
  userId: string;
  name: string;
  email: string;
  onResult: (msg: string) => void;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);

  const handleClick = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    const fd = new FormData();
    fd.set("userId", userId);
    startTransition(async () => {
      const r = await deleteUserAction(fd);
      setArmed(false);
      if (r.ok) {
        const extra = r.bookingsCancelled && r.bookingsCancelled > 0
          ? ` — ${r.bookingsCancelled} résa(s) annulée(s) sur Skedda`
          : "";
        onResult(`${name} supprimé${extra}`);
        router.refresh();
      } else {
        onResult(`Erreur suppression ${name} : ${r.error || "inconnue"}`);
      }
    });
  };

  if (pending) {
    return (
      <button className="admin-delete-btn pending" type="button" disabled aria-label={`Suppression de ${name}...`}>
        …
      </button>
    );
  }

  if (armed) {
    return (
      <button
        className="admin-delete-btn armed"
        type="button"
        onClick={handleClick}
        title={`Cliquer à nouveau pour confirmer la suppression définitive de ${name} (${email})`}
        aria-label={`Confirmer la suppression de ${name}`}
      >
        Confirmer ?
      </button>
    );
  }

  return (
    <button
      className="admin-delete-btn"
      type="button"
      onClick={handleClick}
      title={`Supprimer ${name} (${email})`}
      aria-label={`Supprimer ${name}`}
    >
      <Icon.x size={14} />
    </button>
  );
}

/**
 * Per-channel admin kill switch. Click flips availability via the server
 * action, then router.refresh() pulls the new server state. Optimistic local
 * state keeps the UI responsive between click and refresh.
 */
function ChannelKillSwitch({
  channel,
  label,
  on,
}: {
  channel: "sms" | "whatsapp" | "email";
  label: string;
  on: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState(on);
  useEffect(() => setLocal(on), [on]);

  const toggle = () => {
    const next = !local;
    setLocal(next);
    const fd = new FormData();
    fd.set("channel", channel);
    fd.set("enabled", next ? "on" : "");
    startTransition(async () => {
      await setChannelAvailabilityAction(fd);
      router.refresh();
    });
  };

  return (
    <div className="admin-channel" data-on={local} data-pending={pending || undefined}>
      <div className="admin-channel-head">
        <span className="admin-channel-name">{label}</span>
        <span className={`admin-channel-state ${local ? "is-on" : "is-off"}`}>
          {local ? "Actif" : "En pause"}
        </span>
      </div>
      <button
        type="button"
        className="rule-toggle"
        data-active={local}
        aria-pressed={local}
        aria-label={local ? `Mettre ${label} en pause` : `Réactiver ${label}`}
        onClick={toggle}
        disabled={pending}
      >
        <span className="rule-toggle-dot" />
      </button>
    </div>
  );
}
