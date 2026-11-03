# Plan — Chantier 3a-2 : menus des pages du projet

Suite de [PLAN-UX3a](PLAN-UX3a.md) et de [l’ADR interaction](decisions/editor-ux.md) : même grammaire (＋ pour créer, ⋯ pour les actions d’un élément, états toujours visibles), appliquée aux pages hors Screen. Demande de l’utilisateur : réduire la densité de boutons. Aucune modification Convex, l’identité visuelle (3b) reste hors périmètre.

## Constat

- **Page projet** : deux panneaux latéraux de création toujours ouverts (dossier ; format + Screen), et les panneaux complets Fichiers et Widgets personnalisés déroulés au-dessus du contenu, avec 3 à 4 boutons par ligne.
- **Fichiers et widgets personnalisés** : chaque ligne affiche Renommer/Modifier, Placer, Corbeille, ou Restaurer et Purger, plus un bouton bascule pour la corbeille.
- **Bibliothèque** : le formulaire de création est toujours ouvert ; chaque fiche en corbeille montre Restaurer et Effacer définitivement.
- **Variables** : le formulaire de création est toujours ouvert ; chaque ligne affiche Enregistrer, même sans modification, et Supprimer.
- **Fiche** : Mettre à la corbeille à côté d’Enregistrer.
- **Stock du marchand** : Monter, Descendre et Retirer sur chaque ligne.

## Décisions

1. **Navigation du projet** : un composant `ProjectNav`, sous forme de barre d’onglets (liens) — Screens · Fiches · Variables —, partagé par les trois pages du projet. Il remplace « Bibliothèque de fiches → » et « Variables → ». Le lien de retour ne change pas.
2. **Page projet** :
   - en-tête : titre, **＋ Nouveau** (menu : Dossier…, Screen…) et **⚙ Ressources** (menu : Fichiers du projet…, Widgets personnalisés…) ;
   - « Dossier… » et « Screen… » ouvrent un dialogue. Le dialogue Screen porte le sélecteur de format puis le titre ; ils reprennent `TitleForm` et ses libellés actuels (« Créer un dossier », « Créer un Screen », « Format initial du Screen ») ;
   - **Fichiers** et **Widgets personnalisés** passent dans un `SidePanel` (à gauche), comme sur le Screen ;
   - le panneau Widgets personnalisés reste **monté** une fois fermé (`keepMounted`, contenu masqué) : un brouillon de définition survit à la fermeture par Échap ou par la croix, sur le projet comme sur le Screen (revue UX3A2-01). Un test navigateur le vérifie ;
   - la colonne latérale disparaît : le fil d’Ariane des dossiers, les dossiers puis les Screens occupent toute la largeur.
3. **Listes de fichiers et de widgets personnalisés** (mêmes composants sur le projet et sur le Screen) :
   - en tête : l’import (champ `Importer un fichier` conservé) ou « Créer un widget personnalisé », puis un contrôle segmenté **Actifs / Corbeille** qui remplace le bouton bascule ;
   - chaque ligne montre le nom et ses métadonnées, l’action principale quand elle existe (**Placer**, si la liste sert à placer), puis ⋯ ;
   - le menu ⋯ contient Renommer… ou Modifier, Mettre à la corbeille ; en corbeille, Restaurer et Purger… ;
   - Purger garde sa confirmation explicite.
4. **Bibliothèque** :
   - **＋ Nouvelle fiche** : un menu des types, puis un dialogue avec le titre (`TitleForm`) ;
   - recherche et filtre restent en ligne, car ce sont des outils d’usage, dans une barre unique avec **Actifs / Corbeille** ;
   - une fiche en corbeille : titre, type et ⋯ (Restaurer, Effacer définitivement…) ; l’effacement est confirmé dans un dialogue.
5. **Variables** :
   - **＋ Nouvelle variable** ouvre un dialogue avec le formulaire actuel ;
   - sur une ligne, **Enregistrer** n’apparaît que si la ligne est modifiée. En conflit, il reste visible mais désactivé, avec « Charger la version enregistrée » à côté (règle de 3a) ;
   - **Supprimer** passe dans ⋯, avec la confirmation existante ;
   - le tableau perd sa colonne « Actions » pleine : la dernière cellule contient Enregistrer (conditionnel) et ⋯.
6. **Fiche** :
   - **Mettre à la corbeille** passe dans un ⋯ de l’en-tête ;
   - Enregistrer la fiche reste visible (sauvegarde explicite), et « Charger la version enregistrée » reste affiché en cas de conflit ;
   - le profil objet et le stock du marchand restent en ligne.
7. **Stock du marchand** :
   - quantité, prix et disponibilité restent en ligne (usage) ;
   - Monter, Descendre et Retirer passent dans le ⋯ de chaque ligne ;
   - les ±1 du widget et l’enregistrement d’une ligne sont inchangés.
8. **Noms accessibles conservés** : chaque élément de menu reprend le libellé exact du bouton qu’il remplace (« Corbeille pixel.png », « Purger pixel.png », « Restaurer « X » », « Supprimer force », « Retirer Potion F7 »…). Le déclencheur ⋯ s’appelle « Actions de <nom> ». Les E2E passent par les helpers de `tests/e2e/editor-ui.ts`, étendus.
9. **Primitives** : `menu`, `side-panel` et `dialog` existants, sans dépendance nouvelle.

## Hors périmètre

- identité visuelle (3b) ;
- pages compte, sécurité et administration ;
- liste des projets (un seul formulaire) ;
- décalage des copies collées, côté serveur ;
- renommer ou supprimer des dossiers et des Screens, qui n’existent pas aujourd’hui.

## Critères d’acceptation

1. **Page projet, sans panneau ouvert** : au plus 8 contrôles interactifs hors des listes — retour, 3 onglets, ＋, ⚙, fil d’Ariane « Racine ». Aucun formulaire visible.
2. **Fichiers et widgets personnalisés** : au plus 2 contrôles par ligne (action principale et ⋯) ; chaque action précédente reste accessible, avec le même effet.
3. **Bibliothèque** et **variables** : aucun formulaire de création visible par défaut ; création possible par ＋ ; Enregistrer d’une variable visible seulement si elle est modifiée.
4. **Conflits et erreurs** : ils restent visibles en ligne.
5. **Clavier** : menus et dialogues sont opérables au clavier, et Échap rend le focus.
6. **Aucun changement serveur** : `git diff --stat main -- convex/ shared/` est vide.
7. **Vérifications** : `pnpm check` vert ; CI de branche verte, avec les E2E existants adaptés et un test navigateur de densité pour la page projet.

## Commandes de preuve

`pnpm check` · `git diff --stat main -- convex/ shared/` · CI de branche (E2E), puis avance rapide de `main`.
