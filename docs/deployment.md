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

Le dashboard local est inclus sur le port 6791, sans clé admin dans les variables publiques. Le parcours OrbStack est décrit dans [nouveau projet](new-project.md). L’intégration Coolify reste à réaliser après choix des domaines, du stockage et des protections d’administration.

Pour la production, déployer l’image backend officielle verrouillée sur un stockage persistant, puis configurer un reverse proxy HTTPS pour les deux origines API et actions HTTP. Adapter les origines publiques du backend à ces domaines ; le WebSocket doit traverser le proxy. Ne pas exposer le dashboard ou les accès d’administration sans protection réseau et authentification adaptées.

Utiliser les variables `CONVEX_SELF_HOSTED_*` uniquement pour la CLI/pipeline de déploiement. Configurer séparément les `VITE_*` publiques du frontend et les variables backend d’auth/email. Le frontend SSR peut être hébergé sur le même serveur ou un autre service.

À définir avec l’infrastructure : monitoring, quotas à l’entrée de l’auth, stratégie d’IP de confiance, TLS, snapshots, mises à jour du système et récupération du stockage. Mailpit reste hors production ; les emails passent par Resend. [Guide officiel auto-hébergé](https://github.com/get-convex/convex-backend/blob/main/self-hosted/README.md).

Par défaut, Better Auth ignore les en-têtes d’IP et applique un budget partagé par chemin : 120 requêtes/minute globalement, 60/minute pour la connexion OTP et la vérification passkey, 100/minute pour le plugin email OTP. Le quota d’envoi par destinataire reste à 3 codes sur 5 minutes et chaque OTP admet 3 essais. Adapter le débit global à la charge réelle, tout en conservant les quotas individuels.

Pour un quota par IP de confiance, il faut d’abord une entrée réseau qui écrase les en-têtes clients et interdit le contournement vers les routes HTTP Convex. Un proxy frontend seul ne suffit pas tant que ces routes sont joignables directement. Documenter cette frontière, tester des en-têtes falsifiés et les appels directs, puis configurer uniquement l’en-tête réellement contrôlé. Garder les protections CSRF et origines actives.

## Vérification d’ouverture

Sur la cible réelle, tester un visiteur anonyme, un compte neuf par email, une passkey, logout/login, révocation d’un autre appareil et deux comptes ne pouvant pas lire/modifier les ressources de l’autre. Examiner les cookies effectivement reçus, les refus d’origines non approuvées et les 429. Tester aussi le rendu SSR après reload et la connexion WebSocket.

Ajouter alertes email/auth, sauvegardes hors serveur et un exercice de restauration avant l’ouverture publique. Les contrôles locaux prouvent le code ; ils ne prouvent pas les règles du proxy ni les permissions du fournisseur.
