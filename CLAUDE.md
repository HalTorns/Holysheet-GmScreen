# Instructions du projet

Lire et appliquer [AGENTS.md](AGENTS.md), qui constitue la source commune des règles de travail.

Suivre son tableau de lecture selon la tâche. Pour un nouveau produit, le parcours commence dans [docs/project-start.md](docs/project-start.md) ; les outils et exemples du socle sont dans [docs/agent-patterns.md](docs/agent-patterns.md).

## Projet (reprise V2)

Brief : `docs/BRIEF.md` · Plan : `docs/PLAN.md` · Journal de review : `docs/PLAN-REVIEW-LOG.md` · Périmètre : `PRD.md` · Avancement : `docs/product.md`

- Stack : TanStack Start/Router + Convex + Better Auth, Base UI/Tailwind 4, pnpm 11.8, Node ≥24.5.
- Dev : `pnpm dev` (+ `pnpm backend:dev` pour Convex local, `pnpm services:up` / `pnpm doctor`)
- Vérification complète : `pnpm check` (ts, lint, format, knip, tests unitaires/navigateur, build)
- E2E : `pnpm test:e2e:local -- tests/e2e/holysheet.spec.ts`
- Commits directs sur `main` (choix utilisateur) : `pnpm check` vert avant tout push. Déploiement Coolify manuel par l'utilisateur. Données de prod à préserver : toute modification de schéma Convex = migration + test.

## Mode de travail : claudex

<!-- claudex:start -->
Claude est le **contrôleur**, Codex l'**exécutant**. But : qualité maximale pour un minimum de tokens Claude.

| Rôle | Qui | Outil |
|---|---|---|
| Cadrage, plan, arbitrage, décisions | Claude | session courante |
| Review indépendante du plan | Codex | `claudex-loop` |
| Implémentation (work orders bornés) | Codex | `claudex-loop builder=codex` / `codex-build` |
| Inspection finale, validation | Claude | session courante (diff + commandes de preuve) |
| Second avis ponctuel / déblocage | selon `claudex-route` | `claudex-route` |

Règles d'économie :
- Claude ne réécrit pas ce que Codex peut faire : il rédige un **work order** précis (fichiers, critères d'acceptation, commandes de preuve) et délègue.
- Claude lit les diffs et les résultats de tests, pas des fichiers entiers sans raison.
- Rounds de review bornés (3 par défaut). Si Codex et Claude divergent après 2 allers-retours, Claude tranche et note la décision dans le journal.
- Tâches triviales (typo, renommage, 1 fichier) : faites directement, sans boucle.
- Chaque tâche finit par les commandes de preuve vertes avant commit.
<!-- claudex:end -->
