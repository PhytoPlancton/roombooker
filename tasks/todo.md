# RoomBooker — TODO

**Démarré** : 2026-05-05
**Phase actuelle** : 2 — Calendar Watch + Detection (Phase 0 ✅, Phase 1 ✅, Phase 2 code ✅)

---

## Objectif produit
Quand un sales crée un meeting Google Calendar avec ≥ 1 attendee externe, l'app book automatiquement une salle physique sur Skedda (antlerfrance.skedda.com) sans aucune action du sales.

---

## Spec figée

### Trigger d'un booking
Un meeting déclenche un booking si **TOUS** les critères sont remplis :
- ≥ 1 attendee non-`@muchbetter.ai`
- Sales = organizer du meeting (`organizer.email == userEmail`)
- Pas récurrent (single occurrence)
- `location` vide (sinon le sales a déjà fait quelque chose manuellement)
- iCalUID pas déjà bookée (dédup multi-sales)

### Salles (ordre de préférence)
1. Venus (petite, 2-3 pers)
2. Mars (petite)
3. Mercury (petite)
4. Earth (grande, fallback)
5. Jupiter (grande, fallback)

### Window
- Skedda interdit booking > 10 jours dans le futur
- Si meeting > 10j → save en `pendingBookings`, cron 6h pour rattrapage quand passe sous 10j

### Conflit / aucune salle dispo
- Notif au sales (SMS + email pour MVP, Slack plus tard) avec bouton/lien :
  - "Décaler à [prochain créneau dispo, mêmes salles]" 
  - "Annuler la résa auto"

### Annulation/déplacement Calendar
- Sales supprime event → on annule la résa Skedda (testé OK par utilisateur)
- Sales déplace event → on annule l'ancienne et re-book à la nouvelle date

---

## Stack technique
- **Next.js 15** App Router + TypeScript
- **MongoDB** natif driver (pas Mongoose, contrôle pool serré — limite 500 connexions)
- **Playwright** headless (Chromium) pour automation Skedda
- **OAuth Google direct** (scopes : `calendar.readonly` + `calendar.events`)
- **Crypto** AES-256-GCM pour chiffrer tokens OAuth
- **EDJ Labs SMS API** : `https://api.edj-labs.com/messages/send`, header `X-Api-Token`
- **Email** : Brevo via API REST (`https://api.brevo.com/v3/smtp/email`)
- **Slack** : code préparé, désactivé via `SLACK_ENABLED=false` (admin pas autorisé encore)

---

## Variables d'environnement (`.env.local`)
```
MONGODB_URI=mongodb+srv://tests:5sxj9BfNp6aQwio3@tests.dzdkhq8.mongodb.net
MONGODB_DB=roombooker
ENCRYPTION_KEY=<32 bytes hex, à générer>
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://roombooker.nmt.ovh/api/auth/google/callback
GOOGLE_WEBHOOK_TOKEN=<secret aléatoire pour valider les push>
PUBLIC_APP_URL=https://roombooker.nmt.ovh
EDJ_SMS_API_TOKEN=d9f364ecd9184bcca1ad1b4139d4a6f7
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=<email vérifié dans dashboard Brevo>
BREVO_SENDER_NAME=RoomBooker
SESSION_SECRET=<32 bytes hex pour cookies signés>
SKEDDA_VENUE_URL=https://antlerfrance.skedda.com
SLACK_ENABLED=false
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
```

---

## Schéma Mongo

### `users`
```ts
{
  _id: ObjectId,
  email: string,                  // pro @muchbetter.ai
  firstName: string,              // depuis Google profile
  lastName: string,
  telephone: string,              // saisi à l'onboarding (Skedda l'exige)
  googleTokens: {                 // chiffré AES-256-GCM
    accessToken: string,          // encrypted
    refreshToken: string,         // encrypted
    expiresAt: Date
  },
  watchChannelId: string,
  watchResourceId: string,
  watchExpiry: Date,
  slackUserId: string | null,     // null pour l'instant
  notifChannels: ['sms', 'email'],// préférences
  createdAt: Date
}
```

### `bookings`
```ts
{
  _id: ObjectId,
  iCalUID: string,                // index unique (dédup)
  googleEventId: string,
  userId: ObjectId,
  meeting: {
    title: string,
    startsAt: Date,
    endsAt: Date,
    attendees: string[]
  },
  room: 'Venus' | 'Mars' | 'Mercury' | 'Earth' | 'Jupiter',
  skeddaBookingRef: string,       // identifiant trouvé dans Skedda (URL d'annulation, ID, etc)
  skeddaCancelLink: string | null,// lien magique d'annulation (capturé du mail Skedda si possible)
  status: 'booked' | 'cancelled' | 'failed',
  createdAt: Date
}
```

### `pendingBookings`
```ts
{
  _id: ObjectId,
  iCalUID: string,
  userId: ObjectId,
  meetingDate: Date,              // index pour cron
  reason: 'window_too_far',
  attempts: number,
  lastAttemptAt: Date | null,
  createdAt: Date
}
```

### `auditLog` (pour debug)
```ts
{
  _id: ObjectId,
  userId: ObjectId,
  iCalUID: string,
  action: string,
  result: 'success' | 'fail',
  errorMessage: string | null,
  screenshotPath: string | null,  // pour erreurs Skedda
  timestamp: Date
}
```

