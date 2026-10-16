# Déploiement

## Variables et portée

| Variable | Emplacement | Exemple ou règle |
| --- | --- | --- |
| `VITE_SITE_URL` | Build frontend et serveur SSR | `https://app.example.com` |
| `VITE_CONVEX_URL` | Build frontend et serveur SSR | URL API/WebSocket du backend |
| `VITE_CONVEX_SITE_URL` | Serveur SSR/config publique | URL des actions HTTP du même backend |
| `SITE_URL` | Variables Convex | Même origine exacte que le frontend |
| `PASSKEY_RP_ID` | Variables Convex | `app.example.com`, sans schéma ni port |
| `BETTER_AUTH_SECRET` | Variables Convex privées | Aléatoire, au moins 32 caractères, distinct par environnement |
| `AUTH_EMAIL_PROVIDER` | Variables Convex | `mailpit` local, `resend` production |
| `AUTH_EMAIL_FROM` | Variables Convex | Adresse sur un domaine expéditeur vérifié |
| `RESEND_API_KEY` | Variables Convex privées | Clé dédiée aux emails transactionnels |
| `MAILPIT_URL` | Variables Convex locales | `http://mailpit:8025` dans le réseau Compose |
| `CONVEX_DEPLOY_KEY` | CI de déploiement cloud uniquement | Clé de la cible choisie |
| `CONVEX_SELF_HOSTED_URL` | CLI auto-hébergée uniquement | URL d’administration/API du backend |
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | CLI / dashboard admin privé | Jamais dans l’application ; saisie locale réservée au dashboard |

La CI de validation du dépôt n’a besoin d’aucun secret externe. Configurer un pipeline de publication séparé après choix de l’hébergeur ; aucune publication automatique n’est incluse.

`ORGANIZATIONS_ENABLED` est une variable backend optionnelle, `false` par défaut. `true` active les espaces partagés et rôles selon le [guide organisations](organizations.md). Elle n’est jamais un flag `VITE_*`. Les tables du module sont déployées dans les deux modes ; le frontend lit la capacité effective et les fonctions Convex la vérifient à chaque appel.

## Convex Cloud

1. Créer les déploiements de développement, staging et production dans Convex Cloud. Ne pas réutiliser la configuration `.env.local` auto-hébergée pour une cible cloud.
2. Configurer les variables backend ci-dessus dans les paramètres du déploiement, avec `resend`, un domaine expéditeur vérifié et le domaine HTTPS final du frontend.
3. Configurer les trois URLs publiques dans l’hébergeur frontend, et une clé `CONVEX_DEPLOY_KEY` de la cible uniquement dans le job de déploiement backend.
4. Dans un checkout CI propre, installer avec `pnpm install --frozen-lockfile`, exécuter les contrôles puis déployer backend et build :

   ```sh
   pnpm exec convex deploy --cmd 'pnpm build' --cmd-url-env-var-name VITE_CONVEX_URL
   ```

5. Héberger le serveur SSR produit (`.output/server/index.mjs`) avec le runtime compatible, puis vérifier l’authentification et l’isolation sur le domaine réel.

