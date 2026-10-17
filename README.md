# Boilerplate TanStack Start + Convex

Socle TypeScript pour une application web avec SSR, données temps réel et authentification sans mot de passe. Le socle inclut pseudos, administration applicative, confirmation des actions sensibles et formulaires protégés contre les conflits. Le parcours de référence est complet : connexion par code email, ajout de passkeys, sessions révocables et ressources privées persistées dans Convex.

## Démarrer en local

Pour un nouveau produit, créer un dépôt **privé depuis le template** : suivre [la procédure nouveau projet](docs/new-project.md), qui garde secrets, données et configuration propres à chaque application.

Prérequis : Node.js 26.11.0 (versions prises en charge : `>=24.5 <27`), pnpm 11.8.0, Docker avec Compose et moteur Docker démarré.

```sh
pnpm install --frozen-lockfile
pnpm setup
pnpm dev
```

Ouvrir [localhost:3000](http://localhost:3000), utiliser une adresse email de développement et récupérer le code dans [Mailpit](http://localhost:8025). Les messages restent locaux ; aucun compte chez un fournisseur email n’est nécessaire. Utiliser **localhost** pour le frontend : le RP ID des passkeys locales est `localhost`.

`pnpm setup` démarre PostgreSQL 18.6, Convex, son dashboard et Mailpit, génère les secrets locaux absents, configure le backend et déploie ses fonctions. Il conserve les données et secrets existants. La configuration privée reste dans `.env.local` et dans les variables du backend ; ne pas copier ces fichiers dans Git.

| Service                 | Adresse               |
| ----------------------- | --------------------- |
| Frontend SSR            | http://localhost:3000 |
| API et WebSocket Convex | http://127.0.0.1:3210 |
| Actions HTTP Convex     | http://127.0.0.1:3211 |
| Dashboard Convex        | http://127.0.0.1:6791 |
| Boîte email Mailpit     | http://localhost:8025 |

PostgreSQL stocke les données internes de Convex dans un volume distinct ; son port reste privé dans le réseau Docker. Pour un ancien checkout SQLite, arrêter les serveurs de développement puis lancer `pnpm storage:migrate` avant de reprendre le setup. La [procédure de migration](docs/deployment.md#cible-du-projet--développement-local-production-sur-coolify) conserve le volume SQLite et un export privé vérifié.

Pendant les changements backend, lancer `pnpm backend:dev` dans un second terminal. `pnpm dashboard` ouvre l’outil admin local et, sur Mac, copie sa clé pour la connexion. Coller dans **Admin Key**, puis **Log In** ; remplacer le presse-papiers et se déconnecter après usage. Le dashboard inspecte toute l’instance, indépendamment des rôles de l’application.

## Commandes

| Commande | Usage |
| --- | --- |
| `pnpm dev` | Frontend avec rechargement |
| `pnpm backend:dev` | Surveiller et déployer les modifications Convex |
| `pnpm backend:push` | Déployer les fonctions locales une fois |
| `pnpm dashboard` | Ouvrir le dashboard admin Convex local |
| `pnpm doctor` | Vérifier configuration et santé des services |
| `pnpm auth:generate` | Régénérer le schéma Better Auth Local Install |
| `pnpm check` | Types, Oxlint, Oxfmt, Knip, Vitest backend/Browser Mode et build |
| `pnpm test:e2e` | Parcours réels Chromium, Convex et Mailpit |
| `pnpm test:e2e:organizations` | Parcours partagé avec activation locale temporaire |
| `pnpm storage:migrate` | Migrer un ancien checkout SQLite vers PostgreSQL 18 |
| `pnpm backup:verify` | Restauration locale sur un backend Docker jetable |
| `pnpm build` / `pnpm start` | Build puis serveur SSR de production |
| `pnpm services:down` | Arrêter les conteneurs en conservant les volumes |

Avant le premier E2E : `pnpm exec playwright install chromium`. Les tests requièrent un backend initialisé par `pnpm setup` et démarrent le frontend automatiquement.

Pour vérifier le serveur construit et sa CSP stricte sans viser une autre application : `pnpm test:e2e:local` choisit un port libre, construit son serveur et restaure l’origine backend. Ajouter `organizations` ou `modules` pour ces parcours optionnels. La CI exécute les suites directement sur son propre serveur de production et le build de `pnpm check`.

## Choix structurants

- TanStack Start pour le SSR et les routes ; TanStack Query pour le cache SSR intégré à Convex.
- Convex pour le stockage et les règles métier ; chaque accès privé valide la session et le propriétaire côté backend.
- Better Auth en **Local Install** avec codes email vérifiés et passkeys. Les clés privées restent dans les authentificateurs, les sessions et clés publiques sont dans Convex.
- Tailwind v4, composants shadcn/ui et Base UI pour l’interface ; TanStack Form et Zod pour les formulaires.
- Versions d’auth verrouillées : composant Convex `0.12.5`, Better Auth `1.6.22`, passkey `1.6.22`. Mettre à jour cet ensemble avec sa procédure, pas avec une mise à jour globale aveugle.

## Documents de référence

- [Architecture et conventions](docs/architecture.md)
- [Créer une application depuis le template privé](docs/new-project.md)
- [Adapter le socle à un nouveau projet](docs/adopting.md)
- [Choisir le mode personnel ou organisations au démarrage](docs/project-start.md)
- [Comptes, administration et formulaires réutilisables](docs/accounts.md)
- [Sécurité et limites du socle](docs/security.md)
- [Développement, tests et CI](docs/development.md)
- [Résultats de vérification locale](docs/verification.md)
- [Revue complète et corrections](docs/review.md)
- [Déploiement cloud et auto-hébergé](docs/deployment.md)
- [Sauvegarde et restauration](docs/backup-restore.md)
- [Mises à jour compatibles](docs/upgrades.md)
- [Modules optionnels](docs/modules.md)
- [Organisations et rôles optionnels](docs/organizations.md)
- [Revue de l’isolation et des permissions](docs/organizations-review.md)

Les organisations et rôles sont intégrés mais désactivés par défaut. Activer `ORGANIZATIONS_ENABLED=true` dans Convex pour ajouter des espaces partagés avec propriétaires, administrateurs, membres et lecteurs. L’espace personnel reste disponible. Le [guide du module](docs/organizations.md) décrit permissions, invitations et cycle de vie des données.

La cible de production est Coolify : le [Compose de production](docker-compose.coolify.yml), le [Dockerfile SSR](Dockerfile) et le [guide de déploiement](docs/deployment.md) préparent la mise en ligne avec des domaines et secrets dédiés.

Les paiements, stockage R2 et fonctions IA restent à brancher selon le produit.

## Modules et qualité

Les conventions Codex/Claude/Cursor sont centralisées dans [AGENTS.md](AGENTS.md) et [les patterns agents](docs/agent-patterns.md). Oxlint/Ultracite, Oxfmt, Knip et les hooks Lefthook/lint-staged forment la chaîne de qualité ; `.vscode` fournit extensions, réglages et tâches. Node >=24.5 <27, version conseillée 26.11.0.

[Magic Links, MFA, OAuth et support admin](docs/auth-modules.md) restent optionnels. [SEO, Arcjet, Sentry/Spotlight et PostHog](docs/observability.md) possèdent leurs propres configurations ; le défaut n’exige aucun compte SaaS. `pnpm services:up --spotlight` ouvre aussi l’interface de diagnostic locale sur le port 8969. Le mode personnel reste le point de départ du template.
