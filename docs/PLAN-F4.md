# Plan — Chantier 2, tranche F4a : widget fiche lié à la bibliothèque

Références : [PRD §8–9](../PRD.md) (« Fiches de PNJ / monstres : vues synthétiques avec accès aux fiches détaillées », « Un même objet métier peut être affiché par plusieurs widgets, avec une seule donnée source ») · [PLAN-F1](PLAN-F1.md) · [PLAN-F3](PLAN-F3.md) · [ADR widgets](decisions/widgets.md)

## Découpage

- **F4a (ce plan)** : un nouveau kind `sheet`, qui affiche une fiche de la bibliothèque du projet sur un Screen.
- **F4b (plus tard)** : le texte riche des notes, qui exige son propre ADR (éditeur, nettoyage du HTML, format stocké, migration éventuelle des corps de notes).

## Modèle

- Nouveau kind `sheet` dans l'union de widgets V2. On suit les règles de F3 : union stricte, budgets et kind immuable.
  - `config: { title, sheetId: Id<'gmSheets'>, display: 'summary' | 'fields' | 'full', fieldLabels: string[] }`
    - `title` : au plus 120 caractères, peut être vide (titre par défaut : celui de la fiche) ;
    - `fieldLabels` : au plus 40 libellés, chacun de 1 à 60 caractères, sans doublons. Ils filtrent les champs affichés en mode `fields`, et une liste vide affiche tous les champs ;
  - `state: {}`.
- **Seule source de vérité : la fiche.** Le widget ne copie ni titre, ni résumé, ni champs. Une modification de la fiche se voit partout.
- **Validation à la création et à la mise à jour** : la fiche doit appartenir au même compte et au même projet que le Screen, et ne pas être dans la corbeille. Sinon `NOT_FOUND`.
- **Fiche devenue indisponible** (corbeille, suppression définitive) : le widget reste et affiche « Fiche indisponible », avec la possibilité de choisir une autre fiche. On ne supprime jamais de widget automatiquement. La suppression définitive d'une fiche ne touche pas aux widgets.

## API

- `gmWidgets.addWidget(screenId, kind: 'sheet')` crée le widget avec une configuration vide à compléter (`sheetId` absent, donc on accepte `sheetId?` ; le widget affiche « Choisir une fiche »). La création peut aussi recevoir directement un `sheetId` validé.
- `updateWidget` valide `sheetId`, `display` et `fieldLabels` comme décrit plus haut, avec le verrouillage, les versions et les quotas de F3.
- **Nouvelle query `gmWidgets.getSheetPreview(widgetId)`**, sans mutation.
  - Contrôles : `requireUser`, puis `ownedNote`.
  - Retour : `{ status: 'missing' }`, ou bien `{ status: 'ok', sheet: { _id, kind, title, summary }, fields?, body? }` selon `display`.
    - `summary` : métadonnées seulement ;
    - `fields` : métadonnées et champs filtrés, lus sur `gmSheetContents` ;
    - `full` : comme `fields`, plus le corps.
  - Une seule lecture de contenu par appel. Le client fait un appel par widget de fiche affiché.
- **Sans changement** :
  - la duplication et le collage copient la référence, pas la fiche ;
  - la corbeille, l'historique (configuration seulement), les groupes, les styles et les profils restent ceux de F3 ;
  - le rendu statique ou papier affiche la fiche résolue, sinon « Fiche indisponible ».

## Interface

- Le sélecteur « Type de widget » propose désormais « Fiche ».
- En édition :
  - recherche d'une fiche du projet par `gmSheets.searchSheets`, puis bouton « Afficher « titre » » ;
  - choix de l'affichage (Résumé / Champs / Complet) ;
  - sélection des champs, par cases à partir des libellés de la fiche.
- En consultation :
  - type, titre et résumé, puis champs ou corps selon le mode ;
  - lien « Ouvrir la fiche » vers `/app/sheets/$sheetId`.
- Accessibilité : région nommée « Widget fiche N », chargement en `role="status"`, erreurs en `role="alert"`.

## Critères d'acceptation

1. **Tests backend** :
   - création et liaison ;
   - refus d'une fiche d'un autre projet, d'un autre compte ou en corbeille ;
   - `fieldLabels` invalides ;
   - affichage dans les trois modes, sans fuite des champs non sélectionnés en mode `fields` ;
   - fiche passée en corbeille puis supprimée définitivement : statut `missing`, widget intact ;
   - duplication qui conserve la référence ;
   - refus de chaque entrée publique à un autre compte ;
   - verrouillage : la configuration est refusée.
2. **E2E CI** : depuis le Screen, ajouter un widget « Fiche », lier « Aubergiste » (créée par `library.ts`), afficher le résumé, puis modifier le résumé sur la page de la fiche et constater la mise à jour sur le Screen.
3. **Vérification et inventaire** : `pnpm check` vert, `pnpm audit:convex` à 0 avec l'inventaire de l'audit mis à jour, CI verte.
4. **Inspection** par Claude, fournisseur opposé au builder Codex.

Écart de méthode consigné : pas de review du plan par Codex, pour économiser son quota (arrêt demandé à 70 %). Codex construit à partir de ce plan, et Claude inspecte.
