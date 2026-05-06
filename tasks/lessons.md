# Lessons

Format des entrées : `[date] | ce qui a mal tourné | règle pour l'éviter`

---

## Règles pré-établies (init prompt)

- **DB connections** : MongoDB cluster partagé limité à 500 connexions simultanées. Toujours utiliser un client singleton avec pool capé (`maxPoolSize: 20`), jamais ouvrir/fermer de client par requête. Utiliser `withDb()` wrapper si possible.
- **Données sensibles** : aucun mot de passe utilisateur ou token OAuth en clair en DB. Chiffrement AES-256-GCM obligatoire pour tout token donnant accès à des comptes externes.
- **Identité** : ne jamais hardcoder ou écrire le nom complet de l'utilisateur dans le code, les commits, ou les logs. Utiliser des références génériques (`user`, `sales`, `admin`).
- **Pas de `--no-verify`** sur les git commits sauf demande explicite.
- **Pas de fix bricolés** : aller à la cause racine, pas de patch qui contourne le problème.

---

## Leçons issues du projet

- **[2026-05-06]** | `playwright` en `^1.50.0` dans package.json + image Docker `mcr.microsoft.com/playwright:v1.50.0-jammy` → npm install résout sur la dernière 1.x.x dispo (1.59.1) et le binaire Chromium attendu par la lib npm n'existe pas dans l'image (`Executable doesn't exist at /ms-playwright/chromium_headless_shell-1217/...`). | **Toujours pin la version Playwright exacte** (sans `^` ni `~`) **ET aligner la balise de l'image Docker** : `playwright: "1.59.1"` ↔ `mcr.microsoft.com/playwright:v1.59.1-jammy`. Quand on bump l'un, on bump l'autre.
- **[2026-05-06]** | `req.url` dans une route handler Next.js derrière Traefik renvoie l'URL interne du container (`https://0.0.0.0:3000/...`), ce qui pollue les `Location` des `NextResponse.redirect()` post-OAuth. | Dans tout redirect serveur derrière reverse-proxy, **utiliser `process.env.PUBLIC_APP_URL` comme base URL**, jamais `req.url`. `req.url` reste OK pour parser les query params de la requête entrante.
- **[2026-05-06]** | Sans logs container fiables côté EDJ Labs ("No logs available"), debug impossible. | **Toujours doubler les `console.log` critiques par un audit log persistant en DB** (collection `auditLog`) avec un endpoint debug protégé. Inspecter la DB est plus fiable que les logs UI.
