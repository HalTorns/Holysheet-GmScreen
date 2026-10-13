# Partir de ce socle pour un projet

Le parcours ressources sert d’exemple complet : formulaire, pagination, accès privé, persistance, export et suppression. Le remplacer par le premier domaine du produit permet de conserver les conventions déjà vérifiées sans imposer un modèle métier universel.

## Identité et configuration

| Besoin                                                          | Point de modification                                     |
| --------------------------------------------------------------- | --------------------------------------------------------- |
| Nom, marque, description, titres, nom affiché pour les passkeys | `shared/app-config.ts`                                    |
| Format des dates et fuseau partagé SSR/navigateur               | `shared/app-config.ts` : `locale`, `timeZone`             |
| Navigation privée                                               | `src/config/navigation.ts`                                |
| Pages et textes du produit                                      | `src/routes/`, `src/features/`                            |
| Couleurs, rayons et polices                                     | Tokens de `src/styles.css`                                |
| Logo et favicon                                                 | `src/components/brand.tsx`, `public/favicon.svg`          |
| Origines, secrets et fournisseur email                          | Variables de l’environnement cible : `docs/deployment.md` |

`appConfig` est public, versionné et partagé entre le frontend et Convex. Il contient une identité de présentation ; ne pas y ajouter de secrets, de permissions ou de réglages permettant de désactiver les protections d’authentification. Modifier son nom nécessite de reconstruire le frontend et de déployer les fonctions backend pour garder les deux affichages cohérents.

Le nom affiché d’une passkey (`rpName`) suit le nom du produit. Son `PASSKEY_RP_ID` reste une configuration de sécurité séparée et stable : renommer le produit ne change pas le domaine auquel les identifiants WebAuthn sont liés. Une modification de domaine/RP ID demande un parcours de migration explicite ; elle ne se résout pas avec un renommage de marque.

Les écrans restent écrits en français. `locale` configure les dates et `language` la langue du document ; ces champs ne traduisent pas les libellés ni les erreurs. Pour une application multilingue, introduire des messages traduits et des tests du parcours avant de modifier la langue déclarée. Un fuseau explicite conserve le même rendu des dates sur le serveur et dans le navigateur.

## Démarrage d’un nouveau produit

Suivre [la procédure template privé](new-project.md) pour créer le dépôt, initialiser des secrets et données indépendants et ouvrir les services de développement dans OrbStack.

Avant le premier domaine, suivre [le guide de choix du modèle d’accès](project-start.md). Le développeur ou l’agent recommande le mode à partir de la propriété individuelle ou collective des données, puis consigne le choix et ses preuves dans `docs/decisions/access-model.md` du nouveau projet. Un SaaS sans espace d’équipe conserve le mode personnel ; les organisations servent les invitations, rôles par équipe et données qui survivent au départ de leur créateur.

Créer un dépôt et des environnements dédiés à partir des fichiers versionnés du socle. Les `.env.local`, `.env.docker`, volumes Docker et archives de sauvegarde appartiennent au projet d’origine ; ne pas les copier dans le nouveau produit. Exécuter `pnpm install --frozen-lockfile` et `pnpm setup` dans son checkout, puis adapter l’identité publique.

Chaque checkout possède une identité Compose locale persistée dans `.env.docker` et un volume dédié. Le setup refuse une configuration copiée d’un autre emplacement et ne récupère pas les données d’un autre projet. Les ports locaux restent fixes (`3000`, `3210`, `3211`, `6791`, `8025`) : un seul projet issu du socle peut les occuper à la fois. Pour passer au suivant, arrêter le frontend et utiliser `pnpm services:down` dans le projet actif, qui conserve ses données, avant le setup du nouveau checkout. Des environnements simultanés demandent une configuration explicite et cohérente de leurs ports et origines.

Avant le premier domaine partagé, décider quelles données restent personnelles et lesquelles sont rattachées à une organisation. Le module [organisations et rôles](organizations.md) est intégré et désactivé par défaut. Les ressources de référence illustrent les deux scopes ; appliquer `requireOrganizationPermission` et un index de tenant à chaque nouveau domaine partagé. Ajouter seulement un `organizationId` au formulaire ou un lien dans la navigation ne crée pas de contrôle d’accès.

Noter une décision courte lorsque le produit change une frontière : besoin, solution retenue, alternatives écartées, droits, limites, effets sur les données et preuve attendue. Conserver ces décisions près de l’architecture du projet.

## Ajouter une fonctionnalité complète

