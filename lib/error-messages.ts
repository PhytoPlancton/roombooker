/**
 * Map URL ?error=code values (from OAuth callbacks and server actions) to
 * human French messages. Anything we don't recognise is passed through
 * verbatim — the caller likely already formatted a sentence.
 *
 * Used by both the landing page (post-OAuth failure) and the dashboard
 * (post-action failure) so that "missing_calendar_scope" doesn't leak to
 * end users.
 */
export function humanizeError(code: string): string {
  switch (code) {
    case "missing_calendar_scope":
      return (
        "Permission Google Calendar manquante. Sans elle, Roombooker ne peut " +
        "pas lire ton agenda ni bloquer les salles. Déconnecte-toi, reconnecte-toi " +
        "et coche bien la case « Voir et modifier les événements » sur l'écran Google."
      );
    case "missing_params":
      return "Connexion Google interrompue. Réessaie.";
    case "invalid_state":
      return "Session expirée pendant la connexion Google. Réessaie.";
    case "access_denied":
      return "Tu as refusé la connexion. Pour utiliser Roombooker, il faut accepter l'accès à Google Calendar.";
    case "missing_id":
      return "Identifiant manquant.";
    case "invalid_id":
      return "Identifiant invalide.";
    case "unknown_error":
      return "Erreur inconnue. Réessaie ou contacte l'admin.";
    default:
      return code;
  }
}
