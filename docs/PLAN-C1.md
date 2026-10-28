# Plan — Tranche C1 : consolidation avant le chantier 2

Références : [AUDIT](AUDIT.md) · [PLAN chantier 1](PLAN.md) · journal [PLAN-REVIEW-LOG](PLAN-REVIEW-LOG.md)

## Objectif

Traiter, avant d'ajouter des fonctionnalités, les constats de l'audit dont la correction est peu risquée et utile au chantier 2. Il s'agit des tests d'autorisation et de la stabilité, des dépendances en attente, de l'ADR de migrations et de la remise en ordre de la documentation.

Claude code la tranche et Codex inspecte à la fin, pour économiser le quota Codex. Les choix sont délégués à Claude par l'utilisateur.

## Périmètre

Les lots ci-dessous sont indépendants et chacun est commité séparément. On travaille sur la branche `claude/c1-consolidation`, avec la CI verte avant un fast-forward vers `main`.

### L1 — Refus d'accès par un autre compte (AUD-01)

- Ajouter dans `tests/backend/gm.test.ts` et `gm-editor.test.ts` les contrats de refus pour `listProjects`, `listFolders`, `listScreens`, `createScreen` et `setLayoutLocked`.
- Le modèle est celui du test existant : Bob ne voit ni ne modifie rien de ce qui appartient à Alice. Selon le code, cela se traduit par une liste vide, `NOT_FOUND` ou un refus sans fuite d'existence.
- On compare d'abord à chaque contrôle réel (`convex/gm.ts`, `convex/gmEditor.ts`, `convex/lib/gmAccess.ts`) pour attendre le comportement effectif, et non un comportement supposé.
- Ensuite, on passe AUD-01 à « corrigé » dans l'audit.

### L2 — Tests lents ou intermittents (AUD-07)

- Mesurer avec `vitest run --reporter=verbose` la durée des tests de `gm-editor` et `gm-widgets` en exécution complète, sur 3 passes.
- **Mesure faite (3 passes complètes, Node 26.11.0) :**
  - les tests backend avec fixtures d'authentification prennent en général de 1 à 1,9 s ;
  - les pics touchent des fichiers variés : `resources` à 3,8 s, `playwright-privacy` à 4,7-5,0 s ;
  - aucun test lourd précis ne ressort : les dépassements du délai de 5 s viennent de la contention (`maxWorkers: 2` et analyses TypeScript concurrentes), pas de la boucle de 25 écritures ni de la corbeille.
- **Décision révisée :**
  - porter `testTimeout` à 15 s dans `vitest.config.ts`, avec un commentaire qui cite cette mesure ;
  - `playwright-privacy`, qui lance un vrai runner, garde un délai explicite ;
  - **aucun retry**, puisqu'un échec réel reste un échec.
- Si un test dépasse nettement les autres sans raison de volume, on consigne la cause probable dans l'audit au lieu de la masquer.
- Proposer la mise à jour de AUD-07 à « corrigé » si 3 passes complètes de `pnpm test:ci` sont vertes.

### L3 — Dépendances Dependabot (AUD-16, AUD-19, AUD-20)

- **#6** : vite 8.3.4 → 8.3.5 (rolldown 1.2.15 en transitif).
- **#5** : @sentry/tanstackstart-react 11.8.0 et posthog-js 1.438.19. On les conserve, puisque le retrait de PostHog est reporté à la tranche dette C2.
- **#2** : image Docker `node:26-bookworm-slim` au digest de la PR, sur les deux étapes `FROM`. Cela aligne la prod sur `.node-version` 26.11.0 et sur la CI.
- Les montées sont appliquées sur la branche avec pnpm 11.8.0 et un lockfile régénéré. Dependabot ferme ses PR de lui-même une fois `main` à jour. On ne fait aucune action manuelle sur les PR.
- Le paquet `vite` et le lockfile sont changés dans un commit, et `Dockerfile` dans un autre.
- **Preuve de l'image (AUD-16)** : ajouter au workflow un job `docker-image`. Il construit l'étape finale avec des `VITE_*` factices et non secrets, lance le conteneur, puis exige **HTTP 200 et le contenu attendu** de `/robots.txt` sur le port 3000. Le job échoue explicitement au bout de 60 s et arrête le conteneur dans tous les cas, même en cas d'échec. Il vérifie aussi `node --version` dans l'image finale et le compare à `.node-version`. Si le digest Dependabot ne donne pas 26.11.0, on retient le digest qui correspond à 26.11.0 ou l'on documente l'écart (C1-01, C1-02).
  - Il se déclenche sur les changements de `Dockerfile`, `package.json`, `pnpm-lock.yaml`, `.node-version` et du workflow, ainsi que sur `workflow_dispatch`.
  - Il n'a pas besoin de backend Convex. Si `/robots.txt` en exige un, choisir une route qui n'en dépend pas et le justifier.
