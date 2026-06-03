"use client";

import { useState, useEffect, useTransition, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { initials } from "@/lib/ui/format";
import type { BookingRules, NotifPrefs } from "@/lib/users";
import type { ChannelAvailability } from "@/lib/service-state";
import type { RoomName } from "@/lib/bookings";
import { activateWatchAction, deactivateWatchAction, saveBufferAction, saveNotifPrefsAction, saveRoomLocationModeAction, saveRulesAction, saveRoomPriorityAction, saveSkeddaTitleModeAction, testChannelAction } from "../../actions";
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
  roomLocationMode: "location" | "description" | "none";
  skeddaTitleMode: "none" | "anonymized" | "full";
  bufferMinutes: number;
  notifPrefs: NotifPrefs;
  channelAvailability: ChannelAvailability;
  watchActive: boolean;
  watchExpiryISO: string | null;
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

/** Pending navigation to ask the user about before discarding their edits. */
interface PendingExit {
  /** Action to run if the user picks "Quitter sans enregistrer". */
  discard: () => void;
  /** Action to run if the user picks "Enregistrer et quitter" (after a successful save). */
  saveThen: () => void;
}

export function SettingsView({ user, rules, priority, roomLocationMode, skeddaTitleMode, bufferMinutes, notifPrefs, channelAvailability, watchActive, watchExpiryISO, initialSection, flashSuccess, flashError }: Props) {
  const router = useRouter();
  const [active, setActive] = useState(initialSection);
  const [toast, setToast] = useState<string | null>(flashSuccess || flashError || null);
  const searchParams = useSearchParams();
  const sectionFromUrl = searchParams.get("section");

  // Booking-rules state lives at this level so it survives switching to
  // another sub-section (Notifications, Mon compte) and back. The sticky
  // "unsaved changes" bar only renders when the active section is Règles,
  // but the dirty flag stays armed across navigation so we can intercept
  // logout / top-nav clicks elsewhere in the page.
  const [draftRules, setDraftRules] = useState<BookingRules>(rules);
  const [savedRules, setSavedRules] = useState<BookingRules>(rules);
  const rulesDirty = useMemo(
    () => JSON.stringify(draftRules) !== JSON.stringify(savedRules),
    [draftRules, savedRules],
  );
  const [rulesSaving, startRulesSaveTransition] = useTransition();
  const [pendingExit, setPendingExit] = useState<PendingExit | null>(null);

  /** Submit the current draft to the server, update the saved snapshot on success. */
  const saveRules = (after?: () => void) => {
    startRulesSaveTransition(async () => {
      const r = await saveRulesAction(draftRules);
      if (r.ok) {
        setSavedRules(draftRules);
        setToast("Règles enregistrées");
        after?.();
      } else {
        setToast("Erreur lors de l'enregistrement");
      }
    });
  };

  /** Roll the draft back to the last saved snapshot. */
  const discardRules = () => {
    setDraftRules(savedRules);
  };

  useEffect(() => {
    if (sectionFromUrl && sectionFromUrl !== active) {
      setActive(sectionFromUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionFromUrl]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  // Latest-value refs so the navigation guard's listener (registered once
  // when rulesDirty flips on) always reads the current draft/saved/dirty
  // state without re-binding on every keystroke.
  const draftRef = useRef(draftRules);
  const savedRef = useRef(savedRules);
  const dirtyRef = useRef(rulesDirty);
  draftRef.current = draftRules;
  savedRef.current = savedRules;
  dirtyRef.current = rulesDirty;

  // Open the exit-confirmation modal. `proceed` runs after the user
  // resolves the prompt (either by discarding the draft or by saving it
  // successfully). Reads state via refs so it's safe to call from a
  // long-lived document listener as well as from a fresh button onClick.
  const askExitConfirmation = (proceed: () => void) => {
    setPendingExit({
      discard: () => {
        setDraftRules(savedRef.current);
        setPendingExit(null);
        proceed();
      },
      saveThen: () => {
        startRulesSaveTransition(async () => {
          const r = await saveRulesAction(draftRef.current);
          if (r.ok) {
            setSavedRules(draftRef.current);
            setPendingExit(null);
            setToast("Règles enregistrées");
            proceed();
          } else {
            setToast("Erreur lors de l'enregistrement");
          }
        });
      },
    });
  };
  // Expose the latest closure of askExitConfirmation via a ref so the
  // document-level listener (registered once per dirty cycle) keeps
  // calling the up-to-date function.
  const askRef = useRef(askExitConfirmation);
  askRef.current = askExitConfirmation;

  // Navigation guard. When the rules form is dirty:
  //  - beforeunload → native browser prompt covers tab close / refresh /
  //    typing a new URL / back through the URL bar.
  //  - click capture on the document → intercepts any <a href> click
  //    (Next.js Links, brand logo, avatar, sidebar links, etc.) so we can
  //    open the confirm modal before letting the navigation happen.
  //  - submit capture → covers the logout form action="/api/auth/logout".
  useEffect(() => {
    if (!rulesDirty) return;

    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href) return;
      // Skip anchors, externals, mailto, new-tab — they're not internal nav.
      if (href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto:")) return;
      if (a.getAttribute("target") === "_blank") return;
      // Same path? not actually navigating.
      const currentPath = window.location.pathname + window.location.search;
      if (href === currentPath) return;

      e.preventDefault();
      e.stopPropagation();
      askRef.current(() => router.push(href));
    };

    const onSubmit = (e: SubmitEvent) => {
      if (!dirtyRef.current) return;
      const form = e.target as HTMLFormElement | null;
      if (!form) return;
      const action = form.getAttribute("action");
      if (!action) return; // server actions have a function action — skip.
      if (action !== "/api/auth/logout") return;
      e.preventDefault();
      e.stopPropagation();
      askRef.current(() => form.submit());
    };

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [rulesDirty, router]);

  // Switch sub-section. If the user is on Règles and has unsaved edits,
  // prompt before leaving — the agent-recommended "no block" behavior
  // turned out to be wrong for our team (they expected the guard to
  // fire on Notifs/Account too).
  const handleSectionChange = (nextId: string) => {
    if (nextId === active) return;
    if (rulesDirty && active === "rules") {
      askExitConfirmation(() => setActive(nextId));
      return;
    }
    setActive(nextId);
  };

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
              onClick={() => handleSectionChange(s.id)}
              type="button"
            >
              {s.label}
              {s.id === "rules" && rulesDirty && (
                <span className="settings-nav-dot" aria-label="modifications non enregistrées" />
              )}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {active === "connections" && <ConnectionsSection user={user} watchActive={watchActive} watchExpiryISO={watchExpiryISO} />}
          {active === "rules" && (
            <RulesSection
              draftRules={draftRules}
              setDraftRules={setDraftRules}
              dirty={rulesDirty}
              saving={rulesSaving}
              onSave={() => saveRules()}
              onDiscard={discardRules}
              priority={priority}
              bufferMinutes={bufferMinutes}
            />
          )}
          {active === "notifs" && <NotifsSection telephone={user.telephone} email={user.email} mode={roomLocationMode} skeddaTitleMode={skeddaTitleMode} notifPrefs={notifPrefs} channelAvailability={channelAvailability} />}
          {active === "account" && <AccountSection user={user} />}
        </div>
      </div>

      {pendingExit && (
        <ExitConfirmModal
          saving={rulesSaving}
          onDiscard={pendingExit.discard}
          onSaveAndExit={pendingExit.saveThen}
          onCancel={() => setPendingExit(null)}
        />
      )}

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
 * Hard-exit confirmation dialog. Only shown when the user tries to
 * navigate away (Link click, logout submit) with unsaved rule changes.
 * Tab close / refresh fall back to the native beforeunload prompt
 * because that's the only thing the browser lets us hook there.
 */
function ExitConfirmModal({
  saving,
  onDiscard,
  onSaveAndExit,
  onCancel,
}: {
  saving: boolean;
  onDiscard: () => void;
  onSaveAndExit: () => void;
  onCancel: () => void;
}) {
  // Focus the primary action on mount + handle Esc to cancel.
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Quitter sans enregistrer&nbsp;?</h3>
        <p className="modal-body">
          Vos modifications aux règles seront perdues.
        </p>
        <div className="modal-actions">
          <button className="btn" type="button" onClick={onCancel} disabled={saving}>
            Annuler
          </button>
          <button
            className="btn btn-ghost-danger"
            type="button"
            onClick={onDiscard}
            disabled={saving}
          >
            Quitter sans enregistrer
          </button>
          <button
            ref={primaryRef}
            className="btn btn-primary"
            type="button"
            onClick={onSaveAndExit}
            disabled={saving}
          >
            {saving ? "Enregistrement…" : "Enregistrer et quitter"}
          </button>
        </div>
      </div>
    </div>
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

function ConnectionsSection({
  user,
  watchActive,
  watchExpiryISO,
}: {
  user: Props["user"];
  watchActive: boolean;
  watchExpiryISO: string | null;
}) {
  const expiry = watchExpiryISO ? new Date(watchExpiryISO) : null;
  const daysLeft = expiry ? Math.ceil((expiry.getTime() - Date.now()) / 86400000) : null;
  const expiryLabel = expiry
    ? expiry.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })
    : null;

  return (
    <section>
      <h2 className="settings-h">Connexions</h2>
      <p className="settings-sub">L'état du lien entre tes deux outils. Si l'un tombe, la sync s'arrête.</p>

      <div className="connection-pair">
        <ConnectionCard
          icon={<Icon.google size={28} />}
          name="Google Calendar"
          email={user.email}
          ok={watchActive}
          metaPrimary={watchActive ? "Surveillance active" : "Surveillance inactive"}
          metaSecondary={
            watchActive && expiryLabel
              ? `Renouvellement auto · expire le ${expiryLabel} (dans ${daysLeft}j)`
              : "—"
          }
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
          metaSecondary="Booking via HTTP"
        />
      </div>

      <p className="toggle-row-desc" style={{ marginTop: 4, marginBottom: 16, lineHeight: 1.5 }}>
        Le watch Google expire au bout de 7 jours. Un cron interne le renouvelle automatiquement
        toutes les 24h pour ceux expirant dans moins de 48h. Si la sync casse pour une raison
        inattendue, on auto-réinitialise et on te prévient par SMS.
      </p>

      <div className="settings-row" style={{ flexWrap: "wrap" }}>
        {watchActive ? (
          <>
            <form action={activateWatchAction}>
              <button className="btn btn-primary" type="submit" title="Renouveler immédiatement">
                <Icon.refresh size={14} /> Renouveler maintenant
              </button>
            </form>
            <form action={deactivateWatchAction}>
              <button className="btn btn-danger" type="submit">
                <Icon.unlink size={14} /> Désactiver
              </button>
            </form>
          </>
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

function RulesSection({
  draftRules,
  setDraftRules,
  dirty,
  saving,
  onSave,
  onDiscard,
  priority,
  bufferMinutes,
}: {
  draftRules: BookingRules;
  setDraftRules: (next: BookingRules) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  priority: RoomName[];
  bufferMinutes: number;
}) {
  const [order, setOrder] = useState<RoomName[]>(priority);
  const [savedHint, setSavedHint] = useState(false);
  const [bufferOn, setBufferOn] = useState(bufferMinutes >= 15);
  const [bufferSavedHint, setBufferSavedHint] = useState(false);
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

  const handleBufferToggle = () => {
    const next = !bufferOn;
    setBufferOn(next);
    const fd = new FormData();
    if (next) fd.set("enabled", "on");
    startTransition(async () => {
      await saveBufferAction(fd);
      setBufferSavedHint(true);
      setTimeout(() => setBufferSavedHint(false), 1500);
    });
  };

  // ⌘+S / Ctrl+S submits the rules. Only listens while the Rules section is
  // mounted, so it doesn't fight other shortcuts on the rest of the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        if (!dirty || saving) return;
        e.preventDefault();
        onSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, saving, onSave]);

  // Convert raw text input ("foo, bar, baz") into the normalised array the
  // server expects. Same shape as the old parseListField helper.
  const parseList = (raw: string, lowercase: boolean): string[] =>
    raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => (lowercase ? s.toLowerCase() : s));

  const setRule = <K extends keyof BookingRules>(key: K, next: BookingRules[K]) => {
    setDraftRules({ ...draftRules, [key]: next });
  };

  return (
    <section>
      <h2 className="settings-h">Règles de réservation auto</h2>
      <p className="settings-sub">
        On te réserve une salle quand <strong>toutes</strong> les règles activées matchent ton meeting Google.
        Plus tu en actives, plus c'est restrictif (ex&nbsp;: invité externe <em>ET</em> mot-clé «&nbsp;demo&nbsp;» → seuls les demos avec un externe sont bookés).
      </p>

      <div className="rule-list" style={{ gap: 12 }}>
        <RuleCard
          title="Au moins un invité externe"
          help="Déclenche si un invité a un email hors @muchbetter.ai. Recommandé."
          enabled={draftRules.externalAttendee.enabled}
          onToggle={(on) => setRule("externalAttendee", { enabled: on })}
        />
        <RuleCard
          title="Mot-clé dans le titre"
          help="Le titre du meeting contient un de ces mots (insensible à la casse)."
          enabled={draftRules.titleKeywords.enabled}
          list={draftRules.titleKeywords.keywords}
          placeholder="demo, kickoff, 1:1…"
          onToggle={(on) =>
            setRule("titleKeywords", { enabled: on, keywords: draftRules.titleKeywords.keywords })
          }
          onListChange={(raw) =>
            setRule("titleKeywords", {
              enabled: draftRules.titleKeywords.enabled,
              keywords: parseList(raw, false),
            })
          }
        />
        <RuleCard
          title="Email invité spécifique"
          help="Un de ces emails est dans la liste des invités."
          enabled={draftRules.invitedEmails.enabled}
          list={draftRules.invitedEmails.emails}
          placeholder="prospect@bigco.com, alice@example.com"
          onToggle={(on) =>
            setRule("invitedEmails", { enabled: on, emails: draftRules.invitedEmails.emails })
          }
          onListChange={(raw) =>
            setRule("invitedEmails", {
              enabled: draftRules.invitedEmails.enabled,
              emails: parseList(raw, true),
            })
          }
        />
        <RuleCard
          title="Mot-clé dans la description"
          help="La description du meeting contient un de ces mots. Pratique pour forcer un booking."
          enabled={draftRules.descriptionKeywords.enabled}
          list={draftRules.descriptionKeywords.keywords}
          placeholder="ROOM_BOOK, room"
          onToggle={(on) =>
            setRule("descriptionKeywords", {
              enabled: on,
              keywords: draftRules.descriptionKeywords.keywords,
            })
          }
          onListChange={(raw) =>
            setRule("descriptionKeywords", {
              enabled: draftRules.descriptionKeywords.enabled,
              keywords: parseList(raw, false),
            })
          }
        />
      </div>

      {/* Sticky unsaved-changes bar (Vercel-style). Renders only when there
       *  are unsaved edits; primary action on the right, ghost cancel left. */}
      {dirty && (
        <div className="unsaved-bar" role="status" aria-live="polite">
          <span className="unsaved-bar-label">
            <Icon.alert size={12} /> Modifications non enregistrées
          </span>
          <span className="unsaved-bar-spacer" />
          <button
            className="btn btn-ghost"
            type="button"
            onClick={onDiscard}
            disabled={saving}
          >
            Annuler
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={onSave}
            disabled={saving}
            title="⌘+S"
          >
            <Icon.check size={14} /> {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      )}

      <div className="settings-divider" />

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <h3 className="settings-h-sub" style={{ margin: 0 }}>Marge de sécurité</h3>
        {bufferSavedHint && (
          <span style={{ fontSize: 12, color: "var(--success)" }}>
            <Icon.check size={11} /> enregistré
          </span>
        )}
      </div>

      <div
        className="rule-row"
        data-active={bufferOn}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "14px 16px",
        }}
      >
        <button
          className="rule-toggle"
          data-active={bufferOn}
          onClick={handleBufferToggle}
          aria-pressed={bufferOn}
          aria-label={bufferOn ? "Désactiver la marge de sécurité" : "Activer la marge de sécurité"}
          type="button"
        >
          <span className="rule-toggle-dot" />
        </button>
        <div style={{ flex: 1 }}>
          <div className="toggle-row-title">Bloquer 15 min avant et après chaque meeting</div>
          <div className="toggle-row-desc">
            Pratique pour préparer la démo, gérer un débord, ou rejoindre la salle suivante sans courir.
            Le meeting Google reste à l'heure exacte — seule la salle Skedda est réservée plus large.
          </div>
        </div>
      </div>

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
  title,
  help,
  enabled,
  list,
  placeholder,
  onToggle,
  onListChange,
}: {
  title: string;
  help: string;
  enabled: boolean;
  list?: string[];
  placeholder?: string;
  onToggle: (next: boolean) => void;
  onListChange?: (raw: string) => void;
}) {
  return (
    <div
      className="rule-row"
      data-active={enabled}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <button
          className="rule-toggle"
          data-active={enabled}
          onClick={() => onToggle(!enabled)}
          aria-pressed={enabled}
          aria-label={enabled ? "Désactiver" : "Activer"}
          type="button"
        >
          <span className="rule-toggle-dot" />
        </button>
        <div style={{ flex: 1 }}>
          <div className="toggle-row-title">{title}</div>
          <div className="toggle-row-desc">{help}</div>
        </div>
      </div>
      {list !== undefined && enabled && (
        <input
          className="input"
          value={list.join(", ")}
          onChange={(e) => onListChange?.(e.target.value)}
          placeholder={placeholder}
          style={{ marginLeft: 48, width: "calc(100% - 48px)" }}
        />
      )}
    </div>
  );
}

function NotifsSection({
  telephone,
  email,
  mode,
  skeddaTitleMode,
  notifPrefs,
  channelAvailability,
}: {
  telephone: string;
  email: string;
  mode: "location" | "description" | "none";
  skeddaTitleMode: "none" | "anonymized" | "full";
  notifPrefs: NotifPrefs;
  channelAvailability: ChannelAvailability;
}) {
  const [current, setCurrent] = useState<"location" | "description" | "none">(mode);
  const [titleMode, setTitleMode] = useState<"none" | "anonymized" | "full">(skeddaTitleMode);
  const [prefs, setPrefs] = useState<NotifPrefs>(notifPrefs);
  const [, startTransition] = useTransition();
  const [savedHint, setSavedHint] = useState(false);
  const [titleSavedHint, setTitleSavedHint] = useState(false);
  const [prefsSavedHint, setPrefsSavedHint] = useState(false);
  /** Per-channel test status: undefined = idle, "pending" = sending,
   *  "ok" = sent OK, string = error message. */
  const [testStatus, setTestStatus] = useState<
    Record<"sms" | "whatsapp" | "email", "pending" | "ok" | string | undefined>
  >({ sms: undefined, whatsapp: undefined, email: undefined });

  const runChannelTest = (channel: "sms" | "whatsapp" | "email") => {
    setTestStatus((s) => ({ ...s, [channel]: "pending" }));
    const fd = new FormData();
    fd.set("channel", channel);
    startTransition(async () => {
      const r = await testChannelAction(fd);
      setTestStatus((s) => ({ ...s, [channel]: r.ok ? "ok" : r.error || "send_failed" }));
      // Auto-clear after 4s so the row goes back to neutral
      setTimeout(() => {
        setTestStatus((s) => ({ ...s, [channel]: undefined }));
      }, 4000);
    });
  };

  const handleChange = (next: "location" | "description" | "none") => {
    setCurrent(next);
    const fd = new FormData();
    fd.set("mode", next);
    startTransition(async () => {
      await saveRoomLocationModeAction(fd);
      setSavedHint(true);
      setTimeout(() => setSavedHint(false), 1500);
    });
  };

  const handleTitleChange = (next: "none" | "anonymized" | "full") => {
    setTitleMode(next);
    const fd = new FormData();
    fd.set("mode", next);
    startTransition(async () => {
      await saveSkeddaTitleModeAction(fd);
      setTitleSavedHint(true);
      setTimeout(() => setTitleSavedHint(false), 1500);
    });
  };

  const updatePref = (
    type: keyof NotifPrefs,
    channel: "sms" | "email" | "whatsapp",
    value: boolean,
  ) => {
    const next: NotifPrefs = {
      ...prefs,
      [type]: { ...prefs[type], [channel]: value },
    };
    setPrefs(next);
    const fd = new FormData();
    (Object.keys(next) as Array<keyof NotifPrefs>).forEach((t) => {
      if (next[t].sms) fd.set(`${t}_sms`, "on");
      if (next[t].email) fd.set(`${t}_email`, "on");
      if (next[t].whatsapp) fd.set(`${t}_whatsapp`, "on");
    });
    startTransition(async () => {
      await saveNotifPrefsAction(fd);
      setPrefsSavedHint(true);
      setTimeout(() => setPrefsSavedHint(false), 1500);
    });
  };

  const failureBothOff =
    !prefs.booking_failure.sms &&
    !prefs.booking_failure.email &&
    !prefs.booking_failure.whatsapp;

  return (
    <section>
      <h2 className="settings-h">Notifications</h2>
      <p className="settings-sub">
        Pour chaque type d'événement, choisis sur quel canal tu veux être prévenu.
      </p>

      <div className="notif-recipients">
        <span><Icon.phone size={11} /> SMS · <strong>{telephone || "—"}</strong></span>
        <span><Icon.mail size={11} /> Email · <strong>{email}</strong></span>
        {prefsSavedHint && (
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--success)" }}>
            <Icon.check size={11} /> enregistré
          </span>
        )}
      </div>

      <div className="notif-test-row">
        <span className="notif-test-label">Tester un canal :</span>
        <ChannelTestButton
          label="SMS"
          status={testStatus.sms}
          paused={!channelAvailability.sms}
          disabled={!telephone}
          disabledHint="Ajoute un numéro d'abord"
          onClick={() => runChannelTest("sms")}
        />
        <ChannelTestButton
          label="WhatsApp"
          status={testStatus.whatsapp}
          paused={!channelAvailability.whatsapp}
          disabled={!telephone}
          disabledHint="Ajoute un numéro d'abord"
          onClick={() => runChannelTest("whatsapp")}
        />
        <ChannelTestButton
          label="Email"
          status={testStatus.email}
          paused={!channelAvailability.email}
          onClick={() => runChannelTest("email")}
        />
      </div>

      {(() => {
        const paused: string[] = [];
        if (!channelAvailability.sms) paused.push("SMS");
        if (!channelAvailability.whatsapp) paused.push("WhatsApp");
        if (!channelAvailability.email) paused.push("Email");
        if (paused.length === 0) return null;
        const list = paused.length === 1
          ? paused[0]
          : paused.slice(0, -1).join(", ") + " et " + paused[paused.length - 1];
        return (
          <div className="rule-paused-hint" role="status">
            <Icon.alert size={12} />
            <span>
              {list} en pause côté Roombooker — on remet ça dès que possible. Tes choix sont gardés.
            </span>
          </div>
        );
      })()}

      <div className="rule-list" style={{ gap: 12 }}>
        <NotifTypeCard
          title="Réservation confirmée"
          desc="Quand une salle est bookée pour toi."
          smsOn={prefs.booking_success.sms}
          emailOn={prefs.booking_success.email}
          whatsappOn={prefs.booking_success.whatsapp}
          onSms={(v) => updatePref("booking_success", "sms", v)}
          onEmail={(v) => updatePref("booking_success", "email", v)}
          onWhatsapp={(v) => updatePref("booking_success", "whatsapp", v)}
          hasPhone={!!telephone}
          availability={channelAvailability}
        />
        <NotifTypeCard
          title="Réservation programmée"
          desc="Quand un meeting est créé plus de 10 jours à l'avance — on attend que Skedda ouvre la fenêtre pour booker."
          smsOn={prefs.booking_deferred.sms}
          emailOn={prefs.booking_deferred.email}
          whatsappOn={prefs.booking_deferred.whatsapp}
          onSms={(v) => updatePref("booking_deferred", "sms", v)}
          onEmail={(v) => updatePref("booking_deferred", "email", v)}
          onWhatsapp={(v) => updatePref("booking_deferred", "whatsapp", v)}
          hasPhone={!!telephone}
          availability={channelAvailability}
        />
        <NotifTypeCard
          title="Réservation annulée"
          desc="Quand tu supprimes un meeting dans Calendar et qu'on libère la salle sur Skedda."
          smsOn={prefs.booking_cancelled.sms}
          emailOn={prefs.booking_cancelled.email}
          whatsappOn={prefs.booking_cancelled.whatsapp}
          onSms={(v) => updatePref("booking_cancelled", "sms", v)}
          onEmail={(v) => updatePref("booking_cancelled", "email", v)}
          onWhatsapp={(v) => updatePref("booking_cancelled", "whatsapp", v)}
          hasPhone={!!telephone}
          availability={channelAvailability}
        />
        <NotifTypeCard
          title="Conflit ou erreur"
          desc="Deux meetings sur la même salle, sync cassée, token expiré."
          smsOn={prefs.booking_failure.sms}
          emailOn={prefs.booking_failure.email}
          whatsappOn={prefs.booking_failure.whatsapp}
          onSms={(v) => updatePref("booking_failure", "sms", v)}
          onEmail={(v) => updatePref("booking_failure", "email", v)}
          onWhatsapp={(v) => updatePref("booking_failure", "whatsapp", v)}
          hasPhone={!!telephone}
          warning={failureBothOff ? "Tu ne seras pas prévenu si une réservation échoue. Pense à vérifier dans le dashboard." : undefined}
          availability={channelAvailability}
        />
        <NotifTypeCard
          title="Re-sync automatique"
          desc="Quand on remet ton calendrier d'aplomb tout seul."
          smsOn={prefs.watch_resync.sms}
          emailOn={prefs.watch_resync.email}
          whatsappOn={prefs.watch_resync.whatsapp}
          onSms={(v) => updatePref("watch_resync", "sms", v)}
          onEmail={(v) => updatePref("watch_resync", "email", v)}
          onWhatsapp={(v) => updatePref("watch_resync", "whatsapp", v)}
          hasPhone={!!telephone}
          availability={channelAvailability}
        />
      </div>

      <div className="settings-divider" />

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
        <h3 className="settings-h-sub" style={{ margin: 0 }}>
          Titre du meeting visible sur Skedda
        </h3>
        {titleSavedHint && (
          <span style={{ fontSize: 12, color: "var(--success)" }}>
            <Icon.check size={11} /> enregistré
          </span>
        )}
      </div>
      <p className="toggle-row-desc" style={{ marginBottom: 12 }}>
        Les autres membres d'Antler France voient tes réservations Skedda. À toi de choisir ce qu'ils lisent.
      </p>
      <RadioRow
        name="skedda-title-mode"
        value="none"
        checked={titleMode === "none"}
        onChange={() => handleTitleChange("none")}
        title="Non, garde-le privé"
        desc="Comportement par défaut. Seul ton nom apparaît sur la réservation."
      />
      <RadioRow
        name="skedda-title-mode"
        value="anonymized"
        checked={titleMode === "anonymized"}
        onChange={() => handleTitleChange("anonymized")}
        title="Une version anonymisée"
        desc="On retire les noms — par exemple « Demo client » au lieu de « Demo Mondial Relay »."
      />
      <RadioRow
        name="skedda-title-mode"
        value="full"
        checked={titleMode === "full"}
        onChange={() => handleTitleChange("full")}
        title="Oui, partage le titre complet"
        desc="Pratique si tu veux que tes collègues Antler sachent pourquoi la salle est prise."
      />

      <div className="settings-divider" />

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <h3 className="settings-h-sub" style={{ margin: 0 }}>
          Le nom de la salle physique (Venus, Mars…) dans ton Google Calendar ?
        </h3>
        {savedHint && (
          <span style={{ fontSize: 12, color: "var(--success)" }}>
            <Icon.check size={11} /> enregistré
          </span>
        )}
      </div>
      <RadioRow
        name="loc-mode"
        value="location"
        checked={current === "location"}
        onChange={() => handleChange("location")}
        title="Dans le champ « Lieu »"
        desc="Comportement par défaut. Le nom de la salle apparaît à côté de la date dans l'invitation."
      />
      <RadioRow
        name="loc-mode"
        value="description"
        checked={current === "description"}
        onChange={() => handleChange("description")}
        title="Dans la description"
        desc="On préfixe la description par « [Roombooker · Mars] » pour ne pas occuper le champ Lieu (utile si tu veux y mettre l'adresse réelle, le lien Meet, etc.)."
      />
      <RadioRow
        name="loc-mode"
        value="none"
        checked={current === "none"}
        onChange={() => handleChange("none")}
        title="Nulle part"
        desc="On ne touche pas du tout au meeting Google. La salle est réservée sur Skedda mais ne s'affiche que dans le dashboard Roombooker."
      />
    </section>
  );
}

function NotifTypeCard({
  title,
  desc,
  smsOn,
  emailOn,
  whatsappOn,
  onSms,
  onEmail,
  onWhatsapp,
  hasPhone,
  warning,
  availability,
}: {
  title: string;
  desc: string;
  smsOn: boolean;
  emailOn: boolean;
  whatsappOn: boolean;
  onSms: (v: boolean) => void;
  onEmail: (v: boolean) => void;
  onWhatsapp: (v: boolean) => void;
  hasPhone: boolean;
  warning?: string;
  availability: ChannelAvailability;
}) {
  return (
    <div
      className="rule-row"
      data-active={smsOn || emailOn || whatsappOn}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 12,
        padding: "14px 16px",
      }}
    >
      <div>
        <div className="toggle-row-title">{title}</div>
        <div className="toggle-row-desc">{desc}</div>
      </div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <ChannelToggle
          label="SMS"
          on={smsOn}
          onChange={onSms}
          disabled={!hasPhone}
          disabledHint="Ajoute un numéro dans Mon compte"
          paused={!availability.sms}
        />
        <ChannelToggle
          label="WhatsApp"
          on={whatsappOn}
          onChange={onWhatsapp}
          disabled={!hasPhone}
          disabledHint="Ajoute un numéro dans Mon compte"
          paused={!availability.whatsapp}
        />
        <ChannelToggle
          label="Email"
          on={emailOn}
          onChange={onEmail}
          paused={!availability.email}
        />
      </div>
      {warning && (
        <div className="notif-warning">
          <Icon.alert size={12} /> {warning}
        </div>
      )}
    </div>
  );
}

/**
 * Small button that sends a real test notification on the chosen channel.
 * Status comes from the parent (pending / ok / error string / undefined).
 * Auto-resets after 4s in the parent.
 */
function ChannelTestButton({
  label,
  status,
  paused,
  disabled,
  disabledHint,
  onClick,
}: {
  label: string;
  status: "pending" | "ok" | string | undefined;
  paused?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  onClick: () => void;
}) {
  const isPending = status === "pending";
  const isOk = status === "ok";
  const errorMsg = status && status !== "pending" && status !== "ok" ? status : undefined;
  const inactive = disabled || paused || isPending;
  const tooltip = paused
    ? `${label} en pause côté Roombooker`
    : disabled
      ? disabledHint
      : errorMsg
        ? `Erreur : ${errorMsg}`
        : undefined;
  return (
    <button
      type="button"
      className={`notif-test-btn${isOk ? " is-ok" : ""}${errorMsg ? " is-error" : ""}${
        paused ? " is-paused" : ""
      }`}
      onClick={() => !inactive && onClick()}
      disabled={inactive}
      title={tooltip}
      aria-label={`Tester ${label}`}
    >
      {isPending ? "…" : isOk ? <Icon.check size={11} /> : errorMsg ? <Icon.alert size={11} /> : null}
      <span>{label}</span>
    </button>
  );
}

function ChannelToggle({
  label,
  on,
  onChange,
  disabled,
  disabledHint,
  paused,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledHint?: string;
  /** Admin globally disabled this channel. Toggle stays in its saved position
   *  but is non-interactive + amber. Distinct from `disabled` (no phone). */
  paused?: boolean;
}) {
  const interactive = !disabled && !paused;
  const title = paused
    ? `${label} est en pause côté Roombooker — ton choix est gardé.`
    : disabled
      ? disabledHint
      : undefined;
  return (
    <label
      className={paused ? "channel-toggle-paused" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: interactive ? "pointer" : "not-allowed",
        opacity: disabled && !paused ? 0.5 : 1,
      }}
      title={title}
    >
      <button
        className="rule-toggle"
        data-active={on && interactive}
        data-paused={paused || undefined}
        onClick={() => interactive && onChange(!on)}
        aria-pressed={on}
        aria-label={`${label} ${on ? "activé" : "désactivé"}${paused ? " (en pause)" : ""}`}
        type="button"
        disabled={!interactive}
      >
        <span className="rule-toggle-dot" />
      </button>
      <span style={{ fontSize: 13, fontWeight: 500, color: paused ? "var(--ink-3)" : undefined }}>
        {label}
      </span>
    </label>
  );
}

function RadioRow({
  name,
  value,
  checked,
  onChange,
  title,
  desc,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  desc: string;
}) {
  return (
    <label
      className="toggle-row"
      style={{ cursor: "pointer", alignItems: "flex-start" }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        style={{ marginTop: 4 }}
      />
      <div style={{ flex: 1 }}>
        <div className="toggle-row-title">{title}</div>
        <div className="toggle-row-desc">{desc}</div>
      </div>
    </label>
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