1. Définir ses données, leur propriétaire, leur durée de conservation et le comportement observable. Identifier les utilisateurs autorisés et les refus à prouver.
2. Ajouter les tables et indexes dans `convex/schema.ts`. Définir des limites de taille, de pagination et de débit avant les appels coûteux.
3. Placer les queries/mutations dans `convex/<domaine>.ts` et les règles spécifiques dans `convex/lib/<domaine>.ts`. Appeler `requireUser` ou `requireRecentUser` depuis `convex/lib/auth.ts`, puis contrôler le propriétaire ou les permissions de chaque ressource. Calculer le propriétaire depuis la session ; ne pas accepter un propriétaire client comme autorité.
4. Définir les validateurs Convex des arguments et retours. Si le formulaire partage des contraintes, créer son schéma dans `shared/` avec `z` importé depuis `@shared/zod`. Garder les contrôles backend même si le formulaire valide déjà.
5. Créer l’interface dans `src/features/<domaine>/`. Réutiliser les composants UI et les états chargement, erreur, vide et succès. Conserver les données serveur dans Convex/TanStack Query, sans copie locale servant de deuxième cache.
6. Ajouter la route dans `src/routes/` puis son lien dans `src/config/navigation.ts`. `linkOptions` vérifie les destinations contre l’arbre généré ; laisser TanStack générer `src/routeTree.gen.ts`. Un lien visible ou caché est une décision d’interface, jamais une permission backend.
7. Mettre à jour le cycle de vie des données décrit ci-dessous. Brancher les intégrations externes dans des actions avec délais, idempotence et quotas ; garder les fonctions internes privées.
8. Vérifier un cas autorisé et un refus significatif au point d’entrée Convex. Ajouter un E2E lorsque la fonctionnalité introduit un risque de transport ou de parcours absent des tests existants. Exécuter les contrôles adaptés et actualiser les procédures de déploiement/restauration.

## Export, suppression et sauvegarde

Chaque nouveau domaine personnel doit être intégré aux opérations de compte. Les tables ne sont pas découvertes et supprimées automatiquement : un domaine partagé ou une donnée à conserver demande une règle métier explicite.

| Contrat                               | Code à examiner lors de l’ajout ou du remplacement d’un domaine                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Export de ses propres données         | `convex/account.ts`, validateurs dans `convex/lib/validators.ts`, collecte et fichier dans `src/features/account/data-section.tsx` |
| Suppression après fermeture du compte | `convex/cleanup.ts` : index par propriétaire, lots bornés et reprise planifiée jusqu’à la fin                                      |
| Accès refusé dès la suppression       | `convex/lib/auth.ts`, `convex/account.ts` : invalider l’utilisateur/session avant le nettoyage asynchrone                          |
| Effets externes et objets stockés     | Actions de nettoyage du domaine, droit sur les objets, idempotence, reprise des échecs                                             |
| Preuves d’isolation et de nettoyage   | `tests/backend/account.test.ts`, tests du domaine, parcours E2E d’export/suppression                                               |
| Restauration du schéma et des données | `scripts/verify-restore.mjs`, `tests/e2e/restore.spec.ts`, `docs/backup-restore.md`                                                |

L’export actuel pagine les ressources. Avec plusieurs domaines, chaque collection doit avoir sa pagination et sa progression ; ne pas charger toutes les tables dans une seule query. Pour un volume important, prévoir un export en tâche bornée avec téléchargement privé plutôt qu’une accumulation illimitée dans le navigateur.

La suppression du compte ferme l’accès immédiatement puis nettoie les données par lots. Ajouter le nouveau domaine aux lots, gérer ses effets externes et tester un utilisateur dépassant la taille d’un lot. Pour des données partagées, décider explicitement du transfert, de l’anonymisation ou de la conservation et refléter ce choix dans le texte de confirmation. La suppression de l’auth seule ne supprime pas les tables applicatives.

Une sauvegarde n’est pas un export utilisateur. Le test de restauration doit contenir des données représentatives du domaine et vérifier leur présence après import, tout en préservant les secrets et la source. Ajouter un fichier non vide à cet exercice si le produit utilise du stockage ; le socle ne prouve actuellement que les tables et les fichiers effectivement présents dans le snapshot.

## Remplacer la démonstration ressources

Introduire le nouveau domaine avec ses contrôles et tests avant de retirer l’exemple. Remplacer le contenu de `src/routes/_authenticated/app/index.tsx`, le lien de navigation et les textes de la landing/connexion par les parcours réels du produit.

Examiner ensuite toutes les dépendances de `resources` : `src/features/resources/`, `shared/validation.ts`, `convex/resources.ts`, `convex/lib/resources.ts`, `convex/lib/validators.ts`, `convex/schema.ts`, les événements de sécurité, l’export de compte, le nettoyage et les fixtures de tests. Retirer les références devenues inutiles, puis régénérer les types avec `pnpm backend:push`. Ne pas modifier les fichiers générés à la main.

Adapter les tests CRUD et les fixtures de restauration au nouveau domaine en conservant les contrats transverses : SSR privé, connexion email/passkey, refus entre comptes, révocation, export et fermeture d’accès. Le remplacement de l’exemple ne doit pas supprimer les preuves de sécurité du socle.

Si des données réelles existent déjà, un changement de table ou de champ demande une migration par étapes : introduire la nouvelle structure, migrer avec opérations bornées, vérifier les résultats, adapter les lecteurs puis retirer l’ancienne structure après sauvegarde. Ne pas réinitialiser le volume pour contourner cette étape.

## Modules selon les besoins

Les organisations, paiements, stockage avancé et IA restent des ajouts conditionnés par le produit. Lire `docs/modules.md`, définir les frontières et réaliser un premier parcours complet avant d’ajouter une couche générique. Le modèle d’organisation et la supervision de production sont les premiers choix à préciser pour une application partagée ou ouverte au public.
