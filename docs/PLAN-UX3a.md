# Plan — Chantier 3a : architecture d'interaction de l'éditeur de Screen

Références : [PRD](../PRD.md) §4 (« simplicité par défaut, personnalisation puissante à la demande », « panneaux de paramètres pour les configurations complexes ; interactions usuelles directement dans les widgets ; menus contextuels et raccourcis ») · [ADR éditeur](decisions/screen-editor.md) · [ADR outils](decisions/widget-tools.md) · [ADR widgets](decisions/widgets.md).

Demande utilisateur du 3 novembre 2026 : « trop de bouton dans tous les sens, c'est surchargé […] passer par des sous menu […] une roue cranté ». Le chantier 3 est découpé en deux parties : **3a**, l'architecture d'interaction (ce plan), et **3b**, l'identité visuelle (couleurs, typographie, logo), qui fera l'objet d'un plan séparé.

## Objectif

L'éditeur de Screen n'affiche par défaut que l'essentiel. Toutes les actions existantes restent disponibles, regroupées dans :

- des menus : ＋, ⚙ et ⋯ ;
- un menu contextuel ;
- une barre de sélection ;
- un inspecteur latéral.

Aucune fonctionnalité ne disparaît. Aucun brouillon ne peut être perdu. Rien ne change côté serveur.

## État actuel (constat)

Sur la page Screen, sans rien sélectionner, on voit en permanence :

- **en-tête** : Lecture seule, Verrouiller, Ajouter une note, un sélecteur de type avec Ajouter un widget ;
- **panneau Fichiers**, toujours ouvert ;
- **barre de profil** : sélecteur et case de sauvegarde automatique ;
- **barre de disposition** : Dimensions…, Nouveau profil…, Annuler, Refaire, Enregistrer, Historique et statut ;
- **réglages d'affichage** : case de grille, sélecteur de zoom et texte d'aide ;
- **outils** : Dupliquer, Copier, Coller, Mettre à la corbeille et Corbeille, puis un bloc dépliable avec une case par note, Grouper, Dégrouper et 6 boutons d'alignement.

Quand un widget est actif, deux autres blocs s'ajoutent : le bloc « Coordonnées » (sélecteur de note, X, Y, L, H…) et le bloc « Style » (3 couleurs, police, 4 champs numériques, réinitialisation).

Dans chaque widget, les formulaires de configuration sont affichés en ligne. Selon le kind, s'y ajoutent Enregistrer, Annuler, Refaire, Historique et Charger la version enregistrée. Les fichiers concernés sont `screen.tsx`, `layout-editor.tsx`, `layout-settings.tsx`, `widget-tools.tsx`, `typed-widget.tsx`, `note-editor.tsx`, `session-widget.tsx`, `embed-widget.tsx`, `table-widget.tsx`, `merchant-stock.tsx`, `initiative-widget.tsx` et `revision-history.tsx`, plus `custom-*.tsx` après F8. `src/components/ui/` ne contient que `button`, `dialog` et `input`.

## Prérequis

F8 (widgets personnalisés, branche `codex/f8-custom`) doit être fusionné avant le build de 3a, CI verte : son interface est reprise dans ce plan au même titre que les autres widgets. Si F8 reste bloqué, 3a se construit sur `main` et F8 sera adapté au moment de son rebase. Dans ce cas, ses widgets suivent la règle 5, contenu d'usage contre configuration.

## Décisions

1. **Primitives locales** dans `src/components/ui/`, toutes construites sur `@base-ui/react` 1.9.0, déjà installé, donc sans nouvelle dépendance :
   - `menu` : déroulant, sous-menus, éléments case à cocher et radio, indication de raccourci ;
   - `context-menu` ;
   - `popover` ;
   - `tooltip` ;
   - `toolbar` ;
   - `side-panel` : panneau latéral non modal, qui devient une feuille basse sous 768 px.

   Focus, navigation au clavier et ARIA viennent de Base UI. Les icônes viennent de Lucide. Les couleurs reprennent les tokens existants, sans aucun travail d'identité (3b). Tout bouton qui n'affiche qu'une icône a un `aria-label` et une infobulle.

