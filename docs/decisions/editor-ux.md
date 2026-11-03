# Architecture d’interaction de l’éditeur de Screen (chantier 3a)

## Contexte

Demande de l’utilisateur du 3 novembre 2026 : l’éditeur affichait chaque action sous forme de bouton permanent, ce qui le rendait surchargé. Il veut des sous-menus. Plan revu : [PLAN-UX3a](../PLAN-UX3a.md). L’identité visuelle reste hors périmètre (3b). Aucun changement côté Convex : schéma, fonctions, droits et limites sont inchangés.

## Décisions

- **Trois modes locaux**, choisis par un seul contrôle segmenté :
  - **Édition** : le comportement antérieur ;
  - **Jeu** : la disposition, la configuration, l’ajout et la corbeille sont bloqués localement, en réutilisant les blocages du verrou sans l’écrire ; le contenu d’usage reste actif ;
  - **Lecture** : l’ancienne lecture seule, avec rendu statique et aucune mutation.

  Le verrou partagé (`layoutLocked`) passe dans ⚙. Le mode par défaut reste Édition.

- **En-tête du Screen** :
  - **＋ Ajouter** : note, widgets regroupés par familles, fichier, widget personnalisé ;
  - Annuler et Refaire en icônes, avec l’état de la disposition ;
  - **⚙** : profils (radio), dimensions, nouveau profil, verrou, sauvegarde automatique, grille, Aller au widget, historique, fichiers, widgets personnalisés, corbeille, raccourcis.

  Les dialogues existants (`RevisionHistory`, `LayoutSettings`, la corbeille) acceptent une ouverture pilotée sans bouton déclencheur.

- **Widgets** :
  - en Édition, un en-tête porte la poignée, ⚙ (« Configurer ») et ⋯ (« Plus d’actions »), visibles sur le widget actif ou sélectionné, au survol et au focus ;
  - le menu ⋯ et le clic droit ont le même contenu ; Maj+F10 et la touche Menu l’ouvrent depuis la poignée ;
  - en Jeu et en Lecture, il n’y a ni en-tête ni poignée.
- **Configuration téléportée** :
  - chaque widget enveloppe ses formulaires de configuration dans `WidgetConfig`, qui les rend dans l’onglet Contenu de l’inspecteur (`createPortal`) quand l’inspecteur vise ce widget, sinon nulle part ;
  - hors éditeur (tests, autres pages), la configuration reste en ligne ;
  - le brouillon vit dans le widget lui-même : fermer l’inspecteur ou changer de widget ne détruit aucun brouillon.
- **États toujours visibles** : conflits, erreurs, statut et « non configuré » restent dans le corps du widget.
- **Enregistrer (`SaveControl`)** :
  - visible si la sauvegarde automatique est coupée et qu’un brouillon existe ;
  - devient « Réessayer l’enregistrement » après un échec sans conflit, sauvegarde automatique comprise ;
  - reste visible mais désactivé en cas de conflit, car le hook et le serveur refusent toute version périmée.
- **Inspecteur latéral** non modal, en feuille basse sous 768 px, avec trois onglets :
  - **Contenu** ;
  - **Style**, qui seul s’applique à une sélection multiple ;
  - **Position**, qui remplace les blocs « Coordonnées » et « Note sélectionnée ».

  ⚙ › Aller au widget… liste tous les placements, y compris hors cadre, et ouvre Position sans sélection préalable.

- **Sélection** :
  - Maj ou Ctrl/Cmd + clic sur un widget, ou l’élément « Ajouter à la sélection » de ⋯, remplace les cases à cocher ;
  - un clic sur le fond ou Échap vide la sélection ;
  - à partir de deux widgets, une barre flottante propose Grouper, Dégrouper, Aligner ▾, Dupliquer, Copier, Style… et Corbeille ;
  - les règles antérieures sont conservées : 20 au plus, groupes en bloc.
