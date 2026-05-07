import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Roombooker",
  description: "How Roombooker collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  const lastUpdated = "7 mai 2026";
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 80px", fontFamily: "var(--font-inter), system-ui, sans-serif", lineHeight: 1.6, color: "var(--ink)" }}>
      <Link href="/" style={{ fontSize: 13, color: "var(--ink-3)", textDecoration: "none" }}>
        ← Retour à l'accueil
      </Link>

      <h1 style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", margin: "16px 0 4px" }}>Privacy Policy</h1>
      <p style={{ color: "var(--ink-3)", fontSize: 14, margin: "0 0 32px" }}>Dernière mise à jour : {lastUpdated}</p>

      <Section title="Qui nous sommes">
        <p>
          Roombooker est un outil interne pour les équipes de muchbetter.ai qui synchronise leur Google Calendar
          avec Skedda (système de réservation de salles de l'incubateur Antler France). L'app est hébergée sur{" "}
          <code>roombooker.nmt.ovh</code>. Contact : nicolas.monniot14@gmail.com.
        </p>
      </Section>

      <Section title="Données que nous collectons">
        <ul>
          <li>
            <strong>Identité Google</strong> (email, prénom, nom, photo de profil) — récupérés via OAuth lorsque vous
            cliquez "Continuer avec Google".
          </li>
          <li>
            <strong>Tokens OAuth Google</strong> (access_token + refresh_token) — chiffrés en AES-256-GCM avant stockage
            en base. Servent à appeler l'API Google Calendar en votre nom pour la durée de votre utilisation.
          </li>
          <li>
            <strong>Numéro de téléphone</strong> — saisi à l'onboarding, utilisé uniquement pour vous envoyer des SMS
            de confirmation de réservation ou d'erreur.
          </li>
          <li>
            <strong>Métadonnées de vos meetings Google Calendar</strong> (titre, date, invités, organisateur,
            description) — lues à la volée à chaque notification push de Google. Utilisées pour décider s'il faut
            réserver une salle et pour mettre à jour le champ <code>location</code> de l'event Google Calendar avec
            la salle réservée.
          </li>
          <li>
            <strong>Historique de réservations</strong> (titre du meeting, créneau, salle réservée, statut Skedda) —
            stocké dans notre base pour vous permettre de voir vos résa et les annuler.
          </li>
        </ul>
      </Section>

      <Section title="Données que nous ne collectons pas">
        <ul>
          <li>Le contenu des messages, pièces jointes, ou conversations Google.</li>
          <li>Vos contacts Google.</li>
          <li>Vos autres calendriers que le calendrier principal.</li>
          <li>Aucune donnée comportementale (analytics, fingerprinting, etc.).</li>
        </ul>
      </Section>

      <Section title="Comment nous utilisons les données">
        <p>
          Strictement pour faire fonctionner le service :
        </p>
        <ol>
          <li>Détecter qu'un meeting Google a besoin d'une salle (selon vos règles configurables).</li>
          <li>Réserver automatiquement la salle correspondante sur Skedda.</li>
          <li>Vous confirmer par SMS et/ou email avec un lien magique pour annuler en 1 clic.</li>
          <li>Mettre à jour le champ <code>location</code> de votre event Google Calendar avec le nom de la salle.</li>
        </ol>
        <p>
          Nous ne partageons aucune donnée avec des tiers, sauf : (a) Skedda lui-même pour créer les réservations,
          (b) EDJ Labs (envoi SMS) et Brevo (envoi email) en tant que sous-traitants techniques.
        </p>
      </Section>

      <Section title="Conservation et suppression">
        <p>
          Les données sont conservées tant que votre compte est actif. Vous pouvez à tout moment :
        </p>
        <ul>
          <li>
            Révoquer l'accès Google depuis{" "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)" }}>
              myaccount.google.com/permissions
            </a>{" "}
            — l'app cesse aussitôt d'avoir accès à votre Calendar.
          </li>
          <li>
            Demander la suppression complète de votre compte Roombooker en envoyant un email à{" "}
            nicolas.monniot14@gmail.com — toutes vos données seront effacées sous 30 jours.
          </li>
        </ul>
      </Section>

      <Section title="Sécurité">
        <ul>
          <li>Tokens OAuth chiffrés en AES-256-GCM en base, jamais journalisés en clair.</li>
          <li>Communications HTTPS uniquement (TLS via Let's Encrypt sur Traefik).</li>
          <li>Aucun mot de passe utilisateur stocké — l'authentification passe par OAuth Google.</li>
          <li>Sessions chiffrées via cookies signés (iron-session, HttpOnly, SameSite=Lax).</li>
        </ul>
      </Section>

      <Section title="Conformité Google API Services">
        <p>
          L'utilisation et le transfert d'informations reçues depuis les Google API par cette application respectent
          la{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)" }}>
            Google API Services User Data Policy
          </a>{" "}
          y compris les exigences Limited Use.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Pour toute question relative à cette politique de confidentialité, écrivez à nicolas.monniot14@gmail.com.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", margin: "0 0 8px" }}>{title}</h2>
      <div style={{ fontSize: 15, color: "var(--ink-2)" }}>{children}</div>
    </section>
  );
}
