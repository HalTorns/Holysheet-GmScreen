# Mises à jour

## Ensemble d’auth compatible

| Paquet                     | Version du socle |
| -------------------------- | ---------------- |
| `@convex-dev/better-auth`  | `0.12.5`         |
| `better-auth`              | `1.6.22`         |
| `@better-auth/passkey`     | `1.6.22`         |
| `auth` (CLI de génération) | `1.6.22`         |

Le composant 0.12 documente Better Auth `>=1.6.9` dans la ligne `1.6.x`. Une version plus récente du paquet générique n’établit pas sa compatibilité avec ce composant. Les passkeys nécessitent Local Install depuis 0.11. [Migration 0.12](https://labs.convex.dev/better-auth/migrations/migrate-to-0-12), [Migration 0.11](https://labs.convex.dev/better-auth/migrations/migrate-to-0-11).

Le socle utilise `1.6.22` plutôt que la version `1.6.15` montrée dans certains exemples : l’audit de cette ancienne version signale une vulnérabilité importante du plugin email OTP. Les exemples documentaires ne remplacent pas l’audit des versions réellement installées.

### Correctif de types du provider

`patches/@convex-dev__better-auth@0.12.5.patch` corrige uniquement le type `AuthClient` du provider React. Son union générique de plugins efface l’endpoint `getSession` dans l’inférence Better Auth 1.6.22 et transforme `useSession().data` en `never`. Le patch décrit les plugins Convex requis avec des tuples précis ; le client du projet, qui ajoute email OTP et passkeys, reste accepté structurellement.

Le JavaScript exécuté n’est pas modifié, aucun cast ne masque une incompatibilité et la version corrigée de Better Auth est conservée. pnpm applique ce patch via `patchedDependencies` et son hash dans le lockfile. Après une mise à jour du composant, supprimer le patch dès que le provider non corrigé accepte le client et que types, build et E2E passent. Ne pas le reporter aveuglément sur une autre version.

### Nettoyage des quotas Better Auth

Better Auth 1.6.22 lance la purge des anciennes lignes `rateLimit` en arrière-plan après le renouvellement d’une fenêtre expirée (`dist/api/rate-limiter/index.mjs`, fonction `deleteExpiredRows`). Avec l’adaptateur Convex, cette mutation peut dépasser la durée de l’action HTTP et produire l’avertissement `unawaited operation`. Le compteur utilisé pour autoriser la requête est attendu ; cet avertissement concerne la purge différée. Le cron `betterAuth.lifecycle.cleanupExpired` nettoie également ces anciennes lignes.

Deux avertissements ont été observés localement au premier renouvellement, puis aucun pendant la même fenêtre. Le chemin upstream explique ce scénario, mais les logs ne permettent pas d’attribuer formellement chaque occurrence. Vérifier ce comportement lors d’une mise à jour ; ne pas désactiver les quotas ou masquer globalement les avertissements pour le supprimer.

## Procédure

1. Lire changelogs et migrations officielles, confirmer la matrice de compatibilité et les changements de données.
2. Créer une branche, modifier les versions explicitement et actualiser le lockfile avec pnpm 11.8.0. Garder la CLI `auth` alignée avec Better Auth et le plugin passkey pour que le schéma soit généré par la version réellement exécutée.
3. Lancer `pnpm auth:generate` après chaque évolution de la configuration ou version d’auth. Examiner les tables, indexes et suppressions proposées.
4. Déployer sur le backend local ou un staging isolé, puis exécuter `pnpm check` et `pnpm test:e2e`.
5. Vérifier connexion email et passkey existante, ajout/suppression, révocation de session et ressources d’un compte créé **avant** la migration. Les tests avec comptes neufs seuls ne prouvent pas la migration.
6. Prendre et vérifier une sauvegarde compatible avant production. Documenter rollback code et données ; un rollback de paquet n’annule pas une migration de schéma.
7. Déployer backend et frontend dans l’ordre compatible, observer les erreurs auth/email, puis consigner versions et résultat.

Ne pas changer `BETTER_AUTH_SECRET` pour réparer une incompatibilité. Sa rotation suit le mécanisme versionné du fournisseur, avec conservation contrôlée des anciennes clés nécessaires au déchiffrement. [Rotation Better Auth 1.6](https://better-auth.com/docs/1.6/reference/security).

## Génération et reproductibilité

Le schéma Local Install appartient au projet mais ses champs dérivent de la configuration Better Auth. Ne pas renommer directement les tables générées. Garder les indexes manuels dans le schéma d’extension lorsqu’ils sont requis. Les fichiers générés Convex sont produits par le déploiement ; ne pas les éditer.

Les images Docker et actions CI sont également des dépendances. Actualiser leurs versions/digests dans une modification visible et revalider le démarrage, les E2E et une restauration. Dependabot propose des changements ; il ne les approuve pas automatiquement.

L’intégration serveur Vite utilise `nitro@3.0.260903-beta`, verrouillé exactement. Cette ligne bêta nécessite une preuve sur le serveur construit à chaque évolution : `pnpm check` puis `PLAYWRIGHT_PRODUCTION=1 pnpm test:e2e`, avec le serveur de développement arrêté. Le build SSR actuel émet des avertissements upstream `MODULE_LEVEL_DIRECTIVE` liés aux directives `use client` de dépendances ; ils n’empêchent pas le build. Examiner les nouveaux avertissements et erreurs sans masquer globalement les sorties du bundler.

Lors des navigations qui annulent une requête en cours, Nitro peut également journaliser `aborted` / `ECONNRESET` comme erreur 500. Ce bruit a été observé pendant les E2E réussis ; il ne démontre pas une panne d’auth ou du backend. Distinguer les annulations clientes des erreurs effectives dans la supervision de la cible et suivre l’évolution du runtime, sans supprimer globalement les erreurs serveur.
