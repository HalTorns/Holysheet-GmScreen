# Plan — Chantier 1 : audit de la V1 et corrections bloquantes

Références : [BRIEF](BRIEF.md) · [PRD](../PRD.md) · [Avancement](product.md) · journal [PLAN-REVIEW-LOG](PLAN-REVIEW-LOG.md)

## Objectif

Établir, preuves à l'appui, que la V1 est saine avant d'ajouter des fonctionnalités. Les corrections bloquantes sont livrées sur `main` et la CI redevient verte.

## Critères d'acceptation observables

1. **A1 — Sécurité.** `pnpm audit --prod --audit-level=high` sort en code 0, ou bien chaque avis restant figure dans une liste d'exceptions documentée. Une exception exige quatre éléments :
   - un justificatif d'exposition ;
   - une échéance ;
   - un test qui prouve que le chemin vulnérable est fermé ;
   - l'accord explicite de l'utilisateur.
2. **A2 — CI.** Le workflow `Validation` est vert sur le dernier commit de `main` : `gh run list -L 1 --branch main` affiche `success`. Cela inclut les jobs `application` (avec l'E2E `holysheet.spec.ts`) et `secrets`.
3. **A3 — Vérification locale.** `pnpm check` passe en local sur chaque commit poussé, sauf les étapes impossibles sur cet hôte, qui sont listées explicitement.
4. **A4 — Rapport d'audit.** `docs/AUDIT.md` existe et couvre les huit axes de la section « Axes d'audit ».
   - Chaque constat porte un identifiant (`AUD-xx`) et une gravité : bloquant, majeur ou mineur.
   - Il cite une preuve : chemin et ligne, ou commande et sortie.
   - Il porte une décision : corrigé (avec le commit), planifié (avec la tranche cible) ou accepté (avec la raison).
5. **A5 — Constats bloquants.** Chaque constat bloquant est corrigé : il a un commit sur `main` et un test de non-régression, ou une justification documentée quand un test est impossible.
6. **A6 — Inventaire Convex.** L'inventaire des fonctions Convex publiques est complet. Le script de contrôle (voir l'axe A) liste 0 fonction publique hors inventaire.
7. **A7 — Pas de perte de données.**
   - Aucune modification de schéma sans migration et test de migration.
   - Si le schéma change, un test charge des documents au format V1 et prouve qu'ils restent lisibles et exportables après la migration.

## Faits établis (reconnaissance du 28/10/2026)

