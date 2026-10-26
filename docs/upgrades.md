# Mises à jour

## Correctifs avant publication Holysheet — 26 octobre 2026

L’audit de préparation Coolify signale deux alertes high dans le lockfile du socle. Mise à jour ciblée de Zod 4.6.5 vers 4.6.6 ([GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)), avec override des dépendances transitives Zod 4 encore épinglées avant 4.6.6, et override de Happy DOM 21.0.3 vers 21.0.4 ([GHSA-834v-8h66-3h79](https://github.com/advisories/GHSA-834v-8h66-3h79)), dépendance transitive de l’outillage Vitest. Les autres versions et les patches Better Auth/Playwright restent conservés.

La configuration Zod `jitless` reste active ; vérifier types, tests, build et parcours sous CSP. Nodemailer 10.2.1 et ses types 8.0.2 sont ajoutés pour le relais SMTP, avec configuration privée et tests d’erreurs expurgées. La CI produit conserve les tests backend du socle et cible les parcours Holysheet avec vérifications SSR, origines et CSP ; les parcours UI passwordless/organisations ne correspondent pas au produit.

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

### Protocole credentials et MFA

`convex/authOptions.ts` conserve le plugin twoFactor 1.6.22 mais adapte son matcher `hooks.after` uniquement pour `/sign-in/email`. Le hook upstream (`dist/plugins/two-factor/index.mjs`) supprime sinon la session primaire et impose un cookie de challenge incompatible avec nos assurances liées à une session vivante. Ne pas supprimer les contrôles `shouldRequirePassword`/`validatePassword` ni les endpoints du plugin. Revoir cette adaptation à chaque changement de version et exécuter `pnpm test:e2e:local modules` : session en attente, refus privés, TOTP, récupération à usage unique, annulation/remplacement et double exigence mot de passe/preuve d’identité.

Les documentations Context7 consultées pour ce correctif indexaient Better Auth 1.6.23 et Vitest 4.1.6, sans versions exactes 1.6.22/4.1.11. Les hooks, vérifications et mocks ont donc été confirmés dans les sources installées ; les versions du lockfile restent inchangées.

## Procédure

### Confidentialité des échecs Playwright

Playwright 1.64.0 capture un snapshot ARIA lors de certains échecs d’assertion, même si traces, captures et vidéo sont désactivées. `PLAYWRIGHT_NO_COPY_PROMPT=1` ferme le snapshot global de fin de test, mais pas les snapshots attachés aux matchers. Une valeur de champ peut ainsi entrer dans `error-context.md`.

`patches/playwright-core@1.64.0.patch`, appliqué par pnpm, étend ce flag aux captures automatiques des assertions pour éléments présents ou absents. Il limite également l’aperçu automatique d’un élément à sa balise : les attributs HTML d’un champ contrôlé peuvent contenir sa valeur. Les résultats des assertions restent inchangés ; ces diagnostics sont neutralisés. Le flag reste activé dans `playwright.config.ts`. Les fichiers d’erreur génériques peuvent toujours exister : ne pas inclure de secrets dans les valeurs comparées, les sélecteurs ou les messages des tests.

`tests/scripts/playwright-privacy.test.ts` lance le vrai runner dans un dossier jetable, remplit un champ et son attribut HTML `value` avec une valeur synthétique puis provoque deux échecs d’assertion. Il vérifie les raisons des échecs et l’absence de la valeur dans stdout/stderr et les artefacts, avant de tout supprimer. Cette preuve a échoué avant le patch, puis a aussi révélé le chemin d’aperçu HTML après la fermeture des seuls snapshots ARIA. Chromium doit être installé avant `pnpm check`, comme en CI.

À chaque montée de Playwright, examiner le chemin des captures et le patch, puis relancer cette preuve. Supprimer le patch lorsque la version non corrigée respecte ce contrat ; ne pas le reporter aveuglément sur un autre bundle. [Sources des artefacts Playwright](https://github.com/microsoft/playwright/blob/main/packages/playwright/src/index.ts).

### Mettre à jour les dépendances

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

Le backend et le dashboard locaux utilisent la même révision Convex `5c7cb5bc7db457290f1769f95f1d1340912f7fd7`, avec les digests multi-architecture épinglés dans `docker-compose.yml`. Mettre à jour cet ensemble conjointement. Vérifier aussi le chargement du dashboard, la lecture des tables, le logout et l’absence de clé admin dans le HTML, les URLs, les logs ou `localStorage` ; ne pas activer `NEXT_PUBLIC_ADMIN_KEY` pour automatiser sa connexion.

L’intégration serveur Vite utilise `nitro@3.0.260903-beta`, verrouillé exactement. Cette ligne bêta nécessite une preuve sur le serveur construit à chaque évolution : `pnpm check` puis `PLAYWRIGHT_PRODUCTION=1 pnpm test:e2e`, avec le serveur de développement arrêté. Le build SSR actuel émet des avertissements upstream `MODULE_LEVEL_DIRECTIVE` liés aux directives `use client` de dépendances ; ils n’empêchent pas le build. Examiner les nouveaux avertissements et erreurs sans masquer globalement les sorties du bundler.

Lors des navigations qui annulent une requête en cours, Nitro peut également journaliser `aborted` / `ECONNRESET` comme erreur 500. Ce bruit a été observé pendant les E2E réussis ; il ne démontre pas une panne d’auth ou du backend. Distinguer les annulations clientes des erreurs effectives dans la supervision de la cible et suivre l’évolution du runtime, sans supprimer globalement les erreurs serveur.
