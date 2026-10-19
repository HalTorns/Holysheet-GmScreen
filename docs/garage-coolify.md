# Configurer Garage pour Convex dans Coolify

Ce guide relie le backend Convex à un service Garage existant. PostgreSQL conserve les données ; Garage stocke les fichiers, modules, indexes, imports et exports. Utiliser une clé et des buckets dédiés au produit et à l’environnement. Les domaines ci-dessous sont des exemples à remplacer par ceux de la cible.

**Si la source contient déjà des comptes, données ou objets, utiliser une nouvelle ressource Coolify avec des volumes vides pour la migration.** Conserver la source et ses volumes. Ajouter les variables S3 sur une instance ne déplace pas ses objets. Pour un projet neuf, les étapes d’export/import sont inutiles. [Migration du stockage Convex](https://github.com/convex/convex-backend/blob/5c7cb5bc7db457290f1769f95f1d1340912f7fd7/self-hosted/advanced/s3_storage.md).

## 1. Repérer les paramètres Garage

- **Endpoint API S3** : par exemple `https://s3.example.com`, à remplacer par ton adresse réelle, sans nom de bucket. Utilise l’API S3, pas l’interface d’administration ou l’endpoint des sites statiques.
- **Région** : valeur exacte de `s3_region` dans la configuration Garage, souvent `garage`.
- **Réseau** : l’endpoint doit être joignable depuis le backend Coolify et les clients qui utilisent ses URLs présignées. `localhost` dans le backend désigne son propre conteneur. Prévoir un certificat TLS reconnu.

Les domaines existants du site et de Convex restent distincts de cet endpoint S3.

## 2. Créer une clé et cinq buckets privés

Sur le serveur Garage, depuis un terminal privé disposant de la CLI configurée, choisir un préfixe propre au projet et à la production. L’exemple utilise `monprojet-prod-convex` : remplace-le partout si nécessaire.

```sh
garage key create monprojet-prod-convex
```

Conserver le **Key ID** et la **Secret key** nouvellement générés dans le gestionnaire de mots de passe. Ils correspondent respectivement à `AWS_ACCESS_KEY_ID` et `AWS_SECRET_ACCESS_KEY`. Ne pas utiliser un token d’administration Garage.

```sh
for usage in exports imports modules files search
do
  garage bucket create "monprojet-prod-convex-$usage"
  garage bucket allow "monprojet-prod-convex-$usage" --read --write --key monprojet-prod-convex
done
```

Si Garage tourne dans Docker, remplacer chaque appel `garage` par `docker exec NOM_DU_CONTENEUR /garage`. Les droits lecture/écriture suffisent pour ces opérations S3 ; ne pas rendre les buckets publics. Vérifier les cinq buckets et les permissions avec `garage bucket list` et `garage bucket info NOM_DU_BUCKET`. [Clés et buckets Garage](https://garagehq.deuxfleurs.fr/documentation/quick-start/#creating-buckets-and-keys).

## 3. Charger le Compose dans Coolify

Ouvrir la ressource cible, ou créer une nouvelle application depuis ce dépôt pour la migration :

1. Branche **main**, stratégie **Docker Compose**, répertoire de base `/`, fichier `/docker-compose.coolify.yml`.
2. Recharger la configuration depuis Git et vérifier la présence des variables `S3_*` et `AWS_*` dans le Compose.
3. Pour une migration, vérifier que les volumes `postgres-data` et `convex-data` de cette nouvelle ressource sont distincts de ceux de la source. Préparer un accès API temporaire protégé pour la CLI, sans transférer les domaines de production à ce stade.

Le [guide de déploiement](deployment.md#préparer-la-ressource-coolify) décrit les domaines, secrets Docker et accès au dashboard. [Compose depuis Git dans Coolify](https://coolify.io/docs/applications/builds/docker-compose).

## 4. Renseigner les variables S3

Dans **Environment Variables**, ajouter ces valeurs à la configuration de production de la **cible**. Remplacer l’endpoint, la région et les deux identifiants :

```dotenv
S3_ENDPOINT_URL=https://s3.example.com
AWS_REGION=garage
AWS_ACCESS_KEY_ID=REMPLACER_PAR_KEY_ID_GARAGE
AWS_SECRET_ACCESS_KEY=REMPLACER_PAR_SECRET_KEY_GARAGE
S3_STORAGE_EXPORTS_BUCKET=monprojet-prod-convex-exports
S3_STORAGE_SNAPSHOT_IMPORTS_BUCKET=monprojet-prod-convex-imports
S3_STORAGE_MODULES_BUCKET=monprojet-prod-convex-modules
S3_STORAGE_FILES_BUCKET=monprojet-prod-convex-files
S3_STORAGE_SEARCH_BUCKET=monprojet-prod-convex-search
AWS_S3_FORCE_PATH_STYLE=true
AWS_S3_DISABLE_CHECKSUMS=true
AWS_S3_DISABLE_SSE=true
```

Choisir **Runtime uniquement**, sans disponibilité au build, et conserver l’injection automatique des build args désactivée. Le Compose transmet ces valeurs uniquement au backend. Elles ne vont ni dans les `VITE_*`, ni dans les variables applicatives du dashboard Convex.

En saisie groupée, **ajouter** ces lignes en conservant toutes les variables existantes : la vue Developer remplace la liste par son contenu. Enregistrer. [Variables et portée dans Coolify](https://coolify.io/docs/applications/configuration/environment-variables).

## 5. Déployer la cible et publier les fonctions

Cliquer sur **Deploy**, suivre **Deployment Logs**, puis attendre que les quatre services soient sains. Cela ne publie pas les fonctions Convex.

Depuis un checkout de publication dédié au même commit, préparer hors Git un fichier privé `convex.s3.env` contenant `CONVEX_SELF_HOSTED_URL` vers l’API de la cible et `CONVEX_SELF_HOSTED_ADMIN_KEY` de **cette cible**, ainsi que `backend.s3.env` pour sa configuration applicative. Limiter leurs permissions à `600`.

```sh
pnpm exec convex env set --from-file /chemin/prive/backend.s3.env --env-file /chemin/prive/convex.s3.env
pnpm exec convex deploy --env-file /chemin/prive/convex.s3.env
```

Pour une migration, conserver notamment `BETTER_AUTH_SECRET`, les secrets des modules activés et la configuration email depuis le coffre de la source. Le domaine final et le RP ID des passkeys doivent rester stables ; une origine temporaire ne permet pas de valider une passkey existante. Ne pas lancer `pnpm setup` contre la production. Voir [configuration Convex et email](deployment.md#préparer-la-ressource-coolify).

## 6. Migrer les données de l’instance actuelle

Pour un projet neuf, passer directement à l’étape 7.

1. Prévoir une fenêtre de maintenance : bloquer les écritures applicatives et les intégrations sur la source avant l’export final, tout en gardant son API accessible à la CLI autorisée. Réconcilier les tâches différées, absentes de l’export.
2. Préparer `convex.source.env` hors Git, permissions `600`, avec l’URL et la clé admin de la **source**. Depuis le checkout de publication, exporter vers un nom de fichier encore absent :

   ```sh
   pnpm exec convex export --include-file-storage --path /chemin/prive/source-avant-s3.zip --env-file /chemin/prive/convex.source.env
   unzip -l /chemin/prive/source-avant-s3.zip
   ```

3. Vérifier dans l’inventaire la présence des tables applicatives, du composant Better Auth et des fichiers attendus. Garder l’archive privée et chiffrer sa copie de sauvegarde.
4. Vérifier que la cible n’a reçu aucun compte ou donnée utilisateur, puis importer **dans la cible** :

   ```sh
   pnpm exec convex import /chemin/prive/source-avant-s3.zip --env-file /chemin/prive/convex.s3.env
   ```

5. Comparer comptes, ressources, IDs, relations et fichiers avec la source avant de transférer les domaines. Conserver la source arrêtée et ses volumes pour récupération ; ne pas réouvrir les écritures sur les deux instances.

L’export ne contient ni le code ni les variables/secrets applicatifs : l’étape 5 reste nécessaire. Ce parcours utilise une cible vide, sans `--replace` ni suppression de volume. [Sauvegarde et restauration du projet](backup-restore.md), [export Convex](https://docs.convex.dev/cli/reference/export), [import Convex](https://docs.convex.dev/cli/reference/import).

## 7. Vérifier S3 et basculer

1. Sur la cible, vérifier les logs backend : absence d’erreurs S3 de signature, région, accès ou bucket manquant. Un service sain seul ne prouve pas un accès S3 fonctionnel.
2. Réaliser un export Convex de la cible avec `--include-file-storage` et `--env-file /chemin/prive/convex.s3.env`, vers un nouveau ZIP privé. Vérifier son ouverture et la présence d’objets dans `monprojet-prod-convex-exports` avec l’outil Garage habituel.
3. Si l’application possède des fichiers, tester aussi un upload puis un téléchargement ; sinon, cette vérification restera à faire lors de l’ajout du module.
4. Pour la migration, transférer **les domaines existants du produit** à la cible. Exemples à remplacer : site `app.example.com`, API `convex.example.com`, actions HTTP `convex-http.example.com`. Rétablir les origines finales `VITE_*` et `SITE_URL` avec le RP ID existant (par exemple `PASSKEY_RP_ID=app.example.com`). Ne pas changer le RP ID en recopiant un exemple. Reconstruire/redéployer après changement des `VITE_*`, puis vérifier connexion email, passkey existante, ressources et actions sensibles avant de rouvrir le trafic.
5. Sauvegarder ensemble PostgreSQL, les cinq buckets et la configuration. Garage en fonctionnement ne remplace pas une sauvegarde indépendante.

Pour les projets sans S3, laisser endpoint, région, clés et buckets vides : le volume local continue d’être utilisé. Après une migration et de nouvelles écritures sur S3, revenir au stockage local demande une nouvelle migration ; retirer les variables ne transfère aucune donnée.
