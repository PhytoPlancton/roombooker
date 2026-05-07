import { redirect } from "next/navigation";
import Link from "next/link";
import { ObjectId } from "mongodb";
import { Icon } from "@/components/ui/Icon";
import { getSession } from "@/lib/session";
import { findUserById } from "@/lib/users";

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function Home({ searchParams }: PageProps) {
  const { error } = await searchParams;
  const session = await getSession();

  if (session.userId) {
    const user = await findUserById(new ObjectId(session.userId));
    if (user) redirect(user.telephone ? "/dashboard" : "/onboarding");
  }

  return (
    <div className="onboard">
      <div className="onboard-form">
        <div className="onboard-brand">
          <div className="brand-dot">R</div>
          <span className="brand-name">roombooker</span>
        </div>

        <div className="onboard-content">
          <div className="steps">
            <div className="step-bar"><div className="step-bar-fill" style={{ width: 0 }} /></div>
            <div className="step-bar"><div className="step-bar-fill" style={{ width: 0 }} /></div>
            <div className="step-bar"><div className="step-bar-fill" style={{ width: 0 }} /></div>
          </div>

          <span className="step-pill">
            <span className="step-pill-num">1</span>
            <span>Étape 1 sur 3</span>
          </span>

          <h1 className="onboard-h">
            Connecte ton <em>agenda</em>.
          </h1>
          <p className="onboard-p">
            Roombooker lit les meetings que tu crées dans Google Calendar et les pose
            automatiquement sur Skedda. Aucune double saisie. Aucun conflit oublié.
          </p>

          {error && (
            <div style={{ padding: "0.75rem 1rem", background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
              {decodeURIComponent(error)}
            </div>
          )}

          <Link href="/api/auth/google/start" className="btn-google">
            <Icon.google size={20} />
            Continuer avec Google
          </Link>

          <p className="onboard-p" style={{ fontSize: 12, marginTop: 14, color: "var(--ink-3)" }}>
            On accède en lecture seule à tes événements. Tu peux révoquer
            l'accès à tout moment depuis ton compte Google.
          </p>
        </div>

        <div className="onboard-foot">
          <span>roombooker · sync Google Cal ↔ Skedda</span>
          <span>
            <Link href="/privacy" style={{ color: "var(--ink-3)", textDecoration: "none" }}>
              Privacy
            </Link>
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

            <div style={{ marginTop: 24 }}>
              <MockCard />
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

function MockCard() {
  return (
    <div className="mock-card">
      <div className="mock-card-row">
        <Icon.google size={16} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Demo · Lumen Bank</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>16:30 – 17:30 · Earth</div>
        </div>
        <span className="sync-badge">
          <span className="dot" />
          Google
        </span>
      </div>
      <div className="mock-card-row" style={{ justifyContent: "center", padding: "4px 0", border: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-3)" }}>
          <span style={{ width: 24, height: 1, background: "var(--line)" }} />
          <Icon.arrow size={12} />
          <span style={{ fontWeight: 500 }}>auto-sync</span>
          <Icon.arrow size={12} />
          <span style={{ width: 24, height: 1, background: "var(--line)" }} />
        </div>
      </div>
      <div className="mock-card-row" style={{ borderTop: "none", paddingTop: 4 }}>
        <Icon.skedda size={16} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Earth · 5 places</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Réservé · roombooker.bot</div>
        </div>
        <span className="sync-badge">
          <Icon.check size={10} />
          Skedda
        </span>
      </div>
    </div>
  );
}
