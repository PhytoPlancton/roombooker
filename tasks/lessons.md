# Lessons

Format des entrées : `[date] | ce qui a mal tourné | règle pour l'éviter`

---

## Règles pré-établies (init prompt)

- **Titre Skedda PRIVÉ** : Skedda affiche le titre du booking publiquement à toute l'incubateur. **NE JAMAIS y mettre le titre du meeting Google Calendar** (peut contenir noms de prospects, montants, infos confidentielles). Toujours envoyer une constante neutre type `"Booking"`. Le `notes` reste à `null`. Le firstName/lastName du sales SONT visibles (c'est OK, voire utile : les collègues savent qui a réservé).


- **DB connections** : MongoDB cluster partagé limité à 500 connexions simultanées. Toujours utiliser un client singleton avec pool capé (`maxPoolSize: 20`), jamais ouvrir/fermer de client par requête. Utiliser `withDb()` wrapper si possible.
- **Données sensibles** : aucun mot de passe utilisateur ou token OAuth en clair en DB. Chiffrement AES-256-GCM obligatoire pour tout token donnant accès à des comptes externes.
- **Identité** : ne jamais hardcoder ou écrire le nom complet de l'utilisateur dans le code, les commits, ou les logs. Utiliser des références génériques (`user`, `sales`, `admin`).
- **Pas de `--no-verify`** sur les git commits sauf demande explicite.
- **Pas de fix bricolés** : aller à la cause racine, pas de patch qui contourne le problème.

---

## Knowledge — Skedda HTTP API (reverse engineered)

Skedda n'a pas d'API publique mais le flow JSON utilisé par leur SPA est utilisable :
1. `GET /booking` (avec User-Agent réaliste) → set cookie `X-Skedda-RequestVerificationCookie`, et extraire `__RequestVerificationToken` depuis `<input name="..." value="CfDJ8...">` (~155 chars).
2. `GET /webs` (avec `Referer: /booking`) → JSON contenant `venue[0].publicRegisterPayload` (~176 chars). Sans User-Agent + Referer corrects, retourne `{errors:[...]}` avec "super detectives".
3. `POST /venueusers` avec body `{venueuser: {termsAgreed:true, firstName, lastName, username:<EMAIL>, contactNumber, twoLetterCountryCode:"FR", registerMetadata:<publicRegisterPayload>, ...}}` + header `X-Skedda-RequestVerificationToken: <token de l'étape 1>`. Si email déjà venueuser → 422 "user already exists". Workaround : utiliser un email unique style `bot+<sales-id>@example.com`.
4. `POST /bookings` avec body `{booking: {title, start, end, spaces:["<spaceId>"], venueuser:"<id retourné en 3>", venue:"189147", type:1, ...}}` + même token CSRF.

**Venue ID Antler France** : `189147`. **Space IDs** : Jupiter=1117977, Venus=1117978, Earth=1117994, Mars=1117995, Mercury=1119104.

**Limites** : la session est invalidée par Skedda si les headers ou le timing diffèrent d'un browser réel — implémenter en headless est faisable mais fragile, casserait au moindre changement Skedda. Plus stable d'utiliser un browser headless (Playwright) ou un SaaS (Browserless).

## Leçons issues du projet

- **[2026-05-06]** | Booking Skedda décalé de 2h vs Google Calendar : un meeting à 12:00 Paris finissait booké à 10:00 sur Skedda. Cause : `formatLocalIso` utilisait `getUTCHours()` (heure UTC) alors que Skedda interprète les ISO sans timezone comme heure locale du venue (`timeZoneId="Europe/Berlin"` dans `/webs`). | **Toujours formatter dans la TZ du venue** via `Intl.DateTimeFormat` avec `timeZone: "Europe/Berlin"` + `hourCycle: "h23"`. Plus globalement : quand un service tiers dit "interprète la date sans suffixe TZ comme heure locale du lieu", **ne jamais y envoyer une heure UTC**.
- **[2026-05-06]** | En production, première vraie tentative de booking : Venus déjà prise → fallback vers Mars échoue avec `"Sorry, there is already a user at this venue associated with that email"`. Cause : même `guestEmail` utilisé pour les 2 tentatives (issu d'un seed basé uniquement sur `iCalUID`). Skedda dedupe les venueusers par email au niveau du venue, donc une même session ne peut pas créer 2 venueusers identiques. | **Pour les retries multi-salle, l'email guest doit varier par tentative** : seed = `<iCalUID-hash>-<room>` (déterministe par couple meeting/room, ce qui garde l'idempotence si on rejoue la même salle plus tard). Penser à ce piège chaque fois qu'on a un retry sur des dimensions multiples côté un service tiers qui dedupe.
- **[2026-05-06]** | Reverse engineering Skedda HTTP réussi : `antiForgeryToken` retourné par `POST /venueusers` est le NOUVEAU token CSRF à utiliser pour `POST /bookings` (différent du token initial extrait du HTML). Le cookie `X-Skedda-ApplicationCookie` ajouté à cette étape porte l'auth de session. Sans User-Agent + Referer browser-like, `/webs` retourne `{errors:[...]}` "super detectives". Avec un email "guest" unique par booking (style `rb-<hash>@example.com`), pas de collision avec les venueusers existants. Cette approche HTTP fait 4 requêtes (~2s total) au lieu de 30s+ avec Playwright et **consomme ~50 MB de RAM au lieu de 400 MB**. | Quand un site refuse l'API publique, sniffer le Network panel d'un booking manuel donne tout : URL, body shape, mécanisme CSRF. Le user m'a copié-collé toutes les requêtes dont il avait besoin — c'est l'input le plus précieux pour reverse-engineerer un protocole privé.
- **[2026-05-06]** | `playwright` en `^1.50.0` dans package.json + image Docker `mcr.microsoft.com/playwright:v1.50.0-jammy` → npm install résout sur la dernière 1.x.x dispo (1.59.1) et le binaire Chromium attendu par la lib npm n'existe pas dans l'image (`Executable doesn't exist at /ms-playwright/chromium_headless_shell-1217/...`). | **Toujours pin la version Playwright exacte** (sans `^` ni `~`) **ET aligner la balise de l'image Docker** : `playwright: "1.59.1"` ↔ `mcr.microsoft.com/playwright:v1.59.1-jammy`. Quand on bump l'un, on bump l'autre.
- **[2026-05-06]** | `req.url` dans une route handler Next.js derrière Traefik renvoie l'URL interne du container (`https://0.0.0.0:3000/...`), ce qui pollue les `Location` des `NextResponse.redirect()` post-OAuth. | Dans tout redirect serveur derrière reverse-proxy, **utiliser `process.env.PUBLIC_APP_URL` comme base URL**, jamais `req.url`. `req.url` reste OK pour parser les query params de la requête entrante.
- **[2026-05-06]** | Sans logs container fiables côté EDJ Labs ("No logs available"), debug impossible. | **Toujours doubler les `console.log` critiques par un audit log persistant en DB** (collection `auditLog`) avec un endpoint debug protégé. Inspecter la DB est plus fiable que les logs UI.