- **Raccourcis**, en Édition seulement et hors champs, `contenteditable`, cadres, menus et dialogues :

  | Raccourci              | Action                              |
  | ---------------------- | ----------------------------------- |
  | Ctrl/Cmd+Z             | Annuler                             |
  | Ctrl/Cmd+Maj+Z         | Refaire                             |
  | Suppr / Retour arrière | Corbeille                           |
  | Ctrl/Cmd+D             | Dupliquer                           |
  | Ctrl/Cmd+C             | Copier, sans texte sélectionné      |
  | Ctrl/Cmd+V             | Coller, avec presse-papiers interne |
  | Échap                  | Vider la sélection                  |
  | ?                      | Dialogue des raccourcis             |

- **Primitives** : `src/components/ui/menu.tsx` (Base UI Menu et ContextMenu) et `side-panel.tsx`, sur `@base-ui/react` 1.9.0 déjà présent, sans nouvelle dépendance.

## Écarts au plan

- **Fermer l’inspecteur avec un brouillon non enregistré** ne demande pas « Enregistrer / Abandonner / Continuer ». Comme la configuration est téléportée, le brouillon reste dans le widget : il reste visible par le statut et par Enregistrer dans le corps, est protégé par le garde de navigation, et la sauvegarde automatique continue. Aucun brouillon n’est perdu, et il n’y a pas de dialogue supplémentaire.
- **Infobulles** : attribut `title` natif plutôt qu’une primitive de tooltip. Les boutons à icône ont tous un `aria-label`.
- **Annuler/Refaire du texte et Historique** d’une note passent dans l’onglet Contenu de l’inspecteur, et non dans ⋯. Ctrl/Cmd+Z reste actif dans l’éditeur de note.
- **Sous 640 px**, Annuler, Refaire et l’état restent dans l’en-tête, qui passe à la ligne, au lieu d’aller dans ⚙.
- **Le zoom** est un sélecteur flottant unique, aux mêmes paliers, plutôt que des boutons −/+.

## Preuves

- **Navigateur** : `tests/browser/editor-ux.test.tsx` couvre les modes, l’inspecteur et la conservation du brouillon, la sélection et Aligner, Maj+F10 et la corbeille, Aller au widget hors cadre, et les règles d’Enregistrer.
- **E2E** :
  - `tests/e2e/editor-ux.spec.ts` couvre la densité, Jeu, Lecture sans mutation, la récupération hors cadre, Suppr, le menu au clavier et le mobile 375 px ;
  - les parcours existants passent par les helpers `tests/e2e/editor-ui.ts`, avec les mêmes libellés et des rôles `menuitem`.

## Pages du projet (chantier 3a-2)

Même grammaire hors du Screen, voir [PLAN-UX3a2](../PLAN-UX3a2.md) :

- **Onglets** : la barre `ProjectNav` (Screens · Fiches · Variables) est commune aux trois pages du projet.
- **＋ crée** :
  - page projet : Dossier… et Screen… ;
  - bibliothèque : un type de fiche ;
  - variables : nouvelle variable.

  Chaque création passe par un dialogue, sans formulaire ouvert en permanence.

- **⚙ Ressources du projet** : Fichiers et Widgets personnalisés s’ouvrent dans des panneaux latéraux. Le panneau des widgets personnalisés reste monté une fois fermé (`keepMounted`), sur le projet comme sur le Screen : un brouillon de définition n’est jamais perdu en le refermant (revue UX3A2-01).
- **⋯ sur chaque ligne** (`RowActions`) : fichiers, définitions, fiches en corbeille, variables, lignes de stock et fiche ouverte. L’action principale reste visible, par exemple Placer. Les libellés des anciens boutons sont conservés.
- **Variables** : Enregistrer n’apparaît que sur une ligne modifiée ou en conflit. Les confirmations (Supprimer, Effacer définitivement) restent des boutons visibles une fois demandées.

Écart : la densité de la page projet et la conservation du brouillon sont prouvées en E2E (`editor-ux.spec.ts`) plutôt qu’en test navigateur isolé, car elles dépendent du routeur et des listes réelles.
