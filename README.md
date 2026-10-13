# Boilerplate TanStack Start + Convex

Socle TypeScript pour une application web avec SSR, données temps réel et authentification sans mot de passe. Le parcours de référence est complet : connexion par code email, ajout de passkeys, sessions révocables et ressources privées persistées dans Convex.

## Démarrer en local

Prérequis : Node.js 26.11.0 (versions prises en charge : `>=24 <27`), pnpm 11.8.0, Docker avec Compose et moteur Docker démarré.

```sh
pnpm install --frozen-lockfile
pnpm setup
pnpm dev
```

Ouvrir [localhost:3000](http://localhost:3000), utiliser une adresse email de développement et récupérer le code dans [Mailpit](http://localhost:8025). Les messages restent locaux ; aucun compte chez un fournisseur email n’est nécessaire. Utiliser **localhost** pour le frontend : le RP ID des passkeys locales est `localhost`.

`pnpm setup` démarre les services, génère les secrets locaux absents, configure le backend et déploie ses fonctions. Il conserve les données et secrets existants. La configuration privée reste dans `.env.local` et dans les variables du backend ; ne pas copier ces fichiers dans Git.

| Service                 | Adresse               |
| ----------------------- | --------------------- |
| Frontend SSR            | http://localhost:3000 |
| API et WebSocket Convex | http://127.0.0.1:3210 |
| Actions HTTP Convex     | http://127.0.0.1:3211 |
| Boîte email Mailpit     | http://localhost:8025 |

## Commandes

| Commande                      | Usage                                              |
| ----------------------------- | -------------------------------------------------- |
| `pnpm dev`                    | Frontend avec rechargement                         |
| `pnpm backend:dev`            | Surveiller et déployer les modifications Convex    |
| `pnpm backend:push`           | Déployer les fonctions locales une fois            |
| `pnpm auth:generate`          | Régénérer le schéma Better Auth Local Install      |
| `pnpm check`                  | Types, lint, format, tests backend et build        |
| `pnpm test:e2e`               | Parcours réels Chromium, Convex et Mailpit         |
| `pnpm test:e2e:organizations` | Parcours partagé avec activation locale temporaire |
| `pnpm backup:verify`          | Restauration locale sur un backend Docker jetable  |
| `pnpm build` / `pnpm start`   | Build puis serveur SSR de production               |
| `pnpm services:down`          | Arrêter les conteneurs en conservant les volumes   |

Avant le premier E2E : `pnpm exec playwright install chromium`. Les tests requièrent un backend initialisé par `pnpm setup` et démarrent le frontend automatiquement.

Pour vérifier le serveur construit et sa CSP stricte : `pnpm build`, puis `PLAYWRIGHT_PRODUCTION=1 pnpm test:e2e` après avoir arrêté le serveur de développement. La CI exécute ce mode avec le build de `pnpm check`.

## Choix structurants

- TanStack Start pour le SSR et les routes ; TanStack Query pour le cache SSR intégré à Convex.
- Convex pour le stockage et les règles métier ; chaque accès privé valide la session et le propriétaire côté backend.
- Better Auth en **Local Install** avec codes email vérifiés et passkeys. Les clés privées restent dans les authentificateurs, les sessions et clés publiques sont dans Convex.
- Tailwind v4, composants shadcn/ui et Base UI pour l’interface ; TanStack Form et Zod pour les formulaires.
- Versions d’auth verrouillées : composant Convex `0.12.5`, Better Auth `1.6.22`, passkey `1.6.22`. Mettre à jour cet ensemble avec sa procédure, pas avec une mise à jour globale aveugle.

## Documents de référence

- [Architecture et conventions](docs/architecture.md)
- [Adapter le socle à un nouveau projet](docs/adopting.md)
- [Choisir le mode personnel ou organisations au démarrage](docs/project-start.md)
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

Les paiements, stockage R2 et fonctions IA restent à brancher selon le produit.