2. **Trois modes de vue, Édition, Jeu et Lecture**, choisis par un seul contrôle segmenté dans l'en-tête (revue UX3A-02). Tous trois sont locaux à la vue.
   - « Édition » correspond au comportement actuel.
   - « Jeu » est **nouveau**. Il bloque localement la disposition, la configuration et l'ajout ou la suppression de widgets. Le contenu d'usage reste utilisable (règle 5) : compteurs, dés, initiative, cases de checklist, ±1 du marchand, texte des notes, lecture de PDF. Côté client, c'est un drapeau distinct de `readOnly`, qui réutilise les blocages déjà appliqués par le verrou de disposition, sans écrire le verrou serveur.
   - « Lecture » correspond exactement à l'actuelle `readOnly`, c'est-à-dire une consultation sans aucune écriture, avec le rendu statique actuel des checklists, compteurs, dés, session et marchand. Le contrat du PRD §4 (« consultation en lecture seule ») est conservé.
   - Le mode par défaut ne change pas (Édition). Le **verrou de disposition**, persistant et partagé entre les vues (`gmScreens.layoutLocked`), est conservé tel quel et passe dans le menu ⚙.
   - L'en-tête affiche un badge « Disposition verrouillée » quand le verrou est actif.
3. **En-tête du Screen sur une seule ligne** :
   - lien de retour et titre ;
   - contrôle de mode Édition/Jeu/Lecture ;
   - en Édition seulement, les boutons suivants :
     - **＋ Ajouter**, un menu qui contient :
       - Note ;
       - un sous-menu par famille de widgets : « Texte et listes » (checklist, tableau, fiche), « Outils de partie » (compteur, dés, horloge, initiative), « Médias et liens » (image, PDF, lien web) et « Personnalisé » (F8) ;
       - « Image ou fichier… », qui ouvre le tiroir des fichiers ;
     - Annuler et Refaire en icônes avec infobulle ;
     - l'état de la disposition : un texte court et le bouton Enregistrer, selon la situation :
       - la sauvegarde automatique est coupée et un brouillon existe : bouton visible et actif ;
       - **le dernier enregistrement a échoué sans conflit**, sauvegarde automatique comprise : bouton visible et actif, intitulé « Réessayer l'enregistrement », puisque `use-editor-draft` suspend les nouvelles tentatives tant qu'une erreur est présente (revue UX3A-03) ;
       - **conflit de version**, même combiné à une erreur : bouton visible mais **désactivé**, avec l'explication « Ce profil a changé dans une autre vue ». Le brouillon est conservé et le bandeau existant « Charger la disposition enregistrée » reste affiché, puisque le hook et le serveur (`gmEditing`) refusent toute version périmée (revue UX3A-04) ;
       - les autres blocages existants (geste en cours, requête en cours, verrou) désactivent le bouton comme aujourd'hui ;
     - **⚙ Screen**, un menu qui contient :
       - Profil de disposition : un sous-menu radio avec les profils, plus « Nouveau profil… » et « Dimensions… », qui ouvrent les dialogues existants de `LayoutSettings` ;
       - Verrouiller la disposition (case) ;
       - Sauvegarde automatique (case) ;
       - Grille magnétique (case) ;
       - Historique de la disposition (dialogue existant) ;
       - **Aller au widget…** (revue UX3A-01) : un dialogue qui liste tous les placements du profil (libellé, kind, coordonnées), y compris ceux qui sont entièrement hors du cadre. Le choix d'un placement le sélectionne, ouvre l'inspecteur sur Position et, s'il est visible, le fait défiler dans la vue. Cet accès ne dépend d'aucune sélection préalable ;
       - Fichiers du projet (tiroir) ;
       - Corbeille du Screen (dialogue existant) ;
       - Raccourcis clavier (dialogue).

   Sous 640 px, Annuler, Refaire et l'état passent dans ⚙. Les éléments désactivés le restent pour les mêmes conditions qu'aujourd'hui : brouillon, requête en cours, verrou, lecture seule. L'élément désactivé porte une infobulle qui explique pourquoi.

