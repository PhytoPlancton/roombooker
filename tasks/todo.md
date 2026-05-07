# RoomBooker — Roadmap

**Dernière update** : 2026-05-07
**Version prod** : v0.8.0
**Stack** : Next.js 16 / TypeScript / MongoDB (cluster partagé EDJ Labs) / fetch HTTP-only Skedda

---

## ✅ État actuel — ce qui marche en prod

### Authentification
- OAuth Google direct (scopes Calendar + userinfo)
- Session iron-session 30j httpOnly
- Tokens OAuth chiffrés AES-256-GCM en DB

### Onboarding
- Pages `/`, `/onboarding`, `/dashboard`, `/api/auth/{start,callback,logout}`
- Validation téléphone FR + normalisation E.164

### Surveillance Calendar
- Push notifications Google Calendar (`events.watch`)
- Sync incrémental via `syncToken`
- Dédup booking par `iCalUID` (index unique Mongo)
- Bouton activate/deactivate watch dans dashboard

### Détection
- Skip si : event annulé, récurrent, `location` déjà set, sales pas organizer, pas d'attendee externe
- Trigger booking si tous les critères matchent

### Skedda HTTP (no Playwright)
- Bootstrap session via `GET /booking` + `GET /webs`
- Création venueuser guest (email `rb-<seed>-<room>@example.com`, unique par retry)
- Booking via `POST /bookings`
- Annulation via `DELETE /bookings/:id`
- Title = `null` (pas de fuite du sujet du meeting)
- Timezone Europe/Berlin (matche Paris)
- Window 10j : si > 10j, booking marqué `pending` mais pas tenté immédiatement

### Annulation
- Bouton "Annuler" dans dashboard (auth check ownership)
- Auto-release quand le sales annule le meeting Google Calendar

### Notifications
- SMS via EDJ Labs API (parse `failed` array correctement depuis v0.4.1)
- Email Brevo (en attente sender vérifié côté user)
- Slack stub désactivé (`SLACK_ENABLED=false`)
- Audit log persistent en DB (`auditLog` collection)

### Endpoints debug
- `GET /api/debug/audit?secret=&limit=` : 100 dernières entrées audit
- `GET /api/debug/skedda-list?secret=&days=` : bookings Skedda dans la window
- `GET /api/debug/skedda-cancel?secret=&id=` : annule un ID spécifique
- `GET /api/debug/skedda-cancel-all?secret=` : annule tout ce qu'on a en DB

### Déploiement
- Image Docker (~50 MB, plus de Chromium)
- GHCR public + GitHub Actions auto-build sur tag
- EDJ Labs stack avec Traefik labels + DNS Cloudflare
- 256 MB RAM suffisent (vs ~400 MB avec Playwright)

---

## 🛠 Backlog priorisé

### Priorité 1 — Robustesse opérationnelle ✅ (v0.5.0)

- [x] **Notif au sales quand resync Google déclenchée** — `activateWatchForUser` accepte un param `source`, notif SMS+email auto si source ∈ {`calendar_resync`, `cron_renewal`}.
- [x] **Cron renouvellement watches Google** — `setInterval` 24h via `instrumentation.ts` → `lib/cron.ts`. Trouve les users dont watch expire < 48h, re-active.
- [x] **Cron rattrapage pending bookings > 10j** — `setInterval` 6h. Query les `status: pending` dont la date passe sous 10j, re-trigger `processBookingForEvent`.
- [x] **Notif "deferred" à la création** — SMS+email envoyé directement quand meeting > 10j est détecté, mentionne la date à laquelle le booking auto sera tenté.

### Priorité 2 — Edge cases sales ✅ (v0.6.0)

- [x] **Détection déplacement meeting** — webhook compare `event.start.dateTime` à `existing.meeting.startsAt`, release + re-book si différent.
- [x] **Détection changement attendees** — si plus aucun invité externe ou si `location` setté manuellement, release la salle.
- [ ] **Récurrent** — toujours skip pour MVP. À considérer si demandé à l'usage.

### Priorité 3 — Onboarding équipe

- [ ] Onboarding des 4 autres sales muchbetter.ai
- [ ] Brevo : vérifier email sender pour activer l'envoi mail (actuellement seul le SMS marche)
- [ ] Slack : activer quand admin Workspace autorisé (`SLACK_ENABLED=true` + tokens)

### Priorité 4 — Confort (partiellement fait en v0.6.0)

- [x] **Lien magique cancel dans SMS** — `/c/<token>` avec HMAC stateless. Sales annule en 1 clic depuis son téléphone.
- [x] **Endpoint `/api/debug/notify-test`** — test manuel du pipeline notif (SMS/email) sans attendre un meeting.
- [ ] ~~Page admin / stats~~ — abandonné, over-engineering pour 5 sales.
- [ ] ~~Alerte échecs centralisée~~ — l'audit log suffit.
- [ ] Slack auto-cancel button — V2 quand Slack activé.

### Priorité 5 — Sécurité / production-readiness (action user)

- [ ] ~~Anonymiser les emails dans audit logs~~ — over-paranoid pour 5 sales internes, skip.
- [ ] ~~Rate limiting endpoints debug~~ — déjà protégés par `?secret=`, suffit.
- [ ] **Verification Google Cloud** — action user (process formel ~1 semaine, retire le warning "App not verified" lors du 1er login). Pas urgent, les sales peuvent contourner avec "Avancé > Continuer".
- [ ] **Custom domain** `auto-booking.muchbetter.ai` — action user (DNS + Google Cloud OAuth redirect URIs à update + cookies Skedda à re-tester).

---

## 🚧 Blockers actuels

- **EDJ Labs SMS API down** (côté provider, confirmé). Quand ça revient, on retentera.
- **Brevo email sender** : pas encore vérifié côté Brevo dashboard.

---

## 📌 Décisions clés

- **HTTP pur > Playwright** : 50 MB RAM vs 400 MB. Skedda anti-CSRF cracké via `antiForgeryToken` retourné par `/venueusers`.
- **Title Skedda = null** : aucun titre publié côté Skedda. firstName/lastName du sales conservés (non sensibles entre collègues).
- **Email guest unique par (meeting, room)** : évite les "user already exists" lors des retries multi-salle.
- **Slack désactivé MVP** : architecture prête, attente autorisation admin.
- **Tokens OAuth chiffrés** : AES-256-GCM, clé en env var.
- **Jitter 80-250ms** entre les requêtes Skedda pour discrétion.
