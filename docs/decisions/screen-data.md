# Contenus et dispositions de Screen

## Besoin

Le [PRD](../../PRD.md) impose des dispositions numériques nommées et une disposition papier indépendante. Le même contenu doit rester cohérent dans chaque profil, dans les pop-ups et entre appareils du propriétaire.

## Modèle retenu pour le premier parcours

- Projet personnel : titre, propriétaire serveur, date de modification ; dossiers rattachés au projet avec parent optionnel.
- Screen : projet, dossier optionnel, titre. Le dossier et son éventuel parent doivent appartenir au même projet. Création de nouveaux dossiers uniquement sous un parent existant, avec profondeur bornée ; un déplacement futur devra vérifier les cycles.
- Profil de disposition : Screen, nom, destination numérique ou papier, dimensions et unité. Les millimètres des formats papier ne sont pas convertis en pixels comme source de vérité.
- Widget : Screen, catégorie, contenu et version de contenu. Le premier parcours se limite à une note texte simple ; les autres contrats restent à implémenter, dont texte enrichi et code isolé.
- Placement : widget et profil du même Screen, coordonnées, taille, calque et version distincte. Une modification de placement ne modifie pas le contenu.

Une sauvegarde de contenu transmet la version lue. En cas de concurrence, le serveur refuse avec `CONFLICT` ; l’interface garde le brouillon et permet de consulter la version distante. Une stratégie de fusion automatique de texte pourra être décidée ultérieurement. Aucun écrasement silencieux ni calcul métier fondé sur un horodatage client.

## Frontières à préserver

La validation Convex reste obligatoire indépendamment des schémas de formulaire. Requêtes paginées/indexées, limites explicites et transactions bornées. Chaque nouvelle table personnelle participe à l’export, au nettoyage du compte et à une fixture de restauration réelle avant livraison.

Le verrouillage de disposition laisse les widgets interactifs ; la lecture seule bloque les modifications. Ces modes d’interface ne remplacent jamais le contrôle de propriété serveur. La corbeille et l’archivage doivent être implémentés avant de proposer des suppressions courantes.

Le code personnalisé ne devra jamais accéder directement aux endpoints de données ou au DOM hôte. La définition de son protocole et de son origine isolée précédera son exécution. Aucun champ de code exécutable n’est nécessaire au premier widget note.

## État

Premier parcours implémenté dans cinq collections : `gmProjects`, `gmFolders`, `gmScreens`, `gmNotes`, `gmLayouts`. Le widget note simple possède une table spécialisée ; le contrat complet des douze catégories reste à construire. Les placements sont stockés dans un tableau borné du profil, avec références aux notes et version de disposition ; aucune table de placement supplémentaire n’est nécessaire à ce premier parcours.

Limites techniques initiales et réversibles : 100 notes par Screen, 8 profils maximum en lecture, 8 niveaux de dossiers, titres de 120 caractères et notes de 50 000 caractères. Listes/export par pages de 50 au plus. Écritures limitées par le budget existant `resourceWrite` (30/minute). La création produit deux profils : numérique et A4 paysage ; leur édition reste à implémenter.

La sauvegarde initiale des notes est explicite. Le brouillon est protégé à la navigation et conservé lors d’une modification distante ; un conflit ne peut pas écraser cette version. L’autosauvegarde et l’historique demeurent dans la phase éditeur.

La tranche suivante est décrite dans [la décision éditeur](screen-editor.md) : géométrie et profils numériques éditables, verrouillage partagé, sauvegarde automatique, annuler/refaire et historique borné dans `gmEditorHistory`. L’export, le nettoyage et les fixtures de restauration incluent cette sixième collection. Les limites et preuves de cette tranche remplacent l’état initial ci-dessus lorsqu’elle est livrée.