4. **Zoom** : un petit contrôle flottant en bas à droite de la vue défilante (− %, valeur, +), visible dans les trois modes, avec les mêmes paliers de 25 à 200 %. Le texte d'aide sur les flèches et Ctrl+Z passe dans le dialogue Raccourcis.
5. **Widgets : séparer l'usage de la configuration**.
   - **Le corps du widget ne montre que le contenu et ses actions d'usage**. Les formulaires de configuration et l'historique sortent du corps et vont dans l'inspecteur (décision 7). Les formulaires concernés sont :
     - titre, source et variable de compteur ;
     - paramètres de dés ;
     - mode d'affichage de fiche et champs affichés ;
     - URL, titre et mode du lien web ;
     - configuration de session et d'horloge ;
     - réglages du marchand ;
     - code du widget personnalisé.
   - L'**en-tête du widget** (la poignée de déplacement actuelle) n'apparaît qu'en Édition. Il porte le libellé, puis deux boutons, ⚙ (« Configurer ») et ⋯ (« Plus d'actions »). Ces deux boutons sont visibles sur le widget sélectionné et au survol ou au focus des autres. Sur écran tactile, un appui sélectionne le widget, ce qui les affiche.
   - La **poignée de redimensionnement** n'apparaît qu'en Édition, sur le widget sélectionné ou survolé.
   - En **Jeu** et en **Lecture**, aucun en-tête ni poignée. Le titre configuré du widget, s'il existe, reste affiché comme contenu.
   - Le **texte d'une note** reste éditable dans son corps. Annuler et Refaire passent dans ⋯ et dans Ctrl/Cmd+Z quand le focus est dans l'éditeur, ce qui fonctionne déjà via l'éditeur riche. Enregistrer n'apparaît que dans trois cas : la sauvegarde automatique est coupée avec un brouillon, un brouillon n'est pas encore acquitté, ou le dernier enregistrement a échoué sans conflit. Dans ce dernier cas, il apparaît en « Réessayer l'enregistrement ». En conflit, il est désactivé et « Charger la version enregistrée » reste affiché. La même règle vaut pour l'onglet Contenu de l'inspecteur.
   - **Les états restent toujours visibles dans le corps et ne vont jamais dans un menu** :
     - conflit avec « Charger la version enregistrée » ;
     - erreur (`role="alert"`) ;
     - « non configuré » ;
     - envoi en cours.
