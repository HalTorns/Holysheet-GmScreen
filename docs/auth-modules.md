# Authentification optionnelle

L’administration applicative et les pseudos sont intégrés par défaut ; voir [Comptes et formulaires](accounts.md). Le défaut d’authentification reste code email + passkeys privées, sans organisations, fournisseur social, MFA imposée ni administration de plateforme. Les sessions et les secrets chiffrés Better Auth restent dans Convex. Les plugins installés stabilisent le schéma ; les variables privées décident de l’ouverture des endpoints et de l’interface. Désactiver un module ne supprime aucune table.

## Activer les modules

Configurer les variables dans le dashboard Convex ou avec sa CLI sur la cible explicitement choisie. Pour ce checkout local : `pnpm exec convex env set AUTH_MFA_ENABLED true --env-file .env.local`. Ne jamais mettre les secrets suivants dans `VITE_*`.

| Module | Variables backend | Comportement |
| --- | --- | --- |
| Liens email | `AUTH_MAGIC_LINK_ENABLED=true` | Lien stocké sous forme hachée, valable cinq minutes, usage unique ; quota destinataire partagé avec les codes email |
| Email/mot de passe | `AUTH_CREDENTIALS_ENABLED=true` | Connexion credentials optionnelle ; email vérifié requis ; OTP et passkeys restent disponibles |
| MFA | `AUTH_MFA_ENABLED=true` | Enrôlement TOTP sans mot de passe, confirmation cryptographique, codes de récupération à usage unique |
| Google | `AUTH_GOOGLE_ENABLED=true`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Callback exact `SITE_URL/api/auth/callback/google` |
| GitHub | `AUTH_GITHUB_ENABLED=true`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Callback exact `SITE_URL/api/auth/callback/github` |
| Support admin | `AUTH_ADMIN_ENABLED=true`, `ADMIN_USER_IDS` | Liste explicite d’IDs stables, maximum 20 ; MFA enrôlée et session vérifiée récemment requises |

Les identifiants sont ceux du composant Better Auth, visibles dans le dashboard local. Ne pas déléguer l’administration de plateforme depuis un rôle d’organisation. Le support est accessible sur `/app/admin`, uniquement aux opérateurs autorisés ; la navigation affiche ce lien à ces comptes.

## Email et mot de passe optionnels

Le flag privé `AUTH_CREDENTIALS_ENABLED` active `emailAndPassword` et affiche le formulaire de connexion correspondant. Absent ou `false`, le socle reste passwordless. Il n’impose aucune fermeture des inscriptions : la politique produit existante reste à définir dans le projet consommateur. Le compte doit avoir un email vérifié pour accéder aux données, comme avec les autres méthodes. Le socle ne fournit pas de parcours UI de création/récupération de mot de passe ; les endpoints Better Auth activés et le parcours OTP restent soumis à leurs contrôles serveur. Ne pas activer ce module sans prévoir le provisionnement des credentials pour le produit.

Pour un compte possédant un credential, l’enrôlement, la désactivation et les autres endpoints de gestion MFA du plugin exigent le mot de passe actuel **en plus** de la preuve d’identité liée à l’opération. L’interface reçoit uniquement `hasPassword` et affiche un champ de mot de passe ; aucun hash n’est retourné. Les secrets d’enrôlement restent limités au parcours existant.

Better Auth **1.6.22** intercepte normalement `/sign-in/email`, supprime la session primaire et crée son propre cookie de challenge. Le socle utilise une session primaire en attente pour toutes les méthodes : `sessionBoundTwoFactor` adapte uniquement le matcher de ce hook pour `/sign-in/email`. Les endpoints de vérification, contrôles de mot de passe, quotas et schéma du plugin sont conservés. Les gardes Convex interdisent lectures et écritures privées jusqu’à l’assurance liée à la session et à l’ID du facteur réellement vérifié. Le challenge natif sans session et les appareils de confiance ne sont pas ouverts.

