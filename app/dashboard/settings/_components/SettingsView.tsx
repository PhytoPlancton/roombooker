"use client";

import { useState, useEffect, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { initials } from "@/lib/ui/format";
import type { BookingRules, NotifPrefs } from "@/lib/users";
import type { ChannelAvailability } from "@/lib/service-state";
import type { RoomName } from "@/lib/bookings";
import { activateWatchAction, deactivateWatchAction, saveNotifPrefsAction, saveRoomLocationModeAction, saveRulesAction, saveRoomPriorityAction, saveSkeddaTitleModeAction } from "../../actions";
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

export function SettingsView({ user, rules, priority, roomLocationMode, skeddaTitleMode, notifPrefs, channelAvailability, watchActive, watchExpiryISO, initialSection, flashSuccess, flashError }: Props) {
  const [active, setActive] = useState(initialSection);
  const [toast, setToast] = useState<string | null>(flashSuccess || flashError || null);
  const searchParams = useSearchParams();
  const sectionFromUrl = searchParams.get("section");

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
          {active === "connections" && <ConnectionsSection user={user} watchActive={watchActive} watchExpiryISO={watchExpiryISO} />}
          {active === "rules" && <RulesSection rules={rules} priority={priority} />}
          {active === "notifs" && <NotifsSection telephone={user.telephone} email={user.email} mode={roomLocationMode} skeddaTitleMode={skeddaTitleMode} notifPrefs={notifPrefs} channelAvailability={channelAvailability} />}
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
