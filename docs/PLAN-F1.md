# Plan — Chantier 2, tranche F1 : bibliothèque de fiches du projet

Références : [PRD §8](../PRD.md) · [BRIEF](BRIEF.md) · [AUDIT](AUDIT.md) · [ADR migrations](decisions/migrations.md) · journal [PLAN-REVIEW-LOG](PLAN-REVIEW-LOG.md)

## Feuille de route du chantier 2 (indicative)

Chaque tranche est construite et prouvée séparément :

| Tranche | Contenu | Pourquoi dans cet ordre |
| --- | --- | --- |
| **F1** | Bibliothèque de fiches par projet : types, champs, liens, rétroliens, corbeille | Socle de données réutilisé par la plupart des widgets |
| F2 | Variables typées du projet, formules, refus des cycles | Nécessaires aux compteurs et aux fiches calculées |
| F3 | Socle de widgets typés : modèle générique `kind`/config/état, ADR, migration éventuelle des notes ; checklists, compteurs liés aux variables, dés | Ouvre le catalogue des 12 catégories |
| F4 | Widget fiche (PNJ/monstre) lié à la bibliothèque, texte riche | Relie Screens et bibliothèque |
| F5 | Tableaux, images, horloges/minuteurs, initiative | Widgets autonomes |
| F6 | Liens et iframes contrôlés, PDF (stockage Convex) | Fichiers et intégrations |
| F7 | Marchands et catalogue d'objets partagé | Dépend de F1, F2 et F5 |
| F8 | Widgets personnalisés en bac à sable | Exige sa propre revue de sécurité |
| F9+ | Recherche globale et palette, pop-ups et multi-écrans, impression/PDF, import/export de projet, communauté | Transverses, après le catalogue |

L'identité visuelle et la refonte de l'UX de l'éditeur relèvent du chantier 3. F1 utilise donc les composants actuels.

## Objectif de F1

Un MJ peut constituer, **dans chaque projet**, une bibliothèque de fiches réutilisables (PNJ, monstres, marchands, objets, lieux, règles, événements, notes, autre). Il peut les rechercher, les éditer sans perte, les relier entre elles avec des liens cliquables et voir les rétroliens. Une fiche supprimée va dans une corbeille restaurable.

Tout reste strictement personnel, exportable, nettoyé à la suppression du compte et restauré par les sauvegardes. Les widgets qui affichent une fiche arrivent en F4.

## Modèle de données

Nouvelles tables uniquement : c'est un ajout, sans migration de l'existant au sens de l'ADR.

- **`gmSheets`**
  - Champs : `ownerId`, `updatedAt`, `projectId`, `kind`, `title`, `summary`, `body`, `fields`, `version`, `deletedAt?`.
    - `kind` ∈ `npc | monster | merchant | item | place | rule | event | note | other`.
    - `title` : 1 à 120 caractères, validé par `gmTitle`.
    - `summary` : au plus 500 caractères.
    - `body` : au plus 50 000 caractères, texte brut. Le texte riche viendra en F4.
    - `fields` : au plus 40 entrées `{ label: 1 à 60 caractères, value: au plus 2 000 caractères }`.
    - `version` : concurrence optimiste, comme pour les notes.
    - `deletedAt` : présent quand la fiche est dans la corbeille.
  - Index : `by_owner`, `by_project_live` (`projectId`, `deletedAt`), `by_project_kind_live` (`projectId`, `kind`, `deletedAt`).
  - Recherche plein texte : `search_title` (champ `title`, filtres `projectId` et `deletedAt`).
- **`gmSheetLinks`**
  - Champs : `ownerId`, `updatedAt`, `projectId`, `fromId`, `toId`.
  - Index : `by_owner`, `by_from` (`fromId`), `by_to` (`toId`).
  - Ce sont des liens dirigés. Une table à part permet d'obtenir les rétroliens par index, sans parcourir des fiches qui peuvent peser jusqu'à 50 ko chacune.
- **Limites** (`shared/gm.ts`) :
  - `GM_MAX_SHEETS = 500` fiches non supprimées par projet ;
  - `GM_MAX_SHEET_LINKS = 50` liens sortants par fiche ;
  - corbeille bornée par `GM_MAX_TRASH` (100) par projet.
- **Intégrations** :
  - ajout de `gmSheets` et `gmSheetLinks` à `gmTables` (`shared/gm.ts`), à `gmCollection` et à `gmDocument` (`convex/lib/gmValidators.ts`) ;
  - l'export (`gm.exportCollection`), le nettoyage du compte (`convex/cleanup.ts`) et le décompte de restauration de l'E2E les prennent alors en charge automatiquement.

## API Convex (`convex/gmSheets.ts`)

Toutes les fonctions publiques appellent `requireUser`, puis un contrôle de propriété :

- `ownedProject`, ou un nouveau `ownedSheet` dans `convex/lib/gmAccess.ts` qui lève `NOT_FOUND` pour la fiche d'un autre compte ;
- chaque écriture passe aussi par `limitUserOperation(ctx, 'resourceWrite', userId)`.

Tous les retours ont un validateur. Les pages comptent au plus 50 éléments.

