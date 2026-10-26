# Modèle d’accès

Mode personnel, conformément au [PRD](../../PRD.md). Chaque MJ possède ses projets, dossiers, Screens, contenus, variables et fichiers via son ID stable Better Auth. Aucun besoin d’organisations. `ORGANIZATIONS_ENABLED` reste absent ou `false` côté Convex.

Chaque fonction métier valide une session vivante avec les helpers du socle, puis la propriété. Les relations doivent appartenir au même projet et au même propriétaire. Le client ne fournit jamais une identité faisant autorité. Un ID étranger ne permet ni lecture, mutation, export ou accès fichier.

La communauté utilise des snapshots explicitement confirmés et accessibles aux comptes connectés. L’auteur peut modifier sa publication ; chaque import produit une copie indépendante. Modération et administration sont des droits distincts ; le rôle admin ne crée pas un droit générique de lecture des projets privés.

Chaque table personnelle doit entrer dans l’export paginé, le nettoyage borné et la fixture de restauration. La fermeture du compte bloque immédiatement les accès puis crée une demande durable de nettoyage. Suppressions courantes via corbeille ; archivage distinct. La conservation des publications/commentaires après fermeture demandera une décision explicite avant ce domaine.

Pas de facturation à implémenter. Quotas par compte. La synchronisation entre fenêtres/appareils d’un compte repose sur Convex et ne crée pas de collaboration entre comptes.

Preuves : accès propriétaire accepté ; accès anonyme/tiers et session révoquée refusés ; références étrangères refusées ; export et nettoyage complets du domaine. Aucun module organisations à activer pour ce parcours.