- #3 (qualité, rouge) et #4 (Vitest 5, rouge) restent **reportées**, sans action. #1 reste ouverte (T0).

### L4 — ADR des migrations (AUD-03)

- Rédiger `docs/decisions/migrations.md` au format ADR : contexte, décision, alternatives, conséquences.
- La recommandation de l'audit est de faire des **migrations internes versionnées et bornées**. Concrètement :
  - une table de suivi des migrations ;
  - des `internalMutation` paginées et idempotentes ;
  - un champ de version de format sur les documents GM concernés ;
  - un test qui charge des documents au format V1 puis vérifie leur lecture et leur export après migration.
- Comparer avec le composant `@convex-dev/migrations`, en vérifiant sa version et sa compatibilité avec Convex 1.46 par `npm view`. Retenir l'option la moins coûteuse à maintenir.
- **Doc seulement** : aucune implémentation dans C1. La première migration réelle arrivera avec le chantier 2.

### L5 — Documentation (AUD-24, AUD-15, AUD-27)

- `docs/product.md` : un état consolidé et daté en tête, avec ce qui est livré, ce qui reste et les liens vers BRIEF, AUDIT et PLAN. Les jalons existants restent dessous comme historique.
- Créer `docs/archive/` et y déplacer, avec `git mv`, les rapports historiques et le cadrage du socle : `review.md`, `organizations-review.md`, `verification.md`, `local-setup-status.md`, `start-prompt.md`, `project-start.md` et `new-project.md`. Les liens entrants (AGENTS.md, CLAUDE.md, README.md, docs/*) sont mis à jour, ainsi que les **liens sortants des fichiers archivés**, recalculés depuis `docs/archive/` (C1-03), et un `README.md` d'une ligne dans l'archive en explique le statut.
- WSL (`docs/windows-wsl.md`, `scripts/wsl.ps1`) et Garage restent en place comme guides optionnels.
- Corriger les détails périmés relevés par AUD-27 : la mention de Resend dans `architecture.md` et l'état « branche de livraison » dans `product.md`.
- Contrôle des liens : un script ponctuel (non versionné) vérifie que tous les liens Markdown relatifs de `*.md` et `docs/**/*.md`, `docs/archive/` compris, pointent vers un fichier existant.

## Hors périmètre (tranche C2, avec son propre plan)

Le retrait de surfaces du boilerplate est reporté à C2 : organisations (AUD-10), ressources de démo (AUD-11), impersonation (AUD-12), Spotlight et dashboard (AUD-13), PostHog et Arcjet (AUD-14).

Ces retraits touchent l'authentification, des données existantes, l'export et le nettoyage, ainsi que de nombreux tests. Ils méritent un plan et une revue à part. On ne fait aucun changement de schéma dans C1.

## Critères d'acceptation

1. `pnpm check` est vert en local sous Node 26.11.0, sur chaque commit.
2. `pnpm audit --prod --audit-level=high` et `pnpm audit:convex` sortent en code 0.
3. Les nouveaux tests de refus (L1) échouent si l'on retire le contrôle d'accès concerné. Contrôle manuel ponctuel : on commente localement un contrôle et on constate l'échec, sans commit.
4. 3 passes successives de `pnpm test:ci` sont vertes (L2).
5. La CI de la branche est verte : `application` (avec l'E2E Holysheet), `secrets` et le nouveau job `docker-image`.
6. Aucun lien Markdown relatif cassé (L5).
7. `docs/AUDIT.md` met à jour la décision de AUD-01, 03, 07, 15, 16, 19, 20, 24 et 27.
8. Une inspection Codex neuve et ciblée sur `main..claude/c1-consolidation` rend APPROVED.

## Risques

| Risque | Mitigation |
| --- | --- |
| Node 26 en prod : comportement d'exécution différent | Le job `docker-image` démarre réellement l'image ; la CI et le dev tournent déjà sous 26.11.0 ; le déploiement reste manuel |
| Un délai par test masque une vraie lenteur | Délai justifié par la mesure, limité aux tests lourds connus, sans retry |
| Archivage qui casse des liens | Script de vérification des liens et `git mv` (historique conservé) |
