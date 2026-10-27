# Déployer Holysheet GM Screen dans Coolify

L’utilisateur effectue le déploiement. Le dépôt fournit le Compose, les images à construire et les commandes opérateur ; aucun secret SMTP n’est stocké dans Git.

## 1. Créer l’application depuis GitHub

- Dépôt : `HalTorns/Holysheet-GmScreen`, branche `main`.
- Build pack : **Docker Compose**, chemin `/docker-compose.coolify.yml`.
- Application : `https://gmscreen.holysheet.fr`, service `site`, port interne `3000`.
- Deux sous-domaines de backend proposés (à créer dans le DNS) : `https://convex.gmscreen.holysheet.fr`, service `backend`, port `3210` ; `https://convex-http.gmscreen.holysheet.fr`, même service, port `3211`.
- Garder `operations`, `postgres` et `dashboard` sans domaine public. Le dashboard reste accessible uniquement par son tunnel d’administration.

Dans Coolify, le port du domaine désigne le port interne du conteneur ; les visiteurs utilisent HTTPS sur le port standard. Le proxy doit accepter les WebSockets de Convex. Voir la [documentation Compose de Coolify](https://coolify.io/docs/applications/builds/docker-compose).

## 2. Renseigner les variables

Utiliser [`.env.coolify.example`](../.env.coolify.example) comme liste des noms, sans copier les fichiers privés du développement.

| Variable | Valeur / portée |
| --- | --- |
| `VITE_SITE_URL` | `https://gmscreen.holysheet.fr` ; build du site et runtime operations |
| `VITE_CONVEX_URL` | `https://convex.gmscreen.holysheet.fr` ; URL API publique, build |
| `VITE_CONVEX_SITE_URL` | `https://convex-http.gmscreen.holysheet.fr` ; URL HTTP publique, build |
| `CONVEX_INSTANCE_SECRET` | Générer 32 octets hexadécimaux et conserver avec les volumes ; runtime backend |
| `POSTGRES_PASSWORD` | Générer une autre valeur de 32 octets hexadécimaux ; runtime PostgreSQL/backend |
| `BETTER_AUTH_SECRET` | Autre secret aléatoire d’au moins 32 caractères, stable ; runtime operations uniquement |
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | Clé de la nouvelle instance, obtenue à l’étape 3 ; runtime operations uniquement |
| `SMTP_HOST` | Hôte exact de votre relais Infomaniak ; runtime operations |
| `SMTP_PORT` | Port fourni pour ce relais ; runtime operations |
| `SMTP_SECURITY` | `tls` pour TLS direct ou `starttls` pour STARTTLS obligatoire |
| `SMTP_USER` | Identifiant SMTP fourni par Infomaniak ; runtime operations |
| `SMTP_PASSWORD` | Mot de passe SMTP, à saisir directement dans Coolify ; runtime operations |
| `SMTP_EHLO_NAME` | `gmscreen.holysheet.fr` par défaut |

Les paramètres SMTP sont volontairement laissés à remplir. Le service Mail Infomaniak standard documente TLS direct sur 465 ou STARTTLS sur 587 ; utiliser les paramètres propres à votre relais si différents. [Paramètres Infomaniak](https://www.infomaniak.com/fr/support/faq/admin2/service-mail?i=3).

Pour les secrets, activer **Available at Runtime** et désactiver **Available at Buildtime**. Conserver l’injection automatique de tous les build args désactivée. Le Compose ne transmet les secrets SMTP ni au service `site`, ni à son build. Aucun serveur Resend ou Mailpit n’est nécessaire en production.

Dans l’interface actuelle : **Build time → Not available during build**, **Runtime → Available in the container**. Dans **Advanced → Build arguments**, choisir **Managed manually in Dockerfile**. Les trois URL `VITE_*` restent disponibles au build et au runtime. Retirer les anciennes variables `LOCAL_*` héritées du Compose de développement de cette ressource.

Coolify interpole tout le Compose avec `build-time.env` avant de construire les images. Les références privées utilisent donc `${VARIABLE:-}` : leur absence pendant cette étape est normale. Cela ne rend pas les valeurs facultatives au runtime : renseigner toutes les variables privées du tableau, sauf la clé admin laissée vide au tout premier démarrage. Les entrées des conteneurs backend et PostgreSQL refusent de démarrer si leur secret est absent, avant d’appeler les scripts d’origine des images. `backend:configure` vérifie les variables d’authentification et SMTP avant publication. Ne pas activer Build time pour contourner une erreur d’interpolation ; charger le dernier Compose du dépôt.

Le build Vite de production ne charge pas `scripts/local-config.mjs` : les anciennes variables `LOCAL_*`, éventuellement injectées par Coolify après un changement de Compose, ne doivent pas invalider les ports d’un build de production. Le développement et `vite preview` continuent à charger et vérifier les ports locaux. Context7 n’étant pas disponible, cette configuration conditionnelle et asynchrone a été vérifiée avec les types installés de Vite 8.3.4 et sa documentation officielle.

L’expéditeur est configuré par la commande opérateur à **`admin@holysheet.fr`**, avec le nom Holysheet GM Screen. Vérifier dans Infomaniak que cet expéditeur est autorisé pour le relais et que le domaine dispose des enregistrements SPF/DKIM prévus par le fournisseur. Ces valeurs DNS dépendent du compte Infomaniak ; elles ne sont pas inventées dans ce dépôt.

## 3. Premier démarrage et publication Convex

1. Renseigner toutes les variables, en laissant temporairement la clé admin vide, puis lancer le premier déploiement pour créer les services et volumes.
2. Dans **Terminal → backend**, exécuter `./generate_admin_key.sh`. Copier la clé directement dans la variable Coolify `CONVEX_SELF_HOSTED_ADMIN_KEY`, uniquement au runtime. Ne pas partager sa sortie dans les logs ou dans le chat.
3. Redéployer pour transmettre cette clé à `operations`.
4. Dans **Terminal → operations**, depuis `/app`, exécuter :

   ```sh
   pnpm ts && pnpm backend:configure && pnpm backend:deploy
   ```

   La première commande vérifie les types avant toute configuration. La seconde transmet une liste explicite de variables privées à Convex via son API d’administration interne ; elle n’imprime aucune valeur. Elle fixe `AUTH_PASSWORD_ONLY=true`, `AUTH_CREDENTIALS_ENABLED=true`, `ORGANIZATIONS_ENABLED=false`, `AUTH_EMAIL_PROVIDER=smtp` et `AUTH_EMAIL_FROM=admin@holysheet.fr`. La troisième publie les fonctions sur cette instance. Le démarrage des conteneurs seul ne publie pas les fonctions.

5. Pour les versions suivantes, utiliser la même commande comme **Post-deployment command**, ciblant le service `operations`. Examiner le résultat de la commande : des conteneurs healthy ne prouvent pas la réussite de la publication.

Les commandes `backend:configure` et `backend:deploy` refusent le checkout de développement contenant `.env.local` et les sélecteurs cloud. Ne jamais utiliser les secrets locaux en production. La configuration ne remplace pas les données ; les volumes sont conservés. Ne pas régénérer les secrets d’une instance déjà utilisée pour dépanner un échec.

## 4. Tester après ton déploiement

- Ouvrir `https://gmscreen.holysheet.fr`, créer un compte, recevoir l’email de vérification et se connecter par mot de passe.
- Créer projet/dossier/Screen/note, recharger et ouvrir le Screen dans un deuxième onglet ; vérifier la synchronisation.
- Vérifier récupération du mot de passe, arrivée de l’email et fermeture des anciennes sessions.
- Tester deux comptes indépendants et le fonctionnement WebSocket derrière le proxy.

Les tests locaux n’envoient rien à Infomaniak. La remise effective, les identifiants, les permissions du relais et les éventuels blocages sortants du serveur Coolify restent à vérifier sur ta cible. Les sauvegardes hors serveur suivent [le guide de sauvegarde](backup-restore.md).
