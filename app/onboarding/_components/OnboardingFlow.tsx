"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { saveTelephone } from "../actions";

interface Props {
  userEmail: string;
  firstName: string;
  lastName: string;
  flashError: string | null;
}

export function OnboardingFlow({ userEmail, firstName, lastName, flashError }: Props) {
  const [step, setStep] = useState<2 | 3>(2);
  const [phone, setPhone] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("FR +33");
  const [error, setError] = useState<string | null>(flashError);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const totalSteps = 3;

  const submitPhone = () => {
    if (phone.replace(/\D/g, "").length < 9) {
      setError("Numéro trop court");
      return;
    }
    const fd = new FormData();
    fd.set("telephone", phone);
    setError(null);
    startTransition(async () => {
      const result = await saveTelephone(fd);
      if (result.ok) {
        setStep(3);
      } else {
        setError(result.error);
      }
    });
  };

  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return (
    <div className="onboard">
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
                Tout est <em>prêt</em>.
              </h1>
              <p className="onboard-p">
                Bienvenue {firstName ? <strong>{firstName}</strong> : "à toi"}. Roombooker écoute déjà
                ton agenda. Crée un meeting Google avec un invité externe — on s'occupe de
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

              <button className="btn btn-primary btn-big" onClick={() => router.push("/dashboard")} type="button">
                Aller au dashboard <Icon.arrow size={16} />
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
              « Avant Roombooker, on bookait deux fois — sur Google, puis sur Skedda. Maintenant,
              on book une fois et on oublie. »
              <div className="aside-quote-attr">— Tom, Sales @ Northwind</div>
            </div>
          </div>

          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Aucune double-saisie · OAuth chiffré · Lecture seule
          </div>
        </div>
      </div>
    </div>
  );
}