La session précédente reste restaurable après abandon ; une MFA réussie la remplace sans transférer son assurance. Cette adaptation est dépendante de la version : revoir le hook upstream et rejouer les E2E credentials à chaque mise à jour de Better Auth. Voir aussi [les contraintes de mise à jour](upgrades.md).

## MFA et récupération

La section Compte fournit une clé manuelle à ajouter comme TOTP dans un authentificateur. Enregistrer les codes de récupération dans un emplacement privé. Secrets/codes restent dans l’état local du composant pendant l’enrôlement et ne sont jamais persistés dans le navigateur, envoyés aux analytics ou inclus dans l’export de compte.

Une activation protège aussi les sessions déjà ouvertes. Après OTP, credentials, passkey ou fournisseur social, une session sans preuve de son second facteur est dirigée vers `/verify-mfa` et les données métier restent refusées côté Convex. Chaque session possède une assurance liée à l’ID du facteur vérifié ; une rotation concurrente ne peut attribuer une preuve ancienne au nouveau facteur. Une rafale maximale de cinq essais, renouvelée à raison d’un essai par minute et par utilisateur, limite les tentatives, y compris ceux effectués depuis plusieurs sessions.

Les endpoints OTP de second facteur, lecture des codes de récupération et trust-device sont fermés. La désactivation globale du module cache l’enrôlement mais ne libère pas les comptes déjà protégés : TOTP/récupération restent vérifiables. Perdre le facteur et tous les codes nécessite une procédure opérateur spécifique au produit ; ne pas créer un contournement par email.

## Liens et fournisseurs sociaux

Un lien email transporte uniquement son jeton de vérification à usage unique dans l’URL, jamais un cookie de session ou JWT. Ne pas conserver cette URL dans les logs, rapports ou analytics. Le callback termine sur une URL sans jeton. Les protections d’origines et CSRF demeurent actives.

Les access/refresh tokens OAuth sont chiffrés avec le secret Better Auth. Les endpoints de lecture/rafraîchissement de tokens et de rattachement natif de comptes sont fermés. Le rattachement automatique de comptes par email est désactivé. Un compte initialement créé par OTP ne peut pas ajouter implicitement Google/GitHub ; un compte social ne peut pas ajouter implicitement un second fournisseur. Un produit qui veut le rattachement doit ajouter un parcours explicite avec authentification récente, vérification des deux identités et tests adaptés. Les secrets OAuth restent côté Convex et les URLs de callback doivent être enregistrées dans chaque fournisseur, avec des projets distincts pour local/preview/production.

## Support et audit

L’opérateur recherche un compte par ID exact, confirme l’accès puis reçoit une session de support en lecture seule. Elle expire après cinq minutes, dépend de la session d’origine et de sa MFA, et est invalidée si l’opérateur est retiré de la liste ou si le module est fermé. Le refresh natif d’une session ne prolonge jamais le délai indépendant du lien de support. Mutations, actions, changement de facteur et exports sensibles restent refusés pendant le support.

Le bandeau permet de revenir au compte d’origine en rechargeant les clients et caches. Les événements MFA et accès support sont conservés 30 jours sans jeton, secret ni contenu métier. L’export personnel inclut les métadonnées des événements comme acteur et comme compte ciblé, sans identité d’un tiers. Le nettoyage de compte efface les facteurs, assurances, liens et audits par lots ; les sauvegardes transportent ces tables et exigent la conservation du secret Better Auth pour leur déchiffrement.

## Vérifier ou retirer

`pnpm test:e2e:local modules` ouvre temporairement les modules sur le backend local, exerce credentials, Mailpit/TOTP/récupération/support/restauration puis rétablit les variables initiales. Les tests ne publient aucun endpoint de seed et utilisent la CLI opérateur gardée pour autoriser leur administrateur temporaire.

Pour un produit sans ces fonctionnalités, laisser les flags absents. Pour retirer physiquement un plugin, planifier les comptes protégés et leurs données, retirer le client/UI associé, modifier les options serveur puis régénérer le schéma et examiner le diff. Ne pas retirer le garde MFA tant que des comptes enrôlés existent.