Le `--cmd` transmet l’URL API du backend à Vite ; les autres URLs doivent également correspondre à la cible. Les previews ont leur propre backend, leurs secrets et leur origine autorisée. Leurs passkeys ne doivent pas être supposées interchangeables avec celles de production. [CLI deploy](https://docs.convex.dev/cli/reference/deploy).

## Auto-hébergement

La configuration Compose fournie est un environnement **local** : ports liés à loopback, backend persistant et Mailpit de développement. Elle n’est pas une configuration de serveur public.

### Cible du projet : développement local, production sur Coolify

Tout le développement s’effectue sur cette machine : frontend avec rechargement, Convex et dashboard dans OrbStack, emails dans Mailpit. Le dashboard local est inclus sur le port 6791, sans clé admin dans les variables publiques. Le parcours OrbStack est décrit dans [nouveau projet](new-project.md).

La mise en ligne dispose maintenant de [`docker-compose.coolify.yml`](../docker-compose.coolify.yml), distinct du `docker-compose.yml` local, et du [`Dockerfile`](../Dockerfile) du serveur SSR. La configuration à saisir dans Coolify est décrite dans [`.env.coolify.example`](../.env.coolify.example). Les domaines et secrets réels restent propres à la cible. Coolify sait déployer plusieurs services depuis un Compose versionné dans le dépôt. [Déploiement Compose Coolify](https://coolify.io/docs/applications/builds/docker-compose).

| Service visé | Développement sur cette machine | Production Coolify |
| --- | --- | --- |
| Site TanStack Start | `pnpm dev` sur le Mac | Conteneur du serveur SSR construit |
| Backend Convex | Conteneur OrbStack, API 3210 et actions HTTP 3211 | Conteneur avec deux origines HTTPS et WebSocket |
| Dashboard Convex | Conteneur OrbStack sur le port 6791 | Accès d’administration protégé, par exemple via VPN ou tunnel |
| PostgreSQL | PostgreSQL 18.6 dans OrbStack | Même image PostgreSQL 18.6, réseau privé et volume persistant |
| Email | Mailpit | Fournisseur transactionnel configuré pour le domaine réel |

PostgreSQL est le **stockage interne de Convex**. Les données métier et Better Auth continuent de passer par Convex et ses contrôles d’accès. L’application ne nécessite donc pas un accès SQL direct ni une deuxième couche de persistance. Le backend conserve aussi un volume persistant pour les fichiers, modules et indexes tant qu’un stockage objet dédié n’est pas configuré.

Le setup initialise PostgreSQL 18 pour les nouveaux checkouts. Pour un checkout déjà initialisé avec SQLite, `pnpm setup` et `pnpm services:up` demandent une migration explicite :

```sh
# Arrêter les serveurs frontend/backend en surveillance et fermer les outils admin.
# Garder le backend Docker SQLite démarré pendant la préparation de son export.
pnpm storage:migrate
pnpm doctor
```

Cette commande accepte uniquement la cible locale et vérifie la propriété Docker. Elle sauvegarde les données avec les composants et fichiers, ainsi que les variables backend et la configuration privée, dans `backups/postgres-migration-*/`. Elle importe dans une base PostgreSQL vide, compare les documents canoniques, IDs, dates de création et fichiers, puis conserve le volume SQLite. Les données existantes de PostgreSQL ne sont jamais remplacées. Une erreur après la bascule restaure la configuration SQLite ; les données PostgreSQL restent disponibles pour diagnostic. Ne pas relancer le setup pendant la migration. Les tâches planifiées en attente ne sont pas incluses dans les exports Convex : réconcilier les travaux applicatifs différés avant une migration contenant de telles tâches.

La documentation de la révision Convex épinglée annonce des tests upstream avec **PostgreSQL 17**. Le projet utilise PostgreSQL 18.6, dont la compatibilité est vérifiée localement ; les résultats propres à ce checkout sont consignés dans [la vérification](verification.md). [Stockage PostgreSQL de Convex](https://github.com/get-convex/convex-backend/blob/5c7cb5bc7db457290f1769f95f1d1340912f7fd7/self-hosted/advanced/postgres_or_mysql.md).

Pour cette intégration, `POSTGRES_URL` est privé, ne contient pas le nom de base et pointe vers le service PostgreSQL du réseau Docker. Le nom de base correspond à `INSTANCE_NAME`, avec les tirets remplacés par des underscores. Avec l’image officielle PostgreSQL 18, monter le volume sur `/var/lib/postgresql`. Préserver l’identité et les secrets locaux du checkout, utiliser les wrappers `pnpm services:*` et garder les sauvegardes de PostgreSQL, du stockage Convex et de la configuration cohérentes. [Volume PostgreSQL 18](https://github.com/docker-library/docs/blob/master/postgres/README.md#pgdata).

### Préparer la ressource Coolify

1. Créer une application depuis le dépôt Git, sélectionner le build pack **Docker Compose**, répertoire `/`, fichier `/docker-compose.coolify.yml`. Désactiver l’injection automatique de build args : le Dockerfile déclare les seules variables publiques nécessaires.
2. Saisir les valeurs de `.env.coolify.example`. Les trois origines `VITE_*` doivent être HTTPS, sans chemin ni slash final. Générer **deux valeurs indépendantes de 32 octets hexadécimaux** pour `CONVEX_INSTANCE_SECRET` et `POSTGRES_PASSWORD`, puis les conserver avec les sauvegardes. Elles sont nécessaires au démarrage et ne passent pas dans le build frontend.
3. Configurer les domaines des services dans Coolify :

   | Service | Domaine Coolify, avec port interne | Valeur publique correspondante |
   | --- | --- | --- |
   | `site` | `https://app.example.com:3000` | `VITE_SITE_URL=https://app.example.com` |
   | `backend` | `https://convex.example.com:3210` | `VITE_CONVEX_URL=https://convex.example.com` |
   | `backend` | `https://convex-http.example.com:3211` | `VITE_CONVEX_SITE_URL=https://convex-http.example.com` |

   Ajouter les deux domaines au backend en ciblant leur port respectif. Les ports suffixés sont les ports internes du proxy, pas les ports des URLs publiques. Vérifier DNS, TLS et WebSocket sur cette cible.

4. Garder `postgres` sans domaine et sans port publié. Son réseau `database` est privé ; seul le backend y est également connecté. Les deux volumes nommés conservent PostgreSQL et le stockage Convex. Le nom d’instance `convex-production` et sa base `convex_production` sont liés dans le Compose ; modifier les deux ensemble uniquement pour une nouvelle instance.
5. Garder `dashboard` sans domaine public. Son port est publié sur loopback avec un numéro attribué par Docker. Depuis une session SSH sur le serveur, dans le répertoire Compose de cette ressource, repérer ce port avec `docker compose port dashboard 6791`, puis utiliser un tunnel SSH : `ssh -L 6792:127.0.0.1:PORT_DISTANT utilisateur@serveur`. Ouvrir `http://localhost:6792`. La clé admin reste saisie manuellement ; sa génération dans le terminal privé du backend suit le guide officiel et sa sortie doit rester hors logs partagés.
6. Déployer les fonctions Convex séparément : le build du site ne déploie pas le backend et n’utilise aucune clé admin. Dans un checkout de publication dédié au commit choisi, créer deux fichiers privés (permissions `600`, hors Git) :

   - `convex.production.env` : `CONVEX_SELF_HOSTED_URL` vers l’API HTTPS et `CONVEX_SELF_HOSTED_ADMIN_KEY` de cette nouvelle instance.
   - `backend.production.env` : `SITE_URL`, `PASSKEY_RP_ID`, `BETTER_AUTH_SECRET`, `AUTH_EMAIL_PROVIDER=resend`, `AUTH_EMAIL_FROM`, `RESEND_API_KEY` et les flags privés réellement souhaités. Le secret Better Auth est indépendant des secrets Docker. Lire les guides des modules avant leur activation.

   ```sh
   pnpm exec convex env set --from-file /chemin/prive/backend.production.env --env-file /chemin/prive/convex.production.env
   pnpm exec convex deploy --env-file /chemin/prive/convex.production.env
   ```

   Ces commandes visent explicitement la production et nécessitent l’autorisation de publier. Elles ne doivent pas être ajoutées à `pnpm setup` ou aux scripts de développement. Aucun import des données locales vers la production n’est automatique.

L’image SSR utilise Node 24 compatible avec le contrat du projet, un build multi-stage et un utilisateur sans droits root. `.dockerignore` exclut secrets, sauvegardes et sorties locales du contexte de build. Les changements de `VITE_*` exigent de reconstruire le site. Sentry SSR peut être configuré au runtime ; Arcjet reste désactivé tant que la frontière proxy de confiance n’a pas été validée.

Le healthcheck du site vérifie son serveur et un fichier statique ; les fonctions et variables Convex doivent ensuite être publiées pour les pages authentifiées. Le Compose est une préparation de déploiement. TLS, domaines, règles du proxy, sauvegardes hors serveur et parcours réels en production restent à valider sur Coolify lors de la publication.

### Configuration de la cible publique

Pour la production, déployer l’image backend officielle verrouillée sur un stockage persistant, puis configurer un reverse proxy HTTPS pour les deux origines API et actions HTTP. Adapter les origines publiques du backend à ces domaines ; le WebSocket doit traverser le proxy. Ne pas exposer le dashboard ou les accès d’administration sans protection réseau et authentification adaptées.

Utiliser les variables `CONVEX_SELF_HOSTED_*` uniquement pour la CLI/pipeline de déploiement. Configurer séparément les `VITE_*` publiques du frontend et les variables backend d’auth/email. Le frontend SSR peut être hébergé sur le même serveur ou un autre service.

À définir avec l’infrastructure : monitoring, quotas à l’entrée de l’auth, stratégie d’IP de confiance, TLS, snapshots, mises à jour du système et récupération du stockage. Mailpit reste hors production ; les emails passent par Resend. [Guide officiel auto-hébergé](https://github.com/get-convex/convex-backend/blob/main/self-hosted/README.md).

Par défaut, Better Auth ignore les en-têtes d’IP et applique un budget partagé par chemin : 120 requêtes/minute globalement, 60/minute pour la connexion OTP et la vérification passkey, 100/minute pour le plugin email OTP. Le quota d’envoi par destinataire reste à 3 codes sur 5 minutes et chaque OTP admet 3 essais. Adapter le débit global à la charge réelle, tout en conservant les quotas individuels.

Pour un quota par IP de confiance, il faut d’abord une entrée réseau qui écrase les en-têtes clients et interdit le contournement vers les routes HTTP Convex. Un proxy frontend seul ne suffit pas tant que ces routes sont joignables directement. Documenter cette frontière, tester des en-têtes falsifiés et les appels directs, puis configurer uniquement l’en-tête réellement contrôlé. Garder les protections CSRF et origines actives.

## Vérification d’ouverture

Sur la cible réelle, tester un visiteur anonyme, un compte neuf par email, une passkey, logout/login, révocation d’un autre appareil et deux comptes ne pouvant pas lire/modifier les ressources de l’autre. Examiner les cookies effectivement reçus, les refus d’origines non approuvées et les 429. Tester aussi le rendu SSR après reload et la connexion WebSocket.

Ajouter alertes email/auth, sauvegardes hors serveur et un exercice de restauration avant l’ouverture publique. Les contrôles locaux prouvent le code ; ils ne prouvent pas les règles du proxy ni les permissions du fournisseur.