| Fonction | Type | Contrat |
| --- | --- | --- |
| `listSheets` | query | `projectId`, `kind?`, `trashed?` ; paginée ; renvoie un résumé (sans `body` ni `fields`) |
| `searchSheets` | query | `projectId`, `text` (1 à 100 caractères) ; au plus 20 fiches vivantes du projet ; résumé |
| `getSheet` | query | fiche complète, plus `links` et `backlinks` (`{ _id, title, kind }`, fiches vivantes, au plus 50 chacun) ; `null` si inaccessible |
| `createSheet` | mutation | `projectId`, `kind`, `title` ; refus au-delà de `GM_MAX_SHEETS` (`SHEET_LIMIT`) |
| `updateSheet` | mutation | `id`, `expectedVersion`, `kind`, `title`, `summary`, `body`, `fields` ; `CONFLICT` si la version est obsolète ; `INVALID_INPUT` si la validation zod (partagée) échoue ; `version + 1` |
| `setSheetLinks` | mutation | `id`, `targets` (sans doublons) ; refus de soi-même, d'une fiche d'un autre projet ou compte, ou supprimée (`NOT_FOUND` ou `INVALID_INPUT`) ; au plus 50 ; remplacement atomique des lignes `by_from` |
| `trashSheet` / `restoreSheet` | mutation | pose ou retire `deletedAt` ; la restauration refuse au-delà de la limite ; les liens sont conservés mais masqués tant que l'une des deux fiches est dans la corbeille |
| `deleteSheetForever` | mutation | uniquement depuis la corbeille ; supprime la fiche et toutes ses lignes de lien, entrantes comme sortantes |

## Interface (composants actuels)

- **Page projet** (`src/features/gm/project.tsx`) : un lien « Bibliothèque » vers `/app/projects/$projectId/library`.
- **Bibliothèque** (`src/features/gm/library.tsx` et sa route) :
  - liste paginée filtrable par type ;
  - champ de recherche, qui appelle `searchSheets` à partir d'un caractère ;
  - formulaire de création (type et titre) ;
  - bascule « Corbeille » avec restauration et suppression définitive confirmée.
- **Fiche** (`src/features/gm/sheet.tsx` et la route `/app/sheets/$sheetId`) :
  - formulaire titre, type, résumé et corps ;
  - éditeur de champs : ajouter, retirer, réordonner par boutons haut et bas ;
  - enregistrement explicite, avec gestion du conflit : message, puis choix entre recharger la version enregistrée et conserver le brouillon. Même principe que `note-editor`, sans perte silencieuse de saisie ;
  - liens (ajout via la recherche du projet, retrait) et rétroliens, tous cliquables ;
  - mise à la corbeille.
- **Accessibilité** : libellés explicites, états de chargement et d'erreur (`role="status"` / `role="alert"`), navigation clavier native.

## Non-objectifs de F1

Widgets qui affichent une fiche (F4), variables et formules (F2), texte riche (F4), marchands et stocks (F7), recherche globale tous projets confondus (F9), import/collage structuré (PRD §11, plus tard), refonte visuelle (chantier 3).

## Critères d'acceptation

1. **Tests backend** `tests/backend/gm-sheets.test.ts`. Ils couvrent :
   - création, édition et `CONFLICT` ;
   - validation des bornes : titre, résumé, corps, 40 champs, libellés ;
   - limite de 500 fiches, avec un test du refus via `backend.run` pour insérer en masse ;
   - liens : soi-même, autre projet, autre compte, fiche supprimée, doublons, plus de 50 ;
   - rétroliens ;
   - corbeille, restauration et suppression définitive, qui purge les liens dans les deux sens ;
   - recherche limitée au projet et aux fiches vivantes ;
   - **refus de chaque fonction publique pour un autre compte** ;
   - export de `gmSheets` et `gmSheetLinks` ;
   - nettoyage du compte, qui supprime les deux tables.
2. **Inventaire** : `pnpm audit:convex` sort en code 0, avec les nouvelles fonctions ajoutées à l'axe A de `docs/AUDIT.md`.
3. **Vérification locale** : `pnpm check` est vert sous Node 26.11.1.
4. **E2E Holysheet** (`tests/e2e/holysheet.spec.ts`, exécuté en CI) :
   - créer une fiche par l'interface depuis la bibliothèque ;
   - l'éditer et l'enregistrer ;
   - créer une seconde fiche et les relier ;
   - vérifier le lien et le rétrolien cliquables ;
   - la restauration locale compte au moins un document dans `gmSheets` et dans `gmSheetLinks`, grâce à la boucle existante sur `gmTables`.
5. **CI** de la branche verte : application, image Docker, secrets.
6. **Inspection** Codex neuve et ciblée : APPROVED.

## Risques

| Risque | Mitigation |
| --- | --- |
| Rétroliens ou liste trop coûteux | Table de liens indexée, résumés sans corps, pages ≤ 50 |
| E2E écrit sans pouvoir l'exécuter localement | Sélecteurs par rôle et libellé, au plus près des tests existants ; correction itérative sur la CI de la branche |
| Perte de saisie lors d'un conflit | Brouillon conservé et choix explicite, comme pour les notes |
| Restauration d'une sauvegarde antérieure à F1 | Tables nouvelles et vides : la restauration reste compatible |
