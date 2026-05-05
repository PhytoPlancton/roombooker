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

(à remplir au fur et à mesure des bugs et corrections)
