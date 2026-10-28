# Mises à jour

## T0 — Exception d'audit Better Auth acceptée — 28 octobre 2026

**Décision : option 3 approuvée explicitement par l'utilisateur le 2026-10-28.** Better Auth, passkey et la CLI `auth` restent en **1.6.22**, l'adaptateur en **0.12.5** ; aucun changement de lockfile, de schéma ou de secret. Réexamen **au plus tard le 2026-11-30**, ou dès qu'une version de `@convex-dev/better-auth` prend en charge Better Auth **>= 1.7.7**. Cette exception accepte les trois avis uniquement sous les conditions de non-exposition ci-dessous.

### Options de mise à jour écartées

Les plages officielles excluent une 1.6.x corrigée : GHSA-965c-763c-88jm (`>=1.4.0-beta.18 <1.7.7`), GHSA-q84f-53jg-9ppm (`>=1.3.8-beta.3 <1.7.0-rc.3`) et GHSA-r4xp-prcw-77qf (`>=1.5.0-beta.12 <1.7.7`). La [1.6.33](https://github.com/better-auth/better-auth/releases/tag/v1.6.33) n'annonce pas de rétroportage de ces correctifs.

L'essai aligné en **1.7.12** avec override du pair de l'adaptateur a passé l'installation verrouillée et l'audit high, mais `auth:generate` et les tests backend échouent sur `ERR_PACKAGE_PATH_NOT_EXPORTED` : l'adaptateur importe `better-auth/plugins/oidc-provider`, supprimé en 1.7. La [source de l'adaptateur 0.12.6, ligne 11](https://github.com/get-convex/better-auth/blob/v0.12.6/src/plugins/convex/index.ts#L11) conserve cet import. L'essai a été retiré ; une simple dérogation de pair ne suffit pas.

### Justification de non-exposition

| Avis et condition officielle | Preuve dans le code conservé |
| --- | --- |
| [GHSA-965c-763c-88jm](https://github.com/advisories/GHSA-965c-763c-88jm), critique : le contournement officiel autorise Magic Link `storeToken: "hashed"` avec `verification.storeIdentifier` absent ou `"plain"`. | `convex/authOptions.ts:148` configure `storeToken: 'hashed'`. L'objet construit à `convex/authOptions.ts:82` ne définit pas `verification.storeIdentifier` ; le test vérifie cette valeur dans les options réelles. `convex/auth.ts:56` et `convex/auth.ts:66` ne construisent Google/GitHub que si leurs flags et identifiants privés sont renseignés. Le mode produit configuré par `scripts/configure-backend.mjs:81` impose `AUTH_PASSWORD_ONLY=true` ; `convex/lib/authHooks.ts:109` refuse alors Magic Link, les connexions sociales et leurs callbacks. `convex/lib/authHooks.ts:139` refuse aussi Magic Link quand son module est fermé. Le contournement par hachage reste la justification même si un module social est ouvert. |
| [GHSA-q84f-53jg-9ppm](https://github.com/advisories/GHSA-q84f-53jg-9ppm), élevée : seul le plugin optionnel `deviceAuthorization()` expose ce chemin. | La liste de plugins de `convex/authOptions.ts:143`, utilisée par `convex/auth.ts:81`, ne contient pas ce plugin. Son ID réel en 1.6.22 est `device-authorization` (`node_modules/better-auth/dist/plugins/device-authorization/index.mjs:33`), absent des options contrôlées par le test. |
| [GHSA-r4xp-prcw-77qf](https://github.com/advisories/GHSA-r4xp-prcw-77qf), élevée : le chemin exige le plugin OAuth Proxy. | Même liste `convex/authOptions.ts:143` : aucun plugin `oauth-proxy` (ID confirmé dans `node_modules/better-auth/dist/plugins/oauth-proxy/index.mjs:38`). `convex/authOptions.ts:93` désactive également le rattachement de comptes. `AUTH_PROXY_REQUIRED` dans `convex/lib/authHooks.ts:121` est un garde HTTP propre au projet, pas le plugin OAuth Proxy de Better Auth. |

Ces preuves portent sur le code et la procédure de configuration du produit ; aucune configuration ni aucun secret de production n'a été lu. Elles ne prétendent pas vérifier l'état d'un déploiement distant.

### Configuration pnpm et test de garde

`pnpm-workspace.yaml` contient uniquement ces trois IDs dans **`auditConfig.ignoreGhsas`**. La [source pnpm 11.8.0](https://github.com/pnpm/pnpm/blob/v11.8.0/deps/compliance/commands/src/audit/audit.ts#L332) filtre les avis sur cette clé ; le [lecteur de configuration 11.8.0](https://github.com/pnpm/pnpm/blob/v11.8.0/config/reader/src/index.ts#L440) charge le manifeste workspace. Le binaire pnpm 11.8.0 installé normalise cette configuration en `audit.ignore`, visible avec `pnpm config get audit --json`. L'audit affiche explicitement **deux high ignorés et un critical ignoré**, avec code 0 au seuil high. La commande CI reste **`pnpm audit --prod --audit-level=high`**, inchangée dans `.github/workflows/ci.yml:37` ; les autres avis conservent leur traitement normal.

`tests/backend/auth-advisories.test.ts` utilise l'instance réelle de `convex/betterAuth/auth.ts:17`, construite par `buildAuthOptions`, sans mock des plugins et sans grep du code d'authentification. Il contrôle le hachage Magic Link, l'absence de hachage global des identifiants, les deux IDs de plugins interdits et le rattachement désactivé. Il lit le manifeste et interroge le parseur pnpm pour refuser tout ajout ou retrait dans la liste approuvée. Enfin il autorise la période jusqu’au **2026-11-30 inclus en UTC** et échoue dès le 2026-12-01, avec un message français demandant de réexaminer l'exception. Les tests existants de transport et de politique password-only couvrent les refus HTTP ; ce nouveau garde protège les conditions déclaratives qui pourraient réintroduire l'exposition sans modifier ces parcours.

Preuves locales du 2026-10-28, sous pnpm 11.8.0 : `pnpm install --frozen-lockfile` réussi ; `pnpm audit --prod --audit-level=high` code 0 avec exactement les trois avis ignorés ; `pnpm test:ci -- tests/backend/auth-advisories.test.ts tests/backend/auth-config.test.ts` réussi (la commande exécute toute la suite : 25 fichiers, 142 tests). `pnpm check` complet réussi : types, lint, formatage, Knip, ces 142 tests, 5 fichiers/7 tests navigateur et build. Les avertissements upstream de bundling restent ceux documentés ci-dessous. `pnpm format` et `pnpm format:check` réussissent ; les changements des documents de cadrage restent limités à leur mise en forme.

### Sortie de l'exception et future montée

Dès qu'un adaptateur compatible paraît :

1. Réexaminer les trois avis et retirer leurs exceptions ; aligner Better Auth, passkey et CLI sur une version corrigée, avec le lockfile associé. Ne pas reporter aveuglément le patch de types de l'adaptateur.
2. Relire toutes les migrations de la version retenue. Les [notes 1.7.0](https://github.com/better-auth/better-auth/releases/tag/v1.7.0) suppriment `oidc-provider` : l'adaptateur doit fournir une intégration compatible. Le [guide versionné 1.7.12](https://github.com/better-auth/better-auth/blob/v1.7.12/docs/content/docs/guides/1-7-upgrade-guide.mdx) exige de discriminer `enableTwoFactor().method` avant `totpURI`/`backupCodes` ; il précise aussi que `account.issuer`, introduit en 1.7.0–1.7.2, a été retiré en 1.7.3. La [note Action required de 1.7.12](https://github.com/better-auth/better-auth/releases/tag/v1.7.12) exige un `clientId` pour la connexion par ID token ; les fournisseurs actuels en reçoivent un dans `convex/auth.ts:60` et `convex/auth.ts:70`.
3. Exécuter les preuves T0 **a–d** de `docs/PLAN.md` : `pnpm auth:generate`, revue des tables/index/suppressions et migration si nécessaire ; revue du hook twoFactor ; job CI `auth-modules` et E2E modules ; test en deux phases d'un compte créé en 1.6.22, avec mêmes données/secret et session témoin privée, puis vérification de connexion, révocation, projet/Screen/note lisibles et exportables. Le lanceur modules devra aussi sauvegarder/désactiver/restaurer `AUTH_PASSWORD_ONLY`, et ses attentes viser « Mes projets. ».
4. Relancer audit, `pnpm check` et E2E sur services isolés ; sauvegarde vérifiée et déploiement manuel selon le guide, sans rotation de secret de dépannage.

Le matcher twoFactor 1.7.12 examiné dans l'essai supprime toujours la session primaire sur `/sign-in/email` : l'exclusion spécifique actuelle reste nécessaire, sans retirer les contrôles `shouldRequirePassword`/`validatePassword`. La génération en 1.6.22 a réussi sans diff ; ce résultat ne valide pas un futur schéma 1.7.

**Le job CI `auth-modules` et le test de compte antérieur sont différés à cette future montée, puisqu'aucune version ne change ici.** Les jobs existants restent inchangés. Les preuves locales de cette décision sont consignées dans le rapport de livraison ; aucune CI ni E2E avec services n'est revendiqué. Context7 MCP étant indisponible, les vérifications s'appuient sur les sources installées et officielles versionnées. La PR Dependabot #1 reste à traiter avec l'adaptateur compatible ; un simple rebase ne corrige pas son incompatibilité 1.7.12.

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
