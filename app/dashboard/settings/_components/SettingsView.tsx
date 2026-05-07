"use client";

import { useState, useEffect, useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { initials } from "@/lib/ui/format";
import type { BookingRules } from "@/lib/users";
import type { RoomName } from "@/lib/bookings";
import { activateWatchAction, deactivateWatchAction, saveRulesAction, saveRoomPriorityAction } from "../../actions";
import { PriorityDnD } from "./PriorityDnD";
import { PhoneEditor } from "./PhoneEditor";

interface Props {
  user: {
    name: string;
    email: string;
    firstName: string;
    lastName: string;
    telephone: string;
  };
  rules: BookingRules;
  priority: RoomName[];
  watchActive: boolean;
  initialSection: string;
  flashSuccess: string | null;
  flashError: string | null;
}

const SECTIONS = [
  { id: "connections", label: "Connexions" },
  { id: "rules", label: "Règles de réservation" },
  { id: "notifs", label: "Notifications" },
  { id: "account", label: "Mon compte" },
];

export function SettingsView({ user, rules, priority, watchActive, initialSection, flashSuccess, flashError }: Props) {
  const [active, setActive] = useState(initialSection);
  const [toast, setToast] = useState<string | null>(flashSuccess || flashError || null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Tes <em>réglages</em>.
          </h1>
          <p className="page-subtitle">
            <span className="me-pill">
              <Icon.user size={11} /> Toi · {user.email}
            </span>
            Tes connexions, tes règles de salle et comment on te prévient.
          </p>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className="settings-nav-item"
              data-active={active === s.id}
              onClick={() => setActive(s.id)}
              type="button"
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {active === "connections" && <ConnectionsSection user={user} watchActive={watchActive} />}
          {active === "rules" && <RulesSection rules={rules} priority={priority} />}
          {active === "notifs" && <NotifsSection telephone={user.telephone} email={user.email} />}
          {active === "account" && <AccountSection user={user} />}
        </div>
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

function ConnectionCard({
  icon,
  name,
  email,
  ok,
  metaPrimary,
  metaSecondary,
}: {
  icon: React.ReactNode;
  name: string;
  email: string;
  ok: boolean;
  metaPrimary: string;
  metaSecondary: string;
}) {
  return (
    <div className="connection-card" data-status={ok ? "ok" : "error"}>
      <div className="connection-card-icon">{icon}</div>
      <div className="connection-card-body">
        <div className="connection-card-name">{name}</div>
        <div className="connection-card-email">{email}</div>
      </div>
      <span className={`status-pill ${ok ? "free" : "occupied"}`} style={{ alignSelf: "flex-start" }}>
        <span className="status-pill-dot" />
        {ok ? "Connecté" : "Erreur"}
      </span>
      <div className="connection-card-meta">
        <span>
          <strong>{metaPrimary}</strong>
        </span>
        <span style={{ color: "var(--ink-3)" }}>{metaSecondary}</span>
      </div>
    </div>
  );
}

function ConnectionsSection({ user, watchActive }: { user: Props["user"]; watchActive: boolean }) {
  return (
    <section>
      <h2 className="settings-h">Connexions</h2>
      <p className="settings-sub">L'état du lien entre tes deux outils. Si l'un tombe, la sync s'arrête.</p>

      <div className="connection-pair">
        <ConnectionCard
          icon={<Icon.google size={28} />}
          name="Google Calendar"
          email={user.email}
          ok={true}
          metaPrimary="Lecture & écriture"
          metaSecondary={watchActive ? "Surveillance active" : "Surveillance inactive"}
        />
        <div className="connection-arrow">
          <span className="connection-arrow-line" />
          <span className="connection-arrow-pulse">
            <Icon.check size={14} />
          </span>
          <span className="connection-arrow-line" />
        </div>
        <ConnectionCard
          icon={<Icon.skedda size={28} />}
          name="Skedda"
          email="antlerfrance.skedda.com"
          ok={true}
          metaPrimary="Lecture & écriture"
          metaSecondary="Bookings via API HTTP"
        />
      </div>

      <div className="settings-row">
        {watchActive ? (
          <form action={deactivateWatchAction}>
            <button className="btn btn-danger" type="submit">
              <Icon.unlink size={14} /> Désactiver la surveillance
            </button>
          </form>
        ) : (
          <form action={activateWatchAction}>
            <button className="btn btn-primary" type="submit">
              <Icon.refresh size={14} /> Activer la surveillance
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function RulesSection({ rules, priority }: { rules: BookingRules; priority: RoomName[] }) {
  const [order, setOrder] = useState<RoomName[]>(priority);
  const [savedHint, setSavedHint] = useState(false);
  const [, startTransition] = useTransition();

  const handleOrderChange = (next: RoomName[]) => {
    setOrder(next);
    const fd = new FormData();
    fd.set("priority", next.join(","));
    startTransition(async () => {
      const r = await saveRoomPriorityAction(fd);
      if (r.ok) {
        setSavedHint(true);
        setTimeout(() => setSavedHint(false), 1500);
      }
    });
  };

  return (
    <section>
      <h2 className="settings-h">Règles de réservation auto</h2>
      <p className="settings-sub">
        Quand au moins une règle activée matche ton meeting Google, on te réserve une salle automatiquement.
      </p>

      <form action={saveRulesAction}>
        <div className="rule-list" style={{ gap: 12 }}>
          <RuleCard
            id="externalAttendee"
            title="Au moins un invité externe"
            help="Déclenche si un invité a un email hors @muchbetter.ai. Recommandé."
            enabled={rules.externalAttendee.enabled}
          />
          <RuleCard
            id="titleKeywords"
            title="Mot-clé dans le titre"
            help="Le titre du meeting contient un de ces mots (insensible à la casse)."
            enabled={rules.titleKeywords.enabled}
            list={rules.titleKeywords.keywords}
            placeholder="demo, kickoff, 1:1…"
          />
          <RuleCard
            id="invitedEmails"
            title="Email invité spécifique"
            help="Un de ces emails est dans la liste des invités."
            enabled={rules.invitedEmails.enabled}
            list={rules.invitedEmails.emails}
            placeholder="prospect@bigco.com, alice@example.com"
          />
          <RuleCard
            id="descriptionKeywords"
            title="Mot-clé dans la description"
            help="La description du meeting contient un de ces mots. Pratique pour forcer un booking."
            enabled={rules.descriptionKeywords.enabled}
            list={rules.descriptionKeywords.keywords}
            placeholder="ROOM_BOOK, room"
          />
        </div>

        <button className="btn btn-primary" type="submit" style={{ marginBottom: 8 }}>
          <Icon.check size={14} /> Enregistrer les règles
        </button>
      </form>

      <div className="settings-divider" />

      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h3 className="settings-h-sub" style={{ margin: 0 }}>Choix de la salle</h3>
        {savedHint && (
          <span style={{ fontSize: 12, color: "var(--success)" }}>
            <Icon.check size={11} /> ordre enregistré
          </span>
        )}
      </div>

      <PriorityDnD initialOrder={order} onChange={handleOrderChange} />
    </section>
  );
}

function RuleCard({
  id,
  title,
  help,
  enabled,
  list,
  placeholder,
}: {
  id: string;
  title: string;
  help: string;
  enabled: boolean;
  list?: string[];
  placeholder?: string;
}) {
  const [on, setOn] = useState(enabled);
  return (
    <div
      className="rule-row"
      data-active={on}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 12,
        padding: "14px 16px",
      }}
    >
      <input type="hidden" name={`${id}_enabled`} value={on ? "on" : ""} />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <button
          className="rule-toggle"
          data-active={on}
          onClick={() => setOn((v) => !v)}
          aria-pressed={on}
          aria-label={on ? "Désactiver" : "Activer"}
          type="button"
        >
          <span className="rule-toggle-dot" />
        </button>
        <div style={{ flex: 1 }}>
          <div className="toggle-row-title">{title}</div>
          <div className="toggle-row-desc">{help}</div>
        </div>
      </div>
      {list !== undefined && on && (
        <input
          className="input"
          name={`${id}_list`}
          defaultValue={list.join(", ")}
          placeholder={placeholder}
          style={{ marginLeft: 48, width: "calc(100% - 48px)" }}
        />
      )}
    </div>
  );
}

function NotifsSection({ telephone, email }: { telephone: string; email: string }) {
  return (
    <section>
      <h2 className="settings-h">Notifications</h2>
      <p className="settings-sub">Comment on te prévient quand quelque chose mérite ton attention.</p>

      <h3 className="settings-h-sub">SMS · {telephone}</h3>
      <ToggleRowDisplay enabled title="Conflit de salle détecté" desc="Quand deux meetings se disputent la même salle." />
      <ToggleRowDisplay enabled title="Erreur de sync" desc="Token expiré, Skedda indisponible, etc." />
      <ToggleRowDisplay enabled title="Confirmation de réservation" desc="Quand on a réussi à booker une salle pour toi." />

      <div className="settings-divider" />

      <h3 className="settings-h-sub">Email · {email}</h3>
      <ToggleRowDisplay enabled title="Confirmation de réservation" desc="Avec un lien pour annuler en 1 clic." />

      <p className="toggle-row-desc" style={{ marginTop: 16 }}>
        Le détail des canaux sera customisable bientôt. Pour l'instant tout est activé par défaut.
      </p>
    </section>
  );
}

function ToggleRowDisplay({ enabled, title, desc }: { enabled: boolean; title: string; desc: string }) {
  return (
    <div className="toggle-row">
      <div style={{ flex: 1 }}>
        <div className="toggle-row-title">{title}</div>
        <div className="toggle-row-desc">{desc}</div>
      </div>
      <button
        className="rule-toggle"
        data-active={enabled}
        aria-pressed={enabled}
        type="button"
        disabled
        style={{ opacity: 0.7 }}
      >
        <span className="rule-toggle-dot" />
      </button>
    </div>
  );
}

function AccountSection({ user }: { user: Props["user"] }) {
  return (
    <section>
      <h2 className="settings-h">Mon compte</h2>
      <p className="settings-sub">Les infos que Roombooker connaît de toi.</p>

      <div className="account-card">
        <div className="avatar avatar-lg">{initials(user.name)}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>{user.name}</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{user.email}</div>
        </div>
      </div>

      <div className="settings-divider" />

      <div className="settings-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Numéro de mobile</div>
          <PhoneEditor initial={user.telephone} />
        </div>
      </div>

      <div className="settings-divider" />

      <form action="/api/auth/logout" method="POST">
        <button className="btn btn-danger" type="submit">
          <Icon.unlink size={14} /> Se déconnecter
        </button>
      </form>
    </section>
  );
}
