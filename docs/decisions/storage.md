# Stockage Convex et hébergement

Décision du 16 octobre 2026, à la demande de l’utilisateur.

Le développement se fait entièrement sur cette machine, avec OrbStack pour les services. PostgreSQL 18.6 devient le stockage interne de Convex en développement et la cible du Compose Coolify. Il remplace SQLite dans ce rôle ; les accès applicatifs restent dans Convex et Better Auth utilise toujours son composant Convex.

Le volume PostgreSQL est distinct du volume Convex, qui conserve fichiers, modules et indexes. Les bases et secrets de développement et de production sont séparés. Le frontend reste lancé avec Vite pendant le développement ; en production il est construit dans un conteneur SSR. Le dashboard est réservé à l’administration.

Le stockage PostgreSQL limite l’écart entre développement et production et permet les outils de sauvegarde PostgreSQL. Il ajoute un service à administrer ; il ne garantit pas une haute disponibilité sur un serveur unique. La documentation upstream du backend épinglé mentionne PostgreSQL 17 ; la version 18 doit continuer d’être éprouvée par les tests réels du projet à chaque mise à jour.

Les anciens checkouts passent par `pnpm storage:migrate`, avec export privé, cible vide, comparaison des données et conservation de SQLite. La préparation de production est dans `docker-compose.coolify.yml` et `docs/deployment.md`. Toute publication reste une étape explicitement autorisée.

Extension du 18 octobre 2026, à la demande de l’utilisateur : le Compose Coolify permet de déléguer le stockage objet interne de Convex à un service S3 compatible existant, notamment Garage dans le homelab. Cette option reste désactivée lorsque la région et les cinq buckets ne sont pas renseignés ; les projets sans S3 conservent leur volume local et le développement OrbStack reste inchangé.

S3 stocke les exports, imports, modules, fichiers et indexes ; PostgreSQL reste la base de données de Convex. Les clés sont privées et limitées aux buckets du projet/environnement. Le changement de fournisseur de stockage d’une instance existante nécessite une migration explicite vers une cible vide, avec export incluant les fichiers et vérification de restauration ; ajouter ces variables ne migre aucune donnée. La configuration et les réglages de compatibilité Garage sont décrits dans [le guide de déploiement](../deployment.md#stockage-objet-optionnel--garage--s3).
