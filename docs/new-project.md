# Créer un projet depuis le template privé

Le template contient le code, les versions verrouillées et la CI. GitHub crée un dépôt indépendant avec son propre historique ; les secrets GitHub, fichiers ignorés et volumes Docker du socle ne sont pas transférés. La CI fonctionne sans secret GitHub à renseigner. [Templates GitHub](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template).

## Première installation

Prérequis sur le Mac : OrbStack démarré, Node 26.11.0 et pnpm 11.8.0. Pour la création en ligne de commande, GitHub CLI doit être connecté à un compte ayant accès au template privé.

Depuis le dossier qui accueillera tes projets, remplacer `mon-app` par le nom du nouveau produit :

```sh
gh repo create mon-app --private --template NathanDigiDev/boilerplate-v2 --clone
cd mon-app
pnpm install --frozen-lockfile
pnpm setup
pnpm doctor
pnpm dev
```

Autre possibilité : dans [boilerplate-v2](https://github.com/NathanDigiDev/boilerplate-v2), choisir **Use this template → Create a new repository**, sélectionner **Private**, puis cloner le nouveau dépôt et suivre les commandes à partir de l’installation. [Commande GitHub CLI](https://cli.github.com/manual/gh_repo_create).

Pendant les modifications backend, ouvrir un second terminal dans le nouveau projet :

```sh
pnpm backend:dev
```

Le frontend tourne sur le Mac pour le rechargement à chaud. OrbStack héberge Convex, son dashboard et Mailpit. `pnpm setup` attend leur santé, configure l’authentification locale et déploie les fonctions ; il ne crée aucun compte ni donnée de démonstration. Aucun compte Convex Cloud ou fournisseur email n’est nécessaire.

| Usage | Adresse ou commande |
| --- | --- |
| Application SSR et connexion | http://localhost:3000 |
| Codes email et invitations de développement | http://localhost:8025 |
| Tables, composants, fonctions et logs Convex | `pnpm dashboard` → http://127.0.0.1:6791 |
| API / WebSocket et actions HTTP Convex | http://127.0.0.1:3210 / http://127.0.0.1:3211 |
| Diagnostic sans afficher de secrets | `pnpm doctor` |

Se connecter avec une adresse fictive, lire le code dans Mailpit puis créer des données dans l’application. L’environnement exerce les vraies sessions, passkeys, règles d’accès, le SSR et les subscriptions Convex. Le serveur construit se vérifie avec `pnpm check`, puis `pnpm test:e2e:local` sur un port libre.

## Secrets et données propres au projet

Au premier setup, chaque checkout reçoit une identité Docker aléatoire, des volumes Convex et PostgreSQL dédiés, un secret d’instance, un secret Better Auth et un mot de passe PostgreSQL nouveaux. La clé admin dérive de cette instance ; elle appartient à ce backend uniquement. Les fichiers `.env.docker` et `.env.local` sont privés (`600`) et ignorés par Git. Les variables backend d’auth/email sont configurées dans cette instance Convex.

**Ne pas copier** les `.env*` privés, volumes ou sauvegardes d’un autre projet. Installer depuis les fichiers versionnés suffit. `.env.example` contient des exemples publics et une clé admin vide ; `pnpm setup` écrit les fichiers nécessaires.

Un nouveau setup dans le même projet conserve ses secrets, ses volumes, ses variables personnalisées et son choix de mode. Une configuration Docker copiée depuis un autre dossier est refusée, tout comme un sélecteur Convex distant : le setup local ne remplace pas une cible cloud.

Conserver `.env.docker` avec les volumes auxquels il appartient, dans un emplacement privé si une sauvegarde est nécessaire. Perdre ce fichier ne justifie pas de régénérer les secrets sur un volume existant. Pour déplacer un checkout existant, préserver sa configuration et planifier le déplacement avec les contrôles de propriété ; créer un nouveau produit utilise toujours le parcours template.

Les emails Mailpit sont temporaires. Tables, sessions, clés publiques passkeys et fichiers Convex persistent après `pnpm services:down`. Les clés privées passkeys restent dans l’authentificateur. Ne pas réutiliser de données ou secrets de production en local.

## Utiliser le dashboard

Sur macOS, `pnpm dashboard` vérifie que le backend appartient au checkout et que sa clé est valide, copie la clé admin locale dans le presse-papiers et ouvre le dashboard. Coller dans **Admin Key**, laisser **Deployment URL** sur `http://127.0.0.1:3210`, puis choisir **Log In**. Remplacer le contenu du presse-papiers après connexion. Sur les autres systèmes, la commande indique l’URL : copier la clé depuis `.env.local` dans ce formulaire sans l’afficher dans le terminal.

Le dashboard reçoit uniquement l’URL publique du backend via Docker. La clé n’est injectée ni dans son HTML, ni dans une variable `NEXT_PUBLIC_*`, ni dans une URL. L’image officielle épinglée conserve la clé saisie en `sessionStorage` pour l’onglet, sans `localStorage`. Utiliser **Dashboard Settings → Log Out**, puis fermer l’onglet après inspection, notamment avant de changer de projet ; une restauration d’onglets du navigateur peut prolonger leur session. Ne pas embarquer ce dashboard dans l’interface du produit. [Source de la version utilisée](https://github.com/get-convex/convex-backend/blob/5c7cb5bc7db457290f1769f95f1d1340912f7fd7/npm-packages/dashboard-self-hosted/src/pages/_app.tsx).

**La clé admin donne accès à toute l’instance**, y compris aux composants Better Auth et aux variables privées. Les rôles de l’application ne restreignent pas cet outil de développement. Inspecter les données ; modifier memberships, sessions ou passkeys directement peut contourner leurs invariants métier. Tester les permissions à travers l’application et ses API. Tous les ports Docker sont liés à `127.0.0.1` ; ne pas publier le dashboard ou Mailpit par tunnel.

## Personnaliser avant le premier domaine

1. Suivre [le guide de démarrage produit](project-start.md) : renseigner [le brief](product.md), délimiter le MVP et les domaines, décider de leur propriété dans `docs/decisions/access-model.md` et définir le premier parcours avec ses critères d’acceptation. Utiliser [les outils et exemples du socle](agent-patterns.md#choisir-les-outils-du-socle).
2. Modifier le `name` de `package.json`, puis l’identité publique dans `shared/app-config.ts` : nom, marque, description, formats et préfixe d’export. Adapter écrans, navigation et styles selon [le guide d’adoption](adopting.md).
3. Pour des données réellement partagées entre équipes, activer `ORGANIZATIONS_ENABLED=true` dans les variables du **backend de ce projet**, selon [le module organisations](organizations.md). Ne pas transformer ce réglage en flag public `VITE_*`.
4. Garder secrets et paramètres d’intégrations hors de `appConfig`. Ajouter seulement les modules nécessaires au premier parcours, avec leurs droits, quotas, export et nettoyage.
5. Déployer la configuration backend et vérifier le produit :

   ```sh
   pnpm backend:push
   pnpm exec playwright install chromium
   pnpm check
   pnpm test:e2e:local
   pnpm test:e2e:local organizations
   ```

La dernière commande active les organisations pour les tests puis restaure le réglage initial. Sur une même instance locale, laisser au moins une minute entre deux suites complètes : les tests utilisent les vrais quotas d’authentification et des passes rapprochées peuvent produire des 429. Ne pas désactiver ces protections pour les tests. Les deux modes sont aussi validés dans GitHub Actions à chaque push et pull request, avec une instance distincte par mode. Vérifier que les Actions sont autorisées dans le nouveau dépôt ; le template ne copie pas ses résultats de CI ni ses protections de branche.

Les commandes backend locales contrôlent les sélecteurs et la propriété des services avant d’appeler Convex. Elles refusent les options supplémentaires, notamment celles permettant de choisir un autre déploiement. Un shell conservant une clé distante doit être nettoyé avant de les utiliser ; la publication suit un checkout et un fichier d’environnement explicitement dédiés selon [deployment.md](deployment.md).

## Arrêter et reprendre un projet

Les ports sont fixes (`3000`, `3210`, `3211`, `6791`, `8025`) : un projet local actif à la fois. Pour changer de projet, fermer sa session dashboard, arrêter `pnpm dev` et `pnpm backend:dev` avec Ctrl+C, puis, dans ce projet :

```sh
pnpm services:down
```

Dans le projet suivant, utiliser `pnpm setup` pour sa première installation, ou `pnpm services:up` puis `pnpm doctor` pour reprendre une instance déjà initialisée. Relancer les deux serveurs de développement. Chaque projet retrouve ses propres données ; un conflit de port Docker est refusé avant création de services.

Utiliser les wrappers du projet. Ne pas lancer `docker compose down -v`, importer avec `--replace` ou supprimer un volume pour dépanner. Consulter [la sauvegarde/restauration](backup-restore.md) et [le diagnostic local](development.md) si nécessaire.

## Déploiement futur

Ce parcours simule l’application en local. Le [Compose Coolify](../docker-compose.coolify.yml) et le [guide de déploiement](deployment.md) préparent une étape distincte : domaines HTTPS stables, secrets dédiés, volumes persistants, email réel, proxy, sauvegardes et contrôle des accès administratifs devront être configurés sur cette cible. Ne pas réutiliser le Compose de développement tel quel sur un serveur public.

Pour choisir les fonctionnalités : lire [les modules auth](auth-modules.md) et [les intégrations optionnelles](observability.md). Aucun secret, compte opérateur, clé analytics ou projet Sentry du template n’est réutilisé. Activer Spotlight avec `pnpm services:up --spotlight` si le produit a besoin de diagnostic local.
