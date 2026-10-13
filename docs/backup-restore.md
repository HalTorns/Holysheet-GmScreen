# Sauvegarde et restauration

## Ce qui doit être récupérable

Une sauvegarde utilisable comprend les ressources **et** les données du composant Better Auth : utilisateurs, comptes, sessions, vérifications et clés publiques passkey. Les clés privées des utilisateurs ne se sauvegardent pas côté serveur. Conserver séparément le commit applicatif, le lockfile, les versions d’images et les variables/secrets du déploiement dans un coffre adapté.

Les exports de données Convex ne contiennent pas le code, les variables d’environnement ni les fonctions planifiées en attente. Une restauration ne relance donc pas implicitement tous les nettoyages ou travaux perdus ; les réconcilier avec les données restaurées. [Périmètre des sauvegardes](https://docs.convex.dev/database/backup-restore).

## Export local ou auto-hébergé

Depuis le checkout configuré pour la cible locale dans `.env.local` :

```sh
pnpm exec convex export --include-file-storage --path /private/tmp/boilerplate-snapshot.zip
unzip -l /private/tmp/boilerplate-snapshot.zip
```

Choisir un nom de fichier encore absent. La seconde commande affiche uniquement l’inventaire : vérifier la présence des tables applicatives et des tables du composant d’auth. Ne pas lire ni publier leurs contenus. Si le composant n’est pas présent, cette archive est insuffisante ; résoudre le périmètre d’export avant de considérer la sauvegarde valide.

Chiffrer l’archive et la transférer sur un stockage indépendant du serveur, avec accès limité et durée de rétention définie. Elle peut contenir des tokens de session et données personnelles. Le fichier temporaire n’est qu’une étape de transfert, pas une sauvegarde durable. [CLI export](https://docs.convex.dev/cli/reference/export).

## Convex Cloud

Utiliser les snapshots du dashboard, ou l’export CLI en sélectionnant explicitement le déploiement. Conserver une copie hors plateforme lorsque le besoin le demande. Vérifier le périmètre et les règles de rétention de l’offre utilisée ; ne pas supposer que des snapshots automatiques existent sans configuration.

## Exercice de restauration

### Vérification locale automatisée

Après `pnpm setup`, avec Docker démarré, pnpm et `unzip` disponibles :

```sh
pnpm backup:verify
```

Le script accepte uniquement une source auto-hébergée locale explicitement configurée dans `.env.local`. Il exporte cette source avec ses composants et son stockage, crée un backend Docker neuf avec le même digest et un volume jetable, y déploie le code puis importe et réexporte les données. Il compare les documents canoniques, y compris les IDs et `_creationTime`, et les empreintes des fichiers présents. Le conteneur et le volume qu’il vient de créer sont ensuite supprimés ; la source et son volume sont conservés.

Les archives et le rapport restent dans `backups/<exécution>/`, ignoré par Git, avec répertoire privé et fichiers limités au propriétaire. Les archives contiennent potentiellement des tokens de session : ne pas les publier comme artefacts CI. Chiffrer et déplacer uniquement une copie destinée à une sauvegarde durable.

L’exercice exécuté le 12 octobre 2026 a restauré et comparé **17 tables**, incluant Better Auth. La suite navigateur prépare un compte, une ressource et une passkey réels, puis vérifie que ces tables contiennent des données dans le rapport. La source ne contenait aucun fichier : la restauration de stockage non vide reste à éprouver. Ce test ne prouve pas la reconnexion, la compatibilité des RP ID/passkeys, la conservation des variables/secrets, les tâches planifiées ni la durabilité hors serveur.

### Vérification fonctionnelle sur une cible choisie

1. Provisionner une cible isolée, vide, avec la version de backend et le commit correspondant à la sauvegarde. Ne pas écraser le backend de développement utilisé par une autre personne.
2. Restaurer sa configuration depuis le coffre. Adapter email et URLs à la cible de test, pour empêcher un envoi réel accidentel. Les secrets nécessaires au déchiffrement de l’auth doivent être disponibles.
3. Sélectionner cette cible explicitement dans la configuration CLI puis importer l’archive :

   ```sh
   pnpm exec convex import /private/tmp/boilerplate-snapshot.zip
   ```

4. Vérifier comptes, nombre de ressources, relations et propriété avec un échantillon fictif connu. Vérifier une reconnexion email, l’isolation des comptes et la révocation. La connexion avec une passkey existante exige un environnement compatible avec son RP ID ; une origine de staging arbitraire ne suffit pas.
5. Réconcilier les tâches différées et nettoyer les sessions/OTP restaurés si leur réactivation n’est pas souhaitée. Enregistrer la date, la durée et le résultat de l’exercice.

Pour une cible déjà remplie, `--replace` remplace les tables importées et `--replace-all` peut supprimer/vider d’autres tables. Ces opérations sont destructrices : faire une sauvegarde supplémentaire, identifier la cible et obtenir l’autorisation applicable avant de les exécuter. Le runbook ne les utilise pas par défaut. [CLI import](https://docs.convex.dev/cli/reference/import).

## Sauvegarde physique auto-hébergée

Une copie à froid du volume Docker complète les exports logiques. Arrêter proprement le backend avant de copier son volume, inclure la base et les fichiers de stockage, puis redémarrer. Ne pas copier uniquement le fichier SQLite pendant les écritures. Tester la récupération du volume avec la même version de backend avant toute montée de version.

Ne jamais utiliser `docker compose down -v` comme arrêt courant : cette option supprime les volumes persistants. Le socle ne programme pas encore de sauvegarde de production ; fréquence, rétention et objectifs de perte/durée de récupération appartiennent à l’environnement déployé.