---

## Plan par phase

### Phase 0 — Setup ✅
- [x] Init Next.js 16 TypeScript App Router (passé de 15 à 16 — vuln dans 15.0.x, 16.2.4 stable)
- [x] `package.json` + dépendances (mongodb, googleapis, playwright, iron-session, zod, date-fns)
- [x] `lib/db.ts` — Mongo client singleton avec pool maxSize=20
- [x] `lib/crypto.ts` — AES-256-GCM helpers
- [x] `.env.example` complet
- [x] `Dockerfile` (multi-stage, base Playwright officielle)
- [x] `.github/workflows/build-and-push.yml`
- [x] `tsconfig.json`, `next.config.js`, `.gitignore`
- [x] **Vérifié** : `npx next build` passe, `npx tsc --noEmit` passe

### Phase 1 — OAuth Google + Onboarding (CODE ✅, RUNTIME EN ATTENTE CREDENTIALS)
- [~] Google Cloud Project + OAuth credentials (côté user — en cours)
- [x] Page `/` (landing) avec bouton "Connect Google" + redirect si déjà loggué
- [x] Route `/api/auth/google/start` (redirige vers Google avec state CSRF)
- [x] Route `/api/auth/google/callback` (récupère tokens, crée user en DB chiffré)
- [x] Page `/onboarding` (formulaire telephone, validation FR + normalisation E.164)
- [x] Page `/dashboard` (statut user + placeholder bookings)
- [x] Route `/api/auth/logout` (POST)
- [x] Cookie de session signé via iron-session (30j, httpOnly, sameSite=lax)
- [x] `lib/google.ts`, `lib/users.ts`, `lib/session.ts`
- [x] **Vérifié** : `npx next build` passe avec toutes les routes
- [ ] Test runtime : créer compte Google test, vérifier flow complet

### Phase 2 — Calendar Watch + Detection (CODE ✅, RUNTIME EN ATTENTE D'URL PUBLIQUE)
- [x] `lib/calendar.ts` — startWatch / stopWatch / syncSince / updateEventLocation
- [x] `lib/booking-rules.ts` — `shouldBookRoom` avec règles spec (cancelled/recurring/organizer/external/location)
- [x] `lib/bookings.ts` — collection bookings avec dédup unique sur iCalUID
- [x] `lib/watch.ts` — orchestration activate/deactivate watch
- [x] Route `/api/webhooks/calendar` — vérif token, sync incrémental, dédup, fire-and-forget
- [x] Server actions `activateWatchAction` / `deactivateWatchAction`
- [x] Dashboard : bouton activer/désactiver, table bookings
- [x] **Vérifié** : `npx next build` passe avec /api/webhooks/calendar
- [ ] Test runtime : créer meeting avec invité externe → voir booking pending en DB
- [ ] Cron renouvellement watches < 48h (à faire après déploiement)

### Phase 3 — Skedda Booker (Playwright)
- [ ] Module `lib/skedda.ts` 
- [ ] Flow : email gate → form principal → confirm
- [ ] Tentative ordonnée : Venus → Mars → Mercury → Earth → Jupiter
- [ ] Parser des erreurs Skedda + screenshots (volume Docker)
- [ ] Window 10j → push en `pendingBookings`
- [ ] Cron interne (setInterval 6h) pour traiter `pendingBookings`
- [ ] Récupération du `skeddaCancelLink` (probablement via mail Skedda à intercepter — voir Phase 5)

### Phase 4 — Notifications
- [ ] Module `lib/notify.ts` (interface unifiée : SMS + email + Slack)
- [ ] SMS via EDJ Labs (déjà spec OK)
- [ ] Email (en attente choix infra)
- [ ] Slack stub (route + signature, désactivé)
- [ ] Page `/action/reschedule?token=xxx` pour les liens magiques (décaler / annuler)

### Phase 5 — Annulation / Déplacement
- [ ] Détection event annulé dans webhook Calendar → annulation Skedda
- [ ] Détection déplacement → cancel + re-book
- [ ] Stratégie d'annulation Skedda (à investiguer en Phase 3)

### Phase 6 — Déploiement
- [ ] DNS Cloudflare : A record `rooms` → 79.137.79.153 (DNS only)
- [ ] Image rendue publique sur GHCR
- [ ] Stack EDJ Labs avec les 10 Deploy Labels Traefik
- [ ] `git tag v0.1.0 && git push --tags`
- [ ] Vérifier `https://roombooker.nmt.ovh` répond
- [ ] Test end-to-end avec 1 sales pilote

---

## Blockers actuels
- **Email d'expéditeur Brevo** : doit être vérifié dans le dashboard Brevo avant que l'envoi marche. Action côté user.

## Décisions
- **Pas de Slack pour MVP** : code préparé, désactivé via env var, à activer quand admin Slack sera autorisé
- **Tokens OAuth chiffrés** AES-256-GCM (Calendar = données confidentielles)
- **Skedda annulable** : confirmé par le user, on capture le lien d'annulation Skedda lors du booking
- **Telephone obligatoire** Skedda → demandé au formulaire d'onboarding une seule fois
