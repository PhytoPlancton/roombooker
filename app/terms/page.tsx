import Link from "next/link";

export const metadata = {
  title: "Conditions d'utilisation — Roombooker",
  description: "Les règles d'utilisation de Roombooker.",
};

export default function TermsPage() {
  const lastUpdated = "11 mai 2026";
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "48px 24px 80px",
        fontFamily: "var(--font-inter), system-ui, sans-serif",
        lineHeight: 1.6,
        color: "var(--ink)",
      }}
    >
      <Link href="/" style={{ fontSize: 13, color: "var(--ink-3)", textDecoration: "none" }}>
        ← Retour à l'accueil
      </Link>

      <h1 style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", margin: "16px 0 4px" }}>
        Conditions d'utilisation
      </h1>
      <p style={{ color: "var(--ink-3)", fontSize: 14, margin: "0 0 32px" }}>
        Dernière mise à jour : {lastUpdated}
      </p>

      <Section title="1. Présentation du service">
        <p>
          Roombooker est un outil interne destiné aux équipes de muchbetter.ai. Il synchronise les
          meetings Google Calendar de l'utilisateur avec Skedda, le système de réservation de salles
          physiques de l'incubateur Antler France, pour automatiser le booking des salles. L'app est
          hébergée sur <code>roombooker.nmt.ovh</code> et opérée par Nicolas Monniot
          (nicolas.monniot14@gmail.com).
        </p>
      </Section>

      <Section title="2. Accès au service">
        <p>
          L'accès est réservé aux personnes disposant d'une adresse email <code>@muchbetter.ai</code>
          {" "}ou explicitement autorisées par l'opérateur. La connexion se fait via OAuth Google ;
          aucun mot de passe n'est créé sur Roombooker.
        </p>
        <p>
          L'opérateur peut suspendre ou révoquer l'accès à tout moment, sans préavis, en cas
          d'usage non conforme aux présentes conditions ou pour des raisons techniques.
        </p>
      </Section>

      <Section title="3. Responsabilités de l'utilisateur">
        <ul>
          <li>
            Configurer ses règles de réservation auto (mots-clés, invités externes, etc.) en
            cohérence avec les usages réels de son équipe.
          </li>
          <li>
            Vérifier régulièrement le dashboard pour s'assurer que les réservations attendues
            ont bien été créées sur Skedda.
          </li>
          <li>
            Ne pas tenter de contourner les limites du service (par ex. forcer des réservations
            hors de la fenêtre Skedda de 10 jours, ou flood le moteur de booking).
          </li>
          <li>
            Garder son numéro de téléphone et son email à jour pour recevoir les notifications.
          </li>
        </ul>
      </Section>

      <Section title="4. Disponibilité du service">
        <p>
          Roombooker est fourni en mode "best effort". Aucun engagement de niveau de service
          (SLA) n'est garanti. Le service peut être interrompu pour maintenance, mise à jour, ou
          en cas de panne d'un service tiers (Google Calendar API, Skedda, EDJ Labs SMS, Brevo
          email, MongoDB Atlas).
        </p>
        <p>
          En cas de panne, l'utilisateur reste responsable de réserver manuellement ses salles
          sur Skedda.
        </p>
      </Section>

      <Section title="5. Propriété intellectuelle">
        <p>
          Le code source, le design et la marque "Roombooker" sont la propriété de Nicolas
          Monniot. Les données utilisateurs (events Calendar, réservations, préférences) restent
          la propriété de l'utilisateur et de Google / Skedda pour ce qui relève d'eux. Roombooker
          n'en revendique aucun droit au-delà de l'usage technique nécessaire pour faire fonctionner
          le service.
        </p>
      </Section>

      <Section title="6. Limitation de responsabilité">
        <p>
          Roombooker ne peut être tenu responsable :
        </p>
        <ul>
          <li>
            D'une salle non réservée à cause d'une panne Skedda, d'un quota Google dépassé, ou
            d'une règle mal configurée par l'utilisateur.
          </li>
          <li>D'une notification SMS / email non délivrée par le fournisseur tiers.</li>
          <li>
            D'une réservation faite par un collègue plus rapide que le moteur de booking
            automatique (l'objectif est de maximiser les chances, pas de garantir la salle).
          </li>
          <li>
            De tout préjudice indirect lié à l'utilisation ou à l'interruption du service.
          </li>
        </ul>
      </Section>

      <Section title="7. Données personnelles">
        <p>
          Le traitement des données personnelles est décrit dans la{" "}
          <Link href="/privacy" style={{ color: "var(--brand)" }}>
            politique de confidentialité
          </Link>
          . En utilisant Roombooker, l'utilisateur accepte ces conditions de traitement.
        </p>
      </Section>

      <Section title="8. Résiliation">
        <p>
          L'utilisateur peut à tout moment :
        </p>
        <ul>
          <li>
            Révoquer l'accès Google depuis{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--brand)" }}
            >
              myaccount.google.com/permissions
            </a>
            {" "}— l'app cesse aussitôt d'avoir accès au Calendar.
          </li>
          <li>
            Demander la suppression complète de son compte Roombooker par email à
            nicolas.monniot14@gmail.com — effacement complet sous 30 jours.
          </li>
        </ul>
      </Section>

      <Section title="9. Modifications des conditions">
        <p>
          Ces conditions peuvent évoluer. La date "Dernière mise à jour" en haut de page est
          la version en vigueur. En cas de changement significatif, l'utilisateur sera prévenu
          par email.
        </p>
      </Section>

      <Section title="10. Droit applicable">
        <p>
          Les présentes conditions sont régies par le droit français. Tout litige sera porté
          devant les tribunaux compétents de Paris.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Pour toute question relative à ces conditions, écrivez à nicolas.monniot14@gmail.com.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", margin: "0 0 8px" }}>
        {title}
      </h2>
      <div style={{ fontSize: 15, color: "var(--ink-2)" }}>{children}</div>
    </section>
  );
}