| Fait | Source |
|---|---|
| La CI de `main` échoue depuis l'apparition d'avis de sécurité better-auth : 1 critique (« OAuth state can be used as a Magic Link », GHSA-965c-763c-88jm) et 2 élevés (approbation d'appareil, OAuth Proxy). Versions corrigées : ≥ 1.7.7. Installée : 1.6.22. | run 40670326258, étape `pnpm audit` |
| `@convex-dev/better-auth` 0.12.6 (dernière) exige `better-auth >=1.6.11 <1.7.0`. Une montée directe en 1.7.x casse donc la contrainte de l'adaptateur Convex. La branche `release-1.6` de better-auth va jusqu'à la 1.6.33. | `npm view`, `pnpm-lock.yaml:592` |
| Le plugin `magicLink` est chargé « pour garder le schéma stable », ses routes publiques étant « séparément bloquées dans auth.ts ». `socialProviders` dépend des modules google et github. | `convex/authOptions.ts:94-148` |
| Six PR Dependabot sont ouvertes : #1 auth (passe en 1.7.12), #2 image Docker node 24 vers 26, #3 qualité, #4 tests, #5 monitoring, #6 vite 8.3.5. | `gh pr list` |
| Cet hôte est un conteneur Linux **sans Docker** (pas de `/var/run/docker.sock`), avec Node 24.22.1 (le repo vise 26.11.0) et pnpm 11.8.0. `pnpm setup`, `services:up` et les E2E (PostgreSQL, Convex local, Mailpit) ne peuvent pas tourner ici. | `docker version`, `.node-version` |
| La CI GitHub exécute tout : setup des services, `pnpm check`, l'E2E Holysheet et le scan des secrets. C'est l'environnement de preuve pour les E2E. | `.github/workflows/ci.yml` |
| Il n'existe pas de cadre de migration Convex (aucune occurrence de « migration » dans `convex/`). | `grep` |
| Ordre de grandeur : `convex/*.ts` ≈ 2 500 lignes, `src` ≈ 9 600 lignes. Modules du socle présents : organisations, ressources, admin, passkey, magic link, 2FA, PostHog, Sentry, Arcjet. | `wc`, `package.json` |
| Il y a un historique d'E2E instables : « échec au chargement après connexion/rechargement ». Un run `main` en échec existe aussi, au commit a669c54. | `docs/product.md`, `gh run list` |

## Approche

Le travail se découpe en quatre tranches séquentielles. Chaque tranche est un work order Codex borné, que Claude inspecte (diff et preuves) avant chaque commit sur `main`. Les commits se font directement sur `main`, à la demande de l'utilisateur, donc **aucun push sans `pnpm check` local vert**. Après chaque push, on suit la CI avec `gh run watch`.

### T0 — Sécurité better-auth (urgent, bloque la CI)

On suit l'arbre de décision ci-dessous et on s'arrête au premier cas qui satisfait A1 et A2.

1. **Rétroportage.** Vérifier si l'avis GHSA-965c-763c-88jm et les deux avis élevés sont corrigés dans la branche `release-1.6` : changelog et diff de la 1.6.33, ou plages corrigées de chaque avis sur GitHub.
   - Si c'est le cas, passer `better-auth` et `@better-auth/passkey` (et `auth` en dev) en 1.6.x corrigée.
   - Puis lancer `pnpm audit` : si l'audit reste rouge à cause d'une plage d'avis trop large, on passe au point 3.
2. **Montée en 1.7.x.** Sinon, évaluer `better-auth` ≥ 1.7.7 avec un `pnpm.overrides` qui dépasse la contrainte de pair de l'adaptateur.
   - Preuves exigées : `pnpm check`, plus les tests backend d'authentification (`tests/backend/auth-*.test.ts`, `pending-sign-in`, `identity-confirmation`), plus l'E2E en CI.
   - Les notes de version 1.7 contiennent des « Action required » ; chacune doit être vérifiée et consignée.
   - Le risque est un comportement non supporté par l'adaptateur : on le documente dans `docs/upgrades.md`.
3. **Exception temporaire.** Sinon, ou si le point 2 casse l'adaptateur, on démontre la non-exposition puis on demande à l'utilisateur d'accepter l'exception.
   - Démonstration :
     - les routes magic-link, OAuth, OAuth proxy et device authorization sont fermées en production (`convex/auth.ts`, configuration des modules de prod) ;
     - un test backend appelle ces routes et attend le refus.
   - Exception d'audit, à faire accepter par l'utilisateur :
     - `pnpm audit` reçoit une liste `--ignore` ciblée (ou `auditConfig.ignoreGhsas` dans `pnpm-workspace.yaml`), limitée à ces identifiants d'avis ;
     - la date de réexamen est notée dans `docs/upgrades.md` ;
     - on suit l'issue de l'adaptateur Convex.
4. **Clôture de la PR Dependabot #1.** Elle est fermée, en renvoyant au commit retenu, ou rebasée si elle correspond à la solution.

**Preuves obligatoires pour toute montée de version better-auth en T0**, qu'il s'agisse d'une 1.6.x ou d'une 1.7.x. Elles suivent `docs/upgrades.md`, sections « Protocole credentials et MFA » et « Mettre à jour les dépendances » (revues REV-01 et REV-02) :

- **a. Schéma d'authentification.**
  - Garder la CLI `auth` alignée avec `better-auth` et `@better-auth/passkey`, puis lancer `pnpm auth:generate`.
  - Relire le diff de `convex/betterAuth/generatedSchema.ts` (tables, index, suppressions) et consigner le résultat, même s'il est vide.
  - Tout changement de champ ou d'index est traité comme une migration selon A7, appliqué aux tables du composant Better Auth.
- **b. Adaptation twoFactor.**
  - Relire `convex/authOptions.ts:47-63`, c'est-à-dire le matcher `hooks.after` limité à `/sign-in/email`, contre le `dist/plugins/two-factor/index.mjs` de la nouvelle version.
  - Consigner la conclusion dans `docs/upgrades.md`.
- **c. E2E des modules d'authentification sur des services isolés, en CI** (le Docker local est indisponible).
  - Ajouter au workflow `Validation` un job `auth-modules`, déclenché par `workflow_dispatch` et par les pushes qui touchent `package.json`, `pnpm-lock.yaml` ou `convex/auth*`.
  - Ce job lance `pnpm setup` puis `pnpm test:e2e:modules` (`scripts/test-auth-modules.mjs`, qui active puis restaure les flags `AUTH_*`), puis `pnpm services:down`.
  - Il doit couvrir : la session en attente, les refus privés, le TOTP, la récupération à usage unique, l'annulation ou le remplacement, et la double exigence mot de passe plus preuve d'identité.
  - Prérequis : adapter le lanceur hérité (REV-04), car il ne tourne pas en l'état sur le produit.
    - `scripts/test-auth-modules.mjs` doit sauvegarder, désactiver puis restaurer aussi `AUTH_PASSWORD_ONLY`. Ce flag est imposé par `scripts/setup-local.mjs:74` et ne doit être modifié que sur les services isolés du job.
    - Les helpers `tests/e2e/helpers.ts:129-131` attendent encore le bouton « Nouvelle ressource » du dashboard du boilerplate. Ils doivent attendre la page Projets du produit (`src/routes/_authenticated/app/index.tsx`).
    - Le job installe Chromium (`playwright install --with-deps chromium`) et lance `pnpm build` avant les E2E.
- **d. Compte antérieur à la mise à jour.**
  - Dans ce même job CI, créer un compte (avec session, projet et Screen) **avec l'ancienne version**, puis installer la nouvelle version.
  - Vérifier ensuite : la connexion, la session existante, la révocation, la lecture et l'export de ses données GM.
  - Implémentation : un script E2E dédié, par exemple `tests/e2e/auth-upgrade.spec.ts`, en deux phases. Chaque phase utilise un ensemble cohérent : code, `package.json` et lockfile (REV-05). Un simple `pnpm install` ne suffit pas, parce que les routes Better Auth s'exécutent dans le backend Convex déployé (`convex/http.ts:6`, publié une seule fois par `convex dev --once` dans `scripts/setup-local.mjs:95-108`).
    - **Phase 1** : checkout de l'ancienne révision (parent de `codex/t0-auth`). Installation, publication sur le backend isolé (`pnpm backend:push`), build et démarrage du frontend. On crée ensuite la fixture : compte, session témoin conservée (storage state), projet, Screen.
    - **Phase 2** : checkout de la nouvelle révision, installation, `pnpm backend:push` (qui publie le nouveau code et le nouveau schéma), migration éventuelle, rebuild et redémarrage du frontend. On vérifie enfin la fixture sur **les mêmes données**, avec **le même `BETTER_AUTH_SECRET`** et la même session témoin.
    - Le job consigne les révisions effectivement publiées à chaque phase : SHA git, version `better-auth` lue dans `node_modules` et version de la déploiement Convex. Si c'est irréalisable dans un job raisonnable (plus de 20 minutes), il faut le documenter et faire la vérification manuellement sur un compte existant après redéploiement, avant de déclarer T0 clos.
- **e. Branche de validation (exception à la règle des commits directs).** T0 se valide sur une branche temporaire `codex/t0-auth`, sans PR obligatoire. La CI se déclenche sur tout push. On fait ensuite un fast-forward vers `main` seulement une fois les jobs `application`, `auth-modules` et `secrets` verts. Raison : un correctif d'authentification ne doit pas atterrir rouge sur la branche que Coolify déploie. **L'utilisateur doit valider cette exception.**

Après T0, **le déploiement Coolify revient à l'utilisateur** (code et fonctions Convex de prod). Le rapport le lui rappelle explicitement, car la prod est exposée tant qu'elle n'est pas redéployée.

### T1 — Environnement local Linux

- Installer Node 26.11.0 via nvm (déjà présent), sans toucher au Node global utilisé par d'autres outils, puis activer pnpm 11.8.0.
- Lancer `pnpm install --frozen-lockfile` et `pnpm exec playwright install chromium`.
  - Si `--with-deps` exige root, on le signale au lieu de contourner.
- Déterminer ce qui marche sans services : `ts`, `lint:ci`, `format:check`, `knip`, `test:ci` (convex-test sans serveur), `test:browser:ci` et `build`. On le consigne.
- Si une étape demande des services ou Docker, l'E2E par exemple, la preuve vient de la CI. On le dit dans `docs/development.md`, section Linux sans Docker.
- Les documents propres à Windows et WSL (`docs/windows-wsl.md`, `docs/local-setup-status.md`, `scripts/wsl.ps1`) sont listés pour décision dans l'audit (axe H). Ils ne sont pas supprimés d'office, car l'utilisateur peut encore travailler sous Windows.

### T2 — Audit en lecture seule, qui produit `docs/AUDIT.md`

Aucune modification de code dans cette tranche, sauf les scripts d'inventaire placés hors du bundle (`scripts/audit/`). Ces scripts sont versionnés s'ils servent de contrôle durable, sinon ils restent dans un dossier temporaire.

#### Axes d'audit

**A. Droits Convex.**
- Script d'inventaire : il parcourt `convex/**/*.ts` (hors `_generated`) et liste chaque `query`, `mutation`, `action` et `httpAction` exporté en public.
- Pour chaque fonction, on relève :
  - le helper d'authentification utilisé (`convex/lib/auth.ts` et `sessionAccess.ts`) ;
  - le contrôle de propriété (`gmAccess.ts`) ;
  - la validation `args` et `returns` ;
  - la pagination et les bornes.
- Toute fonction publique qui touche des données utilisateur sans contrôle de propriété est un constat **bloquant**. Une liste non paginée ou non bornée est **majeure**.
- Contrôle croisé : les tests de refus existants dans `tests/backend/gm*.test.ts`. Toute fonction GM sans test de refus d'un tiers est **majeure**.

**B. Données et migrations.**
- Revue de `convex/schema.ts` : index, champs optionnels hérités, versions de contenu et de disposition.
- Vérifier que l'export de compte, le nettoyage (`convex/cleanup.ts`) et la restauration couvrent toutes les tables métier. Une table oubliée est **bloquante**, car on perd des données ou on laisse des restes à la suppression.
- Recommander un cadre de migration pour la suite, par exemple `@convex-dev/migrations` ou des migrations internes versionnées. La décision va dans un ADR si elle est coûteuse à inverser. Elle n'est pas implémentée ici, sauf si T3 en a besoin.

**C. Sécurité applicative.**
- Revue de `convex/auth.ts`, `authHooks.ts`, `authSecurity.ts`, `http.ts` et des routes serveur `src/routes/api`, ainsi que des en-têtes HTTP (CSP).
  - La preuve HTTP, origines et CSP en mode produit vient des tests `tests/e2e/holysheet.spec.ts:226-303`, lancés en CI.
  - `tests/e2e/security.spec.ts` est **incompatible avec le mode produit** (revue REV-03) : il attend un 200 sur les options passkey, une connexion OTP et le libellé « Adresse e-mail », alors que `AUTH_PASSWORD_ONLY` refuse ces routes (`convex/lib/authHooks.ts:109-120`).
  - On le consigne comme constat de l'axe D. Ses garanties restantes sont soit portées dans des cas adaptés au produit, soit exécutées dans le job `auth-modules` avec une configuration compatible. On ne le supprime pas sans décision.
- Recherche de secrets dans `VITE_*` et dans les retours SSR.
- Vérifier que les modules désactivés le sont réellement : organisations, magic link, OAuth, admin, passkey, MFA.

**D. Tests et CI.**
- Couverture du domaine GM : contrats backend, composants, E2E.
- Instabilité de l'E2E après connexion et rechargement : reproduire à partir des artefacts CI s'ils sont disponibles, sinon par analyse du code (garde de route `_authenticated.tsx`, SSR et session), avec une hypothèse de cause.
- Échecs passés de CI (`a669c54`) : identifier leur cause.

**E. Dette et surface héritée du boilerplate.**
- Lister les modules et routes non utilisés par le produit (organisations, ressources, admin, spotlight, dashboard, docs du boilerplate) avec leur coût : lignes, dépendances, tests, surface d'attaque.
- La décision **conserver ou retirer** est proposée à l'utilisateur et n'est pas appliquée dans ce chantier. Seul un module actif et exploitable en prod peut être désactivé en T3, au titre d'un constat bloquant.

**F. Dépendances.**
- Trier les PR Dependabot #2 à #6 : fusionner, reporter ou fermer, avec la raison.
- L'image Docker node 24 vers 26 (#2) est à aligner avec `.node-version` 26.11.0 et `engines`.
- Les fusions éventuelles se font en T3, un commit par groupe, chacun prouvé par `pnpm check` et la CI.

**G. Front et UX technique.**
- Gestion du chargement et des erreurs, pertes de saisie (autosauvegarde, conflits), accessibilité de base.
- Les irritants UX de l'éditeur sont **notés** comme matière pour le chantier 3. Ils ne sont pas corrigés ici.

**H. Documentation et opérations.**
- Docs obsolètes ou contradictoires (historique du boilerplate, WSL, garage-coolify).
- Procédure de déploiement et de sauvegarde réellement suivie en prod.
- Écart entre `docs/product.md` et le code.

Livrable : `docs/AUDIT.md`. Il contient une synthèse (nombre de constats par gravité, puis décisions à prendre par l'utilisateur), puis un tableau par axe : ID, gravité, constat, preuve, décision.

### T3 — Corrections bloquantes

- Un commit par constat bloquant (ou par groupe cohérent), avec son test de non-régression, `pnpm check` vert, un push et la CI verte.
- Les constats majeurs et mineurs sont **planifiés**, pas corrigés, sauf si leur coût est trivial et qu'ils se trouvent dans un fichier déjà touché.
- Si une correction exige un changement de schéma, elle inclut la migration et le test A7.

## Non-objectifs

- Aucune nouvelle fonctionnalité du PRD. Elles relèvent du chantier 2.
- Aucune refonte de l'UI ou de l'identité visuelle. C'est le chantier 3.
- Aucun retrait de module du boilerplate sans décision de l'utilisateur.
- Aucun déploiement Coolify ni publication Convex de prod : l'utilisateur s'en charge.
- Aucun changement de secret ou de variable Coolify.

## Risques

| Risque | Mitigation |
|---|---|
| better-auth 1.7 incompatible avec l'adaptateur Convex 0.12 | Arbre de décision T0, régénération du schéma auth, revue twoFactor, E2E modules et test d'un compte antérieur en CI, exception documentée en dernier recours |
| Le job CI `auth-modules` allonge la CI | Déclenchement limité aux changements d'auth et à `workflow_dispatch` |
| Commits directs sur `main` qui cassent la prod | `pnpm check` local obligatoire avant push ; déploiement manuel par l'utilisateur, donc un commit rouge n'arrive pas en prod de lui-même |
| E2E non exécutables en local (pas de Docker) | La CI GitHub sert de preuve ; on surveille avec `gh run watch` et on lit les logs en cas d'échec |
| Faux sentiment de complétude de l'audit | Inventaire Convex scripté (A6) ; chaque axe déclare explicitement ce qui n'a pas été vérifié |
| Node 24 local contre 26 en CI | Installer 26.11.0 via nvm en T1 |

## Exigences par fournisseur

- **Codex (builder)** : accès au checkout, à Node/pnpm (nvm) et au réseau npm, et `gh` lisible pour la CI et les PR. Il ne committe ni ne pousse sauf si le work order le demande.
- **Claude (contrôleur)** : lance les preuves, inspecte les diffs, committe, pousse et suit la CI.

## Vérification

| Étape | Commande | Attendu |
|---|---|---|
| T0 | `pnpm audit --prod --audit-level=high` | code 0, ou exceptions limitées aux GHSA documentés |
| T0 | `pnpm test:ci -- tests/backend/auth tests/backend/pending-sign-in.test.ts tests/backend/identity-confirmation.test.ts` | tous verts |
| T0 | `pnpm auth:generate && git diff --stat convex/betterAuth/` | diff relu et consigné ; tout changement est couvert par A7 |
| T0 | CI de `codex/t0-auth` : jobs `application`, `auth-modules` (dont le compte antérieur à la mise à jour) et `secrets` | tous `success` avant le fast-forward vers `main` |
| Chaque commit | `pnpm check` | vert (ou étapes impossibles listées) |
| Chaque push | `gh run watch $(gh run list -L1 --branch main --json databaseId -q '.[0].databaseId') --exit-status` | `success` |
| T2 | script d'inventaire Convex | 0 fonction publique hors du tableau de l'axe A |
| T2 | `grep -c '^| AUD-' docs/AUDIT.md` et revue manuelle | tous les axes A à H présents, chaque constat avec preuve et décision |
| T3 | tests de non-régression ajoutés | verts en local et en CI |

Contrôle manuel : après le redéploiement par l'utilisateur, ouvrir la prod, se connecter, rouvrir un Screen existant et vérifier qu'aucune donnée n'est perdue.
