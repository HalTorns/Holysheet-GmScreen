# Stockage Convex et hébergement

Décision du 16 octobre 2026, à la demande de l’utilisateur.

Le développement se fait entièrement sur cette machine, avec OrbStack pour les services. PostgreSQL 18.6 devient le stockage interne de Convex en développement et la cible du Compose Coolify. Il remplace SQLite dans ce rôle ; les accès applicatifs restent dans Convex et Better Auth utilise toujours son composant Convex.

Le volume PostgreSQL est distinct du volume Convex, qui conserve fichiers, modules et indexes. Les bases et secrets de développement et de production sont séparés. Le frontend reste lancé avec Vite pendant le développement ; en production il est construit dans un conteneur SSR. Le dashboard est réservé à l’administration.

Le stockage PostgreSQL limite l’écart entre développement et production et permet les outils de sauvegarde PostgreSQL. Il ajoute un service à administrer ; il ne garantit pas une haute disponibilité sur un serveur unique. La documentation upstream du backend épinglé mentionne PostgreSQL 17 ; la version 18 doit continuer d’être éprouvée par les tests réels du projet à chaque mise à jour.

Les anciens checkouts passent par `pnpm storage:migrate`, avec export privé, cible vide, comparaison des données et conservation de SQLite. La préparation de production est dans `docker-compose.coolify.yml` et `docs/deployment.md`. Toute publication reste une étape explicitement autorisée.
