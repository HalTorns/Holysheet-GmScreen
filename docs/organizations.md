# Organisations et rôles optionnels

Le mode personnel reste le défaut. Les comptes existants, leurs sessions et leurs ressources personnelles conservent leur comportement. Le module ajoute des espaces partagés indépendants : un compte peut garder son espace personnel et appartenir à plusieurs organisations.

## Activation

Le schéma organisations Better Auth est toujours déployé dans le composant Local Install. L’activation ne demande ni migration des comptes ni changement de schéma. La variable **du backend Convex** `ORGANIZATIONS_ENABLED` accepte seulement `true` et `false`. Absente, elle vaut `false` ; une valeur invalide provoque un refus de configuration.

Dans le backend local du checkout :

```sh
pnpm exec convex env set ORGANIZATIONS_ENABLED true --env-file .env.local
```

Recharger l’application : le lien Organisations apparaît dans l’espace authentifié. Le frontend lit `capabilities.get` ; aucun `VITE_*` ni paramètre de navigation n’autorise une opération.

Pour revenir au mode personnel :

```sh
pnpm exec convex env set ORGANIZATIONS_ENABLED false --env-file .env.local
```

La désactivation ferme les opérations et lectures partagées, mais conserve les organisations et leurs données. Elle ne convertit pas les ressources partagées en données personnelles. L’export de compte conserve les appartenances existantes et la protection du dernier propriétaire reste active à la suppression du compte. Organiser les transferts ou suppressions avant de désactiver durablement un produit déjà utilisé en équipe.

En cloud/staging/production, configurer cette variable sur la cible voulue, avec les mêmes règles de séparation des environnements que l’auth. Le setup local ne modifie pas la configuration d’un déploiement distant.

## Permissions

Les propriétaires et administrateurs peuvent également renommer l’organisation sans changer son identifiant ni ses permissions.

| Opération | Propriétaire | Administrateur | Membre | Lecteur |
| --- | --- | --- | --- | --- |
| Lire les ressources communes | Oui | Oui | Oui | Oui |
| Créer, modifier et supprimer les ressources communes | Oui | Oui | Oui | Non |
| Inviter un membre ou lecteur | Oui | Oui | Non | Non |
| Inviter un administrateur | Oui | Non | Non | Non |
| Modifier ou retirer un membre/lecteur | Oui | Oui | Non | Non |
| Modifier les propriétaires et administrateurs | Oui | Non | Non | Non |
| Exporter les ressources de l’organisation | Oui | Oui | Non | Non |
| Supprimer l’organisation | Oui | Non | Non | Non |
| Quitter l’organisation | Oui, si un autre propriétaire reste | Oui | Oui | Oui |

Les noms des membres sont visibles dans l’organisation ; les adresses email des autres membres et invitations ne sont exposées qu’aux propriétaires/administrateurs. Les invitations n’accordent pas directement le rôle propriétaire : promouvoir un membre existant après acceptation et vérification de son email.

La création, la gestion des invitations/rôles/membres et l’export partagé demandent une session valide sans limite de cinq minutes. La suppression consomme une confirmation d’identité à usage unique liée à la session et à cette organisation ; le propriétaire confirme depuis le dialogue sans perdre sa saisie. Les écritures d’organisation ont un quota par compte ; les ressources gardent leur quota existant. Le socle borne à 20 organisations par compte, 100 membres et 100 invitations par organisation, et 10 invitations en attente par destinataire. Les constantes et libellés sont dans `shared/organizations.ts` ; les vérifications effectives restent côté Convex.

## Invitations

Un gestionnaire saisit une adresse et un rôle. L’invitation apparaît dans l’espace Organisations du destinataire après connexion avec **cette adresse vérifiée**. Elle expire après sept jours, peut être refusée ou annulée et se consomme atomiquement une seule fois, même sous concurrence.

Le module ne déclenche aucun email d’invitation. Un produit peut ajouter un envoi transactionnel dans une action après commit, avec quota, reprise et contrôle de l’invitation encore active. Le parcours d’authentification email du socle reste indépendant.

Inviter un membre déjà présent est refusé (`ALREADY_MEMBER`) : changer son rôle passe par l’opération de gestion des membres, avec les contrôles du dernier propriétaire.

