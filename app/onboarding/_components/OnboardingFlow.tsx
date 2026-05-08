"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { saveOnboardingRules, saveTelephone } from "../actions";
import { DEFAULT_BOOKING_RULES, type BookingRules } from "@/lib/users";

type LocMode = "location" | "description" | "none";

interface Props {
  userEmail: string;
  firstName: string;
  lastName: string;
  flashError: string | null;
  initialPhone?: string | null;
  initialRules?: BookingRules | null;
  initialRoomLocationMode?: LocMode | null;
  demoMode?: boolean;
}

const LOC_HELPERS: Record<LocMode, string> = {
  location: "Le nom de la salle apparaît à côté de la date dans l'invitation.",
  description:
    "On préfixe la description par « [Roombooker · Mars] ». Ton champ Lieu reste libre.",
  none:
    "On ne touche pas à l'event. La salle reste visible dans ton dashboard Roombooker.",
};

const ONBOARDING_DEFAULT_RULES: BookingRules = {
  externalAttendee: { enabled: true },
  titleKeywords: { enabled: true, keywords: ["demo"] },
  invitedEmails: { enabled: false, emails: [] },
  descriptionKeywords: { enabled: false, keywords: [] },
};

export function OnboardingFlow({
  userEmail,
  firstName,
  lastName,
  flashError,
  initialPhone,
  initialRules,
  initialRoomLocationMode,
  demoMode = false,
}: Props) {
  // In demo mode: start at step 2 even if phone exists, so admin walks the whole flow.
  const [step, setStep] = useState<2 | 3 | 4>(2);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [phoneCountry, setPhoneCountry] = useState("FR +33");
  const [rules, setRules] = useState<BookingRules>(
    initialRules ?? ONBOARDING_DEFAULT_RULES,
  );
  const [locMode, setLocMode] = useState<LocMode>(
    initialRoomLocationMode ?? "location",
  );
  const [error, setError] = useState<string | null>(flashError);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const totalSteps = 4;

  const submitPhone = () => {
    if (phone.replace(/\D/g, "").length < 9) {
      setError("Numéro trop court");
      return;
    }
    setError(null);
    if (demoMode) {
      setStep(3);
      return;
    }
    const fd = new FormData();
    fd.set("telephone", phone);
    startTransition(async () => {
      const result = await saveTelephone(fd);
      if (result.ok) setStep(3);
      else setError(result.error);
    });
  };

  const submitRules = () => {
    if (demoMode) {
      setStep(4);
      return;
    }
    startTransition(async () => {
      await saveOnboardingRules({ rules, roomLocationMode: locMode });
      setStep(4);
    });
  };

  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return (
    <>
      {demoMode && (
        <div className="onboard-demo-banner" role="status">
          <Icon.sparkle size={12} /> Mode démo — aucune donnée enregistrée.{" "}
          <button
            className="onboard-demo-exit"
            onClick={() => router.push("/dashboard/admin")}
            type="button"
          >
            Quitter la démo
          </button>
        </div>
      )}
      <div className="onboard" data-demo={demoMode || undefined}>
      <div className="onboard-form">
        <div className="onboard-brand">
          <div className="brand-dot">R</div>
          <span className="brand-name">roombooker</span>
        </div>

        <div className="onboard-content">
          <div className="steps">
            <div className="step-bar"><div className="step-bar-fill" style={{ width: "100%" }} /></div>
            <div className="step-bar"><div className="step-bar-fill" style={{ width: step >= 2 ? "100%" : "0%" }} /></div>
            <div className="step-bar"><div className="step-bar-fill" style={{ width: step >= 3 ? "100%" : "0%" }} /></div>
            <div className="step-bar"><div className="step-bar-fill" style={{ width: step >= 4 ? "100%" : "0%" }} /></div>
          </div>

          <span className="step-pill">
            <span className="step-pill-num">{step}</span>
            <span>Étape {step} sur {totalSteps}</span>
          </span>

          {step === 2 && (
            <>
              <h1 className="onboard-h">
                Ton <em>numéro</em>, pour les alertes.
              </h1>
              <p className="onboard-p">
                Si une synchro échoue ou qu'un conflit apparaît sur tes salles, on te
                prévient en SMS — pas d'email perdu dans les notifs.
              </p>

              {error && (
                <div style={{ padding: "0.75rem 1rem", background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
                  {error}
                </div>
              )}

              <div className="field">
                <label className="field-label">Numéro de mobile</label>
                <div className="input-group">
                  <select className="select" value={phoneCountry} onChange={(e) => setPhoneCountry(e.target.value)}>
                    <option>FR +33</option>
                    <option>BE +32</option>
                    <option>CH +41</option>
                    <option>UK +44</option>
                    <option>US +1</option>
                  </select>
                  <input
                    className="input"
                    type="tel"
                    placeholder="6 12 34 56 78"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <button
                className="btn btn-primary btn-big"
                disabled={isPending || phone.replace(/\D/g, "").length < 9}
                style={{ opacity: phone.replace(/\D/g, "").length < 9 ? 0.5 : 1 }}
                onClick={submitPhone}
                type="button"
              >
                {isPending ? "Enregistrement…" : "Continuer"} <Icon.arrow size={16} />
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="onboard-h">
                Choisis quand on doit <em>travailler</em> pour toi.
              </h1>
              <p className="onboard-p">
                Active une règle, on s'occupe du reste. Tu peux tout changer plus tard.
              </p>

              <div className="onboard-rules">
                <OnboardRuleCard
                  title="Au moins un invité externe"
                  help="Déclenche si un invité a un email hors @muchbetter.ai. Recommandé."
                  enabled={rules.externalAttendee.enabled}
                  onToggle={(v) =>
                    setRules({ ...rules, externalAttendee: { enabled: v } })
                  }
                />
                <OnboardRuleCard
                  title="Mot-clé dans le titre"
                  help="Le titre du meeting contient un de ces mots (insensible à la casse)."
                  enabled={rules.titleKeywords.enabled}
                  onToggle={(v) =>
                    setRules({
                      ...rules,
                      titleKeywords: { ...rules.titleKeywords, enabled: v },
                    })
                  }
                  list={rules.titleKeywords.keywords}
                  onListChange={(v) =>
                    setRules({
                      ...rules,
                      titleKeywords: {
                        ...rules.titleKeywords,
                        keywords: parseList(v),
                      },
                    })
                  }
                  placeholder="demo, kickoff, 1:1…"
                />
                <OnboardRuleCard
                  title="Email invité spécifique"
                  help="Un de ces emails est dans la liste des invités."
                  enabled={rules.invitedEmails.enabled}
                  onToggle={(v) =>
                    setRules({
                      ...rules,
                      invitedEmails: { ...rules.invitedEmails, enabled: v },
                    })
                  }
                  list={rules.invitedEmails.emails}
                  onListChange={(v) =>
                    setRules({
                      ...rules,
                      invitedEmails: {
                        ...rules.invitedEmails,
                        emails: parseList(v, true),
                      },
                    })
                  }
                  placeholder="prospect@bigco.com, alice@example.com"
                />
                <OnboardRuleCard
                  title="Mot-clé dans la description"
                  help="La description contient un de ces mots. Pratique pour forcer un booking."
                  enabled={rules.descriptionKeywords.enabled}
                  onToggle={(v) =>
                    setRules({
                      ...rules,
                      descriptionKeywords: {
                        ...rules.descriptionKeywords,
                        enabled: v,
                      },
                    })
                  }
                  list={rules.descriptionKeywords.keywords}
                  onListChange={(v) =>
                    setRules({
                      ...rules,
                      descriptionKeywords: {
                        ...rules.descriptionKeywords,
                        keywords: parseList(v),
                      },
                    })
                  }
                  placeholder="ROOM_BOOK, room"
                />
              </div>

              <div className="onboard-secondary">
                <h3 className="onboard-secondary-h">
                  Et le nom de la salle dans Google Calendar ?
                </h3>
                <div className="scope-toggle" role="radiogroup" aria-label="Affichage de la salle">
                  {(["location", "description", "none"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={locMode === m}
                      data-active={locMode === m}
                      className="scope-btn"
                      onClick={() => setLocMode(m)}
                    >
                      {m === "location" ? "Lieu" : m === "description" ? "Description" : "Nulle part"}
                    </button>
                  ))}
                </div>
                <p className="onboard-secondary-help">{LOC_HELPERS[locMode]}</p>
              </div>

              <button
                className="btn btn-primary btn-big"
                disabled={isPending}
                onClick={submitRules}
                type="button"
              >
                {isPending ? "Enregistrement…" : "C'est parti"} <Icon.arrow size={16} />
              </button>
            </>
          )}

          {step === 4 && (
            <>
              <h1 className="onboard-h">
                Tout est <em>prêt</em>.
              </h1>
              <p className="onboard-p">
                Bienvenue {firstName ? <strong>{firstName}</strong> : "à toi"}. Roombooker écoute déjà
                ton agenda. Crée un meeting Google qui matche tes règles — on s'occupe de
                réserver la salle physique sur Skedda automatiquement.
              </p>

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  padding: "16px 18px",
                  background: "var(--success-soft)",
                  border: "1px solid var(--success)",
                  borderRadius: "var(--radius-lg)",
                  margin: "8px 0 24px",
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    background: "var(--success)",
                    color: "white",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Icon.check size={16} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Synchro activée</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {fullName} · {userEmail}
                  </div>
                </div>
              </div>

              <button
                className="btn btn-primary btn-big"
                onClick={() => router.push(demoMode ? "/dashboard/admin" : "/dashboard")}
                type="button"
              >
                {demoMode ? "Retour au pilotage" : "Aller au dashboard"} <Icon.arrow size={16} />
              </button>
            </>
          )}
        </div>

        <div className="onboard-foot">
          <span>roombooker · sync Google Cal ↔ Skedda</span>
          <span>
            <a href="/privacy" style={{ color: "var(--ink-3)", textDecoration: "none" }}>
              Privacy
            </a>
            {" · "}
            Contact : nicolas.monniot14@gmail.com
          </span>
        </div>
      </div>

      <div className="onboard-aside">
        <div className="aside-content">
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <span className="step-pill" style={{ background: "rgba(255,255,255,0.12)", color: "currentColor", border: "1px solid rgba(255,255,255,0.18)" }}>
              <Icon.sparkle size={12} />
              <span>Sales · 5 salles · 1 sync</span>
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="aside-quote">
              {step === 3 ? (
                <>
                  « J'ai mis 30 secondes à activer les bonnes règles. Depuis, je n'y pense
                  plus — Roombooker sait quand intervenir. »
                  <div className="aside-quote-attr">— Léa, AE @ Pennylane</div>
                </>
              ) : (
                <>
                  « Avant Roombooker, on bookait deux fois — sur Google, puis sur Skedda. Maintenant,
                  on book une fois et on oublie. »
                  <div className="aside-quote-attr">— Tom, Sales @ Northwind</div>
                </>
              )}
            </div>
          </div>

          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {step === 3
              ? "Tu peux modifier tes règles à tout moment depuis Réglages."
              : "Aucune double-saisie · OAuth chiffré · Lecture seule"}
          </div>
        </div>
      </div>
      </div>
    </>
  );
}

function parseList(raw: string, lowercase = false): string[] {
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (lowercase ? s.toLowerCase() : s));
}

function OnboardRuleCard({
  title,
  help,
  enabled,
  onToggle,
  list,
  onListChange,
  placeholder,
}: {
  title: string;
  help: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  list?: string[];
  onListChange?: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div
      className="rule-row onboard-rule"
      data-active={enabled}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 10,
        padding: "12px 14px",
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
          <div className="toggle-row-title" style={{ fontSize: 14 }}>{title}</div>
          <div className="toggle-row-desc" style={{ fontSize: 12 }}>{help}</div>
        </div>
      </div>
      {list !== undefined && onListChange && enabled && (
        <input
          className="input"
          defaultValue={list.join(", ")}
          placeholder={placeholder}
          onChange={(e) => onListChange(e.target.value)}
          style={{ marginLeft: 40, width: "calc(100% - 40px)" }}
        />
      )}
    </div>
  );
}