6. **Menu ⋯ et menu contextuel**, avec un contenu identique. On l'ouvre par clic droit sur le widget, par Maj+F10 ou par la touche Menu sur l'en-tête focalisé. Il contient :
   - Configurer… ;
   - Dupliquer ;
   - Copier ;
   - Coller ici (si le presse-papiers interne n'est pas vide) ;
   - Ajouter à la sélection / Retirer de la sélection (case) ;
   - Grouper avec la sélection / Dégrouper (selon l'état) ;
   - Historique… (dialogue de révision existant, piloté en mode contrôlé) ;
   - Annuler le texte et Refaire le texte (notes) ;
   - Mettre à la corbeille.

   En Jeu et en Lecture, le clic droit garde le menu natif du navigateur.

7. **Inspecteur latéral** (`side-panel`, à droite, non modal, en feuille basse sur mobile). Il s'ouvre par ⚙ sur un widget, par « Configurer… », ou par un double-clic sur l'en-tête. Il contient trois onglets :
   - **Contenu** : le formulaire de configuration du kind, avec Enregistrer, Annuler/Refaire la configuration, Historique et le conflit ;
   - **Style** : les contrôles actuels de « Style des notes sélectionnées », plus Réinitialiser ;
   - **Position** : X, Y, largeur, hauteur et calque. Il remplace le bloc « Coordonnées » et son sélecteur « Note sélectionnée ». Pour retrouver un widget hors cadre, on passe par ⚙ › Aller au widget… (décision 3), accessible sans sélection.

   Comportements :
   - Avec une sélection multiple, seul l'onglet Style est actif, et il s'applique à tous les widgets sélectionnés, comme aujourd'hui.
   - **Brouillons** :
     - le formulaire Contenu garde le hook de brouillon et de version existant ;
     - fermer l'inspecteur ou changer de widget pendant qu'un brouillon de configuration n'est pas enregistré n'est jamais silencieux : un choix en ligne « Enregistrer / Abandonner / Continuer l'édition » s'affiche ;
     - avec la sauvegarde automatique active, « Enregistrer » est déclenché d'abord, et la fermeture n'a lieu qu'après acquittement ;
     - le `DraftGuard` de navigation couvre l'inspecteur.

8. **Sélection sur le canevas**, qui remplace la liste « Sélectionner la note N ».
   - Un clic sur l'en-tête ou le fond d'un widget le rend actif.
   - Maj+clic ou Ctrl/Cmd+clic l'ajoute à la sélection ou l'en retire. Un clic sur le fond vide du Screen ou Échap vide la sélection.
   - L'équivalent au clavier et pour l'accessibilité est l'élément case du menu ⋯. L'en-tête porte `aria-pressed` pour indiquer l'appartenance à la sélection.
   - Les règles actuelles ne changent pas : la sélection multiple prime sur le widget actif, 20 widgets au plus par opération, et un groupe est traité comme un bloc.
9. **Barre de sélection** flottante au-dessus du canevas, affichée seulement à partir de 2 widgets sélectionnés. Elle contient :
   - « N sélectionnés » ;
   - Grouper et Dégrouper ;
   - **Aligner ▾**, un menu avec les 6 alignements et distributions actuels et leurs mêmes conditions d'activation ;
   - Dupliquer ;
   - Copier ;
   - Style… (ouvre l'inspecteur sur Style) ;
   - Mettre à la corbeille ;
   - ✕ pour vider la sélection.

   L'indication « N widget(s) copié(s) » devient une notification brève.

10. **Fichiers** : le panneau `Files` passe dans un tiroir (`side-panel` à gauche), avec le même composant et le même choix « placer sur le Screen ». Le collage et le dépôt d'image sur le Screen ne changent pas.
11. **Raccourcis**, actifs seulement en Édition et quand le focus n'est ni dans un champ, ni dans une zone `contenteditable`, ni dans un cadre :

    | Raccourci | Action |
    | --- | --- |
    | Ctrl/Cmd+Z, Ctrl/Cmd+Maj+Z | Annuler, refaire (existants) |
    | Suppr ou Retour arrière | Corbeille de la sélection (opération réversible, sans confirmation) |
    | Ctrl/Cmd+D | Dupliquer |
    | Ctrl/Cmd+C, Ctrl/Cmd+V | Copier, coller les widgets (presse-papiers interne existant) |
    | Échap | Vider la sélection, ou fermer le menu ou l'inspecteur |
    | ? | Ouvrir le dialogue Raccourcis |

    Les flèches sur la poignée ne changent pas. Chaque raccourci est affiché dans son élément de menu.

12. **Noms accessibles conservés** : chaque élément de menu reprend le libellé exact du bouton qu'il remplace (« Aligner à gauche », « Mettre à la corbeille », « Verrouiller la disposition »…). Seul le rôle change (`menuitem`, `menuitemcheckbox`). Les E2E utilisent un helper `menuAction(page, trigger, ...chemin)` placé dans `tests/e2e/helpers`.

## Correspondance des actions (aucune perte)

| Action actuelle | Nouvel emplacement |
| --- | --- |
| Lecture seule / Reprendre l'édition | Contrôle de mode › Lecture / Édition (Jeu est nouveau) |
| Verrouiller/Déverrouiller la disposition | ⚙ › case |
| Ajouter une note / type + Ajouter un widget | ＋ › Note / famille › kind |
| Panneau Fichiers, placer un fichier | ＋ › Image ou fichier… et ⚙ › Fichiers du projet (tiroir) |
| Profil de disposition, Sauvegarde automatique | ⚙ › sous-menu radio / case |
| Dimensions…, Nouveau profil… | ⚙ › Profil de disposition › … |
| Annuler/Refaire/Enregistrer la disposition | En-tête (icônes ; Enregistrer conditionnel) |
| Historique de disposition | ⚙ › Historique de la disposition |
| Grille magnétique, Zoom | ⚙ › case ; contrôle flottant |
| Coordonnées, Note sélectionnée | Inspecteur › Position ; ⚙ › Aller au widget… (sans sélection) |
| Dupliquer, Copier, Coller, Mettre à la corbeille | ⋯ / contextuel / barre de sélection / raccourcis |
| Corbeille du Screen | ⚙ › Corbeille du Screen |
| Sélectionner la note N | Maj/Ctrl+clic ; ⋯ › Ajouter à la sélection |
| Grouper, Dégrouper, 6 alignements | Barre de sélection (Aligner ▾) ; ⋯ |
| Style des notes sélectionnées | Inspecteur › Style |
| Configuration en ligne des widgets typés + Enregistrer/Annuler/Refaire/Historique | Inspecteur › Contenu |
| Annuler/Refaire le texte, Historique de note | ⋯ ; Ctrl/Cmd+Z dans l'éditeur |
| Conflits, erreurs, statuts | Inchangés, dans le corps ou l'en-tête |

## Hors périmètre

- Identité visuelle (3b).
- Autres pages : projet, bibliothèque, fiches, marchands, variables. Elles feront l'objet d'une passe 3a-2 après retour de l'utilisateur sur l'éditeur.
- Palette de commandes et recherche (F9).
- Guides d'alignement magnétiques, sélection au lasso, refonte du rendu papier et impression.
- Tout changement Convex : schéma, fonctions, droits, limites.
- Persistance du mode ou de l'état des panneaux entre sessions.

## Risques

- **Découvrabilité des actions masquées.** Parades : le bouton ＋ est toujours visible en Édition, les infobulles sont systématiques, chaque élément de menu indique son raccourci, le dialogue Raccourcis existe, et l'état vide du Screen affiche une invite « Ajoutez un premier widget avec ＋ ».
- **Perte de brouillon au déplacement des formulaires.** Parades : la décision 7 et des tests dédiés.
- **Chevauchements sur le canevas.** Les menus et l'inspecteur sont rendus en portail, au-dessus du Screen. Les E2E privilégient le clavier et les menus.
- **Coût des tests** : environ 275 localisateurs et 11 specs E2E à adapter. La parade est la règle 12, qui conserve les mêmes noms.

## Critères d'acceptation

1. **Densité (test navigateur)** : en Édition, sans sélection et sauvegarde automatique active, la page Screen compte **au plus 8 contrôles interactifs visibles hors de la surface du Screen** : retour, contrôle de mode (compté comme un seul groupe), ＋, Annuler, Refaire, ⚙, zoom −/+. En Jeu et en Lecture, **au plus 4** : retour, contrôle de mode, zoom −/+.
2. **En Jeu** :
   - ni poignée, ni ⋯, ni ⚙ de widget, ni formulaire de configuration ;
   - compteur ±, lancer de dés, initiative, cases de checklist, ±1 du marchand et lecture de note fonctionnent ;
   - le clic droit ne montre pas le menu de l'application ;
   - aucune écriture de disposition, de configuration, d'ajout ou de corbeille n'est possible, même par raccourci.
3. **En Lecture** (revue UX3A-02) : aucune mutation n'est déclenchable. Le rendu statique actuel est conservé : checklist, compteur, dés, session et marchand sans contrôle de stock. Un test navigateur vérifie l'absence de contrôle d'écriture, et un E2E vérifie qu'aucun appel de mutation n'est émis.
4. **Récupération** :
   - un Screen dont le seul widget est entièrement hors du cadre permet, par ⚙ › Aller au widget…, d'ouvrir Position et de le ramener dans le cadre (test navigateur et E2E, revue UX3A-01) ;
   - après un échec simulé de sauvegarde automatique, « Réessayer l'enregistrement » est visible et actif, et il enregistre le même brouillon sans toucher à la sauvegarde automatique (test navigateur, revue UX3A-03) ;
   - une erreur de sauvegarde combinée à une mise à jour concurrente laisse le bouton désactivé, conserve le brouillon et propose « Charger la version enregistrée » (test navigateur, revue UX3A-04).
5. **Correspondance** : chaque ligne du tableau de correspondance est atteignable et produit le même effet qu'avant. Couverture :
   - tests navigateur pour le contenu, l'activation et la désactivation des menus ;
   - E2E pour les parcours réels : ajout par ＋, alignement par la barre, corbeille par raccourci, verrou par ⚙, configuration par l'inspecteur.
6. **Clavier et accessibilité** :
   - tous les menus et sous-menus sont opérables au clavier ;
   - Maj+F10 ouvre le menu contextuel ;
   - Échap rend le focus au déclencheur ;
   - les boutons à icône ont un nom accessible ;
   - les raccourcis sont inactifs dans un champ, un `contenteditable` et un iframe.
7. **Brouillons** (tests navigateur) :
   - fermer l'inspecteur ou changer de widget avec une configuration non enregistrée affiche le choix et ne perd rien ;
   - avec la sauvegarde automatique, la fermeture n'a lieu qu'après acquittement ;
   - un brouillon de note survit à l'ouverture et à la fermeture des menus et de l'inspecteur ;
   - les conflits restent visibles dans le corps.
8. **Mobile (E2E à 375 × 812)** : pas de défilement horizontal causé par l'en-tête, l'inspecteur s'affiche en feuille basse, et un appui sélectionne puis expose ⚙ et ⋯.
9. **Aucun changement serveur** : `git diff --stat main -- convex/ shared/` vide, hors éventuels libellés partagés.
10. `pnpm check` vert et CI de branche verte : E2E existants adaptés, plus `editor-ux.spec.ts`. AUD-28 garde 100/100.
11. Documentation :

- ADR `docs/decisions/editor-ux.md` (modes, menus, inspecteur, raccourcis, règle « états toujours visibles ») ;
- mise à jour de `docs/decisions/widget-tools.md` et `docs/product.md` ;
- journal.

## Découpage du build (work orders Codex, une branche `codex/ux3a`, commits successifs)

1. **WO1 — Primitives** : les 6 composants `ui/`, leurs tests navigateur (clavier, focus, sous-menus, feuille basse sous 768 px) et le helper E2E `menuAction`.
2. **WO2 — En-tête et ⚙** :
   - modes Édition/Jeu/Lecture, ＋, ⚙, Aller au widget…, Réessayer l'enregistrement ;
   - contrôle de zoom flottant ;
   - tiroir Fichiers ;
   - dialogue Raccourcis ;
   - test de densité ;
   - adaptation des E2E touchés.
3. **WO3 — Canevas** : en-tête de widget, ⋯ et menu contextuel, sélection au clic, barre de sélection, raccourcis, retrait de la liste de cases et du bloc Coordonnées.
4. **WO4 — Inspecteur** : onglets Contenu, Style et Position, migration des formulaires de configuration de chaque kind, garde de brouillon, tests de brouillon.
5. **WO5 — Finition** : `editor-ux.spec.ts` (avec le mobile), ADR, `product.md`, nettoyage de Knip.

Chaque WO laisse `pnpm check` vert. Les E2E tournent en CI sur la branche avant l'avance rapide de `main`.

## Commandes de preuve

`pnpm check` · `git diff --stat main -- convex/ shared/` · CI de branche (E2E, dont `editor-ux.spec.ts` et AUD-28), puis avance rapide de `main`. Vérification visuelle par l'utilisateur sur le déploiement avant 3b.