L’acceptation revalide les droits actuels de l’invitant. Retirer un gestionnaire ou réduire sa délégation supprime atomiquement les invitations qu’il n’est plus autorisé à émettre ; elles ne renaissent pas s’il retrouve son rôle. Passer de propriétaire à administrateur révoque ses invitations d’administrateur et conserve celles de membre/lecteur. Modifier le rôle d’un membre ou le retirer révoque aussi les anciennes invitations qui lui étaient destinées dans cette organisation, pour empêcher une réadhésion restaurant des droits retirés. Une nouvelle invitation explicite reste possible après son départ. Les invitations et rôles ne proviennent jamais d’un booléen ou d’un rôle fourni dans la session navigateur.

## Frontières et données

- `convex/betterAuth/organizations.ts` gère les tables Better Auth `organization`, `member`, `invitation` dans des transactions Convex. `organizationAccess.ts` porte les invariants de membership et de dernier propriétaire.
- `convex/organizations.ts` expose les opérations applicatives après validation de la session, activation, quotas et permissions courantes ; la suppression exige une preuve d’identité liée à son opération.
- Les routes HTTP natives `/api/auth/organization/*` sont volontairement fermées, y compris lorsque le module est activé. Utiliser l’API Convex du projet ; ajouter `organizationClient()` ne crée pas un deuxième chemin autorisé.
- `resources.organizationId` définit l’espace partagé. Sans ce champ, l’accès reste personnel. Le serveur valide chaque organisation demandée et chaque rôle courant ; `session.activeOrganizationId` n’est pas une autorité.
- `resources.by_owner` inclut le scope pour paginer seulement les ressources personnelles ; `by_organization` sert les ressources communes. Les anciennes ressources sans champ supplémentaire restent personnelles.

Le compte exporte son profil, ses ressources personnelles, ses appartenances et invitations reçues. L’export d’une organisation est distinct et réservé aux gestionnaires : une appartenance ne donne pas la propriété personnelle de toutes les données partagées.

La suppression d’un compte retire ses memberships atomiquement, en protégeant chaque dernier propriétaire. Ses ressources personnelles sont supprimées ; les ressources communes sont conservées et l’identifiant de leur auteur anonymisé. Les invitations émises/reçues sont nettoyées par lots. La suppression d’une organisation ferme l’accès dès la transaction initiale, puis nettoie membres, invitations, ressources et événements associés par lots bornés.

Ces suppressions créent une demande durable `cleanupJobs` dans la transaction initiale. Le cron reprend les demandes inachevées après perte des tâches planifiées, notamment après une restauration logique ; la demande est retirée à la fin du nettoyage. Voir [le contrat de restauration](backup-restore.md#ce-qui-doit-être-récupérable).

## Tests et adaptation

```sh
pnpm backend:push
pnpm check
pnpm test:e2e
pnpm test:e2e:organizations
```

`test:e2e:organizations` refuse une cible distante, active temporairement le module local et restaure sa valeur précédente dans `finally`, y compris en cas d’échec des tests. Comme pour les E2E personnels, le mode production utilise `PLAYWRIGHT_PRODUCTION=1` après build, avec le serveur dev arrêté.

Le lanceur vérifie l’identité Docker et la propriété du checkout avant tout appel Convex. `pnpm test:e2e` sélectionne le parcours personnel ou partagé à partir des capacités réelles du backend ; il reste utilisable après activation du module dans un projet SaaS.

Pour la suite entière avec activation temporaire, utiliser `PLAYWRIGHT_PRODUCTION=1 pnpm test:e2e:organizations --all`. La CI lance cette commande dans son job Organisations, et la suite personnelle dans un autre runner isolé. `PLAYWRIGHT_EXPECT_ORGANIZATIONS=true|false` appartient uniquement aux tests et vérifie le mode backend attendu ; il n’accorde aucune permission.

Les tests backend possèdent les invariants de membership, permissions, concurrence, dernier propriétaire, anonymisation et nettoyage par lots. Les E2E possèdent les parcours personnels/partagés, invitations par email vérifié, changements de rôle en temps réel, révocation avec un JWT déjà émis, export et refus des routes natives. Les fixtures de restauration doivent contenir des organisations, memberships et ressources partagées lorsque ce module est utilisé.

Pour un nouveau domaine SaaS, ajouter l’index de tenant et appeler `requireOrganizationPermission` dans **chaque** accès. Définir ses permissions, export et nettoyage avant le premier appel public. Ne pas transformer un `organizationId` de formulaire ou de route en preuve d’autorisation. Le [guide d’adoption](adopting.md) décrit l’ajout d’un domaine et les migrations.
