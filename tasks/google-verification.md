# Guide de soumission Google OAuth verification

État au moment de l'écriture :
- ✅ Domaine `nmt.ovh` vérifié dans Google Search Console (via TXT DNS Cloudflare)
- ✅ Page `/privacy` publique sur `https://roombooker.nmt.ovh/privacy`
- ✅ Page d'accueil publique sur `https://roombooker.nmt.ovh/`
- ⏳ À soumettre : OAuth consent screen pour verification

## Étape 1 — OAuth consent screen (compléter)

URL : https://console.cloud.google.com/auth/branding (projet **roombooker**, compte **nicolas.monniot14@gmail.com**)

### Branding

| Champ | Valeur à coller |
|---|---|
| **App name** | `Roombooker` |
| **User support email** | `nicolas.monniot14@gmail.com` |
| **App logo** (optionnel mais recommandé) | upload un PNG 120×120, fond transparent. Si pas dispo, skip. |
| **App home page** | `https://roombooker.nmt.ovh/` |
| **App privacy policy link** | `https://roombooker.nmt.ovh/privacy` |
| **App terms of service link** | (laisser vide — pas requis) |
| **Authorized domains** | `nmt.ovh` |
| **Developer contact information** | `nicolas.monniot14@gmail.com` |

Save.

## Étape 2 — Audience

URL : https://console.cloud.google.com/auth/audience

- **Publishing status** : doit être **In production** (pas Testing). Si Testing → cliquer "Publish App".
- **User type** : External (puisque tu n'es pas admin Workspace muchbetter.ai)

## Étape 3 — Scopes (justifications à coller)

URL : https://console.cloud.google.com/auth/scopes

Ajouter ces 4 scopes (ou vérifier qu'ils sont bien là) :

| Scope | Type Google | Justification à coller |
|---|---|---|
| `.../auth/userinfo.email` | Non-sensitive | Required to identify the authenticated user. Used to look up the user record in our database after OAuth callback. |
| `.../auth/userinfo.profile` | Non-sensitive | Required to display the user's first name, last name and avatar initials in the UI ("Salut Nicolas 👋"). |
| `.../auth/calendar.readonly` | **Sensitive** | Required to read the user's primary calendar events incrementally via push notifications. The app reads only metadata (title, attendees, start/end, organizer) needed to determine whether a meeting matches the user's booking rules. We never store the full event body, attachments, or other calendars. |
| `.../auth/calendar.events` | **Sensitive** | Required to update the `location` field of the user's own meeting after the app has reserved a physical room on Skedda, so that invitees see the room name in the meeting they accepted. We do not create, delete, or otherwise modify other parts of the event. |

## Étape 4 — Soumission pour verification

URL : https://console.cloud.google.com/auth/verification

Click "**Prepare for verification**" puis "**Submit for verification**".

### Demo video / scope justification (Google demande souvent)

Coller dans le champ texte :

> Roombooker is an internal productivity tool used by a 5-person sales team at muchbetter.ai. When a sales person creates a meeting in Google Calendar that matches their configured rules (e.g., "external attendee", "title contains 'demo'"), Roombooker automatically books a matching physical meeting room on Skedda (the booking system used by their incubator, Antler France). The app then writes the room name back into the Google Calendar event's `location` field so attendees see where to go.
>
> Without `calendar.readonly` we cannot detect new meetings or evaluate the user's rules. Without `calendar.events` we cannot fill the `location` field, which is the entire user value — the room name needs to appear in the meeting invite.
>
> Data is encrypted at rest (AES-256-GCM for OAuth tokens), used only for the explicit purpose described above, never sold or shared with third parties, and deleted on user request.

### Demo video

Si Google demande une vidéo (généralement oui pour les sensitive scopes) :

1. Enregistrer un screencast ~2 min montrant :
   - Click "Continuer avec Google" sur `https://roombooker.nmt.ovh/`
   - OAuth consent screen Google avec les scopes demandés
   - Onboarding flow (téléphone)
   - Dashboard avec la liste des bookings
   - Création d'un meeting test dans Google Calendar (avec invité externe)
   - Le booking apparaît dans le dashboard + le `location` est rempli côté Google Calendar
2. Upload sur YouTube en "Unlisted" et coller le lien dans le formulaire.

## Étape 5 — Attendre

- Google review : 3-7 jours ouvrés en moyenne
- Tu reçois un email à `nicolas.monniot14@gmail.com` avec le résultat
- Si refusé : ils donnent les raisons précises, on corrige et resoumet

## Tu peux faire en attendant la review

L'app continue à marcher pour les utilisateurs en cliquant "Avancé > Continuer". Pas besoin d'attendre la verification pour onboarder les autres sales — juste un clic en plus à leur 1er login.
