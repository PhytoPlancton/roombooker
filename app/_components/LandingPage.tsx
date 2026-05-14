"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const HeroScene = dynamic(() => import("./HeroScene").then((m) => m.HeroScene), {
  ssr: false,
  loading: () => null,
});

export function LandingPage({ flashError }: { flashError: string | null }) {
  const [scrolled, setScrolled] = useState(false);
  const [errorVisible, setErrorVisible] = useState(!!flashError);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!errorVisible) return;
    const id = setTimeout(() => setErrorVisible(false), 6000);
    return () => clearTimeout(id);
  }, [errorVisible]);

  // Reveal-on-scroll observer
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".reveal");
    if (els.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="landing">
      {errorVisible && flashError && (
        <div className="landing-error" role="alert">
          {decodeURIComponent(flashError)}
          <button
            className="landing-error-close"
            onClick={() => setErrorVisible(false)}
            aria-label="Fermer"
            type="button"
          >
            ×
          </button>
        </div>
      )}

      <nav className={`landing-nav${scrolled ? " scrolled" : ""}`} id="landing-nav">
        <Link href="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="brand-dot">R</div>
          <span className="brand-name">roombooker</span>
        </Link>
        <div className="landing-nav-spacer" />
        <div className="landing-nav-links">
          <a className="landing-nav-link" href="#problem">Pourquoi</a>
          <a className="landing-nav-link" href="#how">Comment</a>
        </div>
        <Link className="btn btn-primary" href="/api/auth/google/start">
          Commencer
        </Link>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div>
            <span className="landing-hero-badge">
              <span className="landing-hero-badge-dot">✓</span>
              Sync auto · Google Calendar → Skedda
            </span>
            <h1 className="landing-hero-h">
              Tu réserves <em>une fois</em>.
              <br />
              La salle <em>suit</em>.
            </h1>
            <p className="landing-hero-p">
              Tu poses ta démo dans Google Calendar. Roombooker bloque la salle physique
              sur Skedda automatiquement. Plus de double saisie. Plus de salle prise pour rien.
            </p>
            <div className="landing-hero-ctas">
              <Link className="btn btn-primary btn-big btn-arrow" href="/api/auth/google/start">
                Connecter mon Google Calendar
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <a className="btn btn-big" href="#how">
                Comment ça marche
              </a>
            </div>
            <div className="landing-hero-trust">
              <span className="landing-hero-trust-item">
                <span className="landing-hero-trust-check">✓</span>Setup en 2 min
              </span>
              <span className="landing-hero-trust-item">
                <span className="landing-hero-trust-check">✓</span>OAuth chiffré
              </span>
              <span className="landing-hero-trust-item">
                <span className="landing-hero-trust-check">✓</span>Lecture seule
              </span>
            </div>
          </div>
          <HeroScene />
        </div>
      </section>

      <section className="landing-section landing-section-soft" id="problem">
        <div className="landing-container">
          <div className="reveal">
            <span className="landing-eyebrow">Le problème</span>
            <h2 className="landing-h">
              Deux outils. <em>Deux fois</em> la même tâche.
            </h2>
            <p className="landing-p">
              Les Sales bookent leur démo sur Google Calendar pour leur prospect.
              Puis ils doivent re-bloquer la salle physique sur Skedda. Le temps qu'ils y pensent,
              une personne de chez Antler a pris la salle. Résultat : démo dans le couloir.
              Et quand tu poses une démo trois semaines à l'avance, Skedda refuse même la réservation.
            </p>
          </div>

          <div className="landing-problem-grid reveal">
            <div className="landing-problem-card before">
              <span className="landing-problem-card-tag">Avant</span>
              <h3 className="landing-problem-card-h">
                Tu fais la même réservation deux fois.
              </h3>
              <p className="landing-problem-card-p">
                Calendar pour les invités. Skedda pour la salle. Un oubli sur deux finit
                en démo dans le couloir parce que la salle a sauté.
              </p>
            </div>
            <div className="landing-problem-card after">
              <span className="landing-problem-card-tag">Avec Roombooker — démos dans les 10 jours</span>
              <h3 className="landing-problem-card-h">
                Dès que le meeting est créé, la salle est à toi.
              </h3>
              <p className="landing-problem-card-p">
                Roombooker écoute ton Calendar et pose la salle sur Skedda en
                moins de 5 secondes. Plus rapide que quelqu'un de chez Antler : tu
                maximises tes chances d'avoir la bonne salle.
              </p>
            </div>
            <div className="landing-problem-card after">
              <span className="landing-problem-card-tag">Avec Roombooker — démos planifiées 3 semaines à l'avance</span>
              <h3 className="landing-problem-card-h">
                Skedda dit non ? On attend pour toi.
              </h3>
              <p className="landing-problem-card-p">
                Skedda ne laisse réserver qu'à 10 jours. Pour une démo posée trois
                semaines plus tard, tu notes mentalement de revenir le moment venu —
                et tu oublies. Roombooker garde la réservation en attente et la
                déclenche à la seconde où Skedda ouvre la fenêtre. Tu poses le
                meeting une fois, la salle arrive toute seule, même un mois plus tard.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section" id="how">
        <div className="landing-container">
          <div className="reveal">
            <span className="landing-eyebrow">Comment ça marche</span>
            <h2 className="landing-h">
              Trois minutes. <em>Une fois</em>.
            </h2>
            <p className="landing-p">Connecte tes deux outils, et c'est plié.</p>
          </div>

          <div className="landing-steps-list reveal">
            <div className="landing-step">
              <div className="landing-step-num">1</div>
              <div className="landing-step-h">Connecte Google.</div>
              <p className="landing-step-p">
                OAuth en lecture seule. Roombooker voit tes meetings, ne touche à rien d'autre.
              </p>
            </div>
            <div className="landing-step">
              <div className="landing-step-num">2</div>
              <div className="landing-step-h">Skedda déjà connecté.</div>
              <p className="landing-step-p">J'ai déjà connecté Skedda à roombooker pour toi.</p>
            </div>
            <div className="landing-step">
              <div className="landing-step-num">3</div>
              <div className="landing-step-h">Tu oublies.</div>
              <p className="landing-step-p">
                Chaque meeting Google se pose sur la bonne salle Skedda. SMS si quelque chose cloche.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-soft">
        <div className="landing-container">
          <p className="landing-quote-text reveal">
            « Avant Roombooker, on bookait deux fois : sur Google, puis sur Skedda.
            Maintenant, on book une fois et on oublie. »
          </p>
          <p className="landing-quote-author reveal">
            — Tom Marchand, Sales · 5 démos par jour
          </p>
        </div>
      </section>

      <footer className="landing-footer">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="brand-dot" style={{ width: 22, height: 22, fontSize: 11 }}>
            R
          </div>
          <span className="brand-name">roombooker</span>
        </div>
        <div>
          <Link href="/privacy" style={{ color: "var(--ink-3)" }}>
            Privacy
          </Link>
          {" · "}
          <Link href="/terms" style={{ color: "var(--ink-3)" }}>
            Terms
          </Link>
          {" · © 2026 · Pour les Sales qui jonglent avec 5 salles"}
        </div>
      </footer>
    </div>
  );
}
