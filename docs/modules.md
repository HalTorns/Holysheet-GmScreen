# Modules optionnels

Le module organisations est intégré et désactivé par défaut. Les autres modules ci-dessous ne sont pas installés. Les ajouter lorsque le produit possède un parcours réel et des exigences définies ; garder les interfaces métier dans le projet et le code fournisseur à sa frontière.

## Organisations et permissions

Commencer par [choisir le modèle d’accès](project-start.md) : la propriété collective et les droits d’équipe motivent ce module. Un abonnement individuel peut rester en mode personnel.

Le socle conserve un espace personnel et propose des organisations optionnelles, avec memberships, invitations à expiration et rôles explicites. Activer le module via le backend, puis définir les permissions du premier domaine partagé. Chaque accès vérifie une membership active ; le client peut proposer un `organizationId` mais ne décide pas du tenant autorisé. Lire [Organisations et rôles](organizations.md).

Le schéma Better Auth Organization utilise Local Install ; les opérations applicatives restent transactionnelles dans Convex et les routes natives du plugin sont fermées pour conserver une seule frontière d’autorisation. SSO reste incompatible. [Compatibilité officielle](https://labs.convex.dev/better-auth/supported-plugins).

## Paiements

Ajouter un adaptateur Stripe, Polar ou autre selon pays, facturation et besoin produit. Les droits payants dérivent des événements fournisseur validés côté serveur, pas de la page de succès. Stocker les identifiants d’événements pour l’idempotence, gérer ordre des événements, renouvellement, suspension et remboursement. Les montants et produits sont définis côté serveur. Prévoir une commande de réconciliation avec le fournisseur.

## Fichiers et R2

Commencer par le stockage Convex si ses contraintes conviennent. R2 devient utile selon volume, distribution et politique de stockage. Le module doit associer chaque objet à son propriétaire/tenant, vérifier quota et taille, produire des URLs à durée bornée et nettoyer les objets orphelins. Une URL présignée ne remplace pas le contrôle d’accès à sa création. Ajouter inspection de contenu et analyse antivirale selon les types acceptés.

## IA

Placer les appels modèles et outils côté serveur avec clé dédiée, budgets par utilisateur et délais. Traiter documents, pages et réponses d’outils comme données non fiables. Les actions d’un agent doivent revalider les droits de l’utilisateur, borner leurs effets et demander une approbation si nécessaire. Définir la rétention, l’anonymisation, le choix du fournisseur et l’observabilité sans enregistrer de secrets dans les prompts.

## Observabilité et emails avancés

Brancher un outil d’erreurs lorsque l’environnement cible est choisi, avec masquage de PII, cookies et tokens. Définir logs structurés, identifiant de corrélation et alertes de panne email/auth. Resend est l’adaptateur transactionnel du socle en production ; files de travail, templates marketing et analytics sont des besoins séparés. Vérifier le domaine expéditeur et les politiques DNS du fournisseur avant l’ouverture publique.

## Règle d’ajout

Pour chaque module : noter le besoin, les données, droits, quotas, secrets, récupération et coût ; implémenter un premier parcours de bout en bout ; ajouter la preuve du refus/échec significatif ; mettre à jour les procédures de déploiement et sauvegarde.

Pour des données personnelles, intégrer explicitement le module à l’export et au nettoyage après suppression du compte. Le [guide d’adoption](adopting.md#export-suppression-et-sauvegarde) liste les fichiers et contrats concernés ; ajouter une table seule ne met pas ces opérations à jour.
