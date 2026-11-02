# Plan — Tranche F3c : contraction du format des widgets, puis lecture complète des métadonnées

Références : [ADR widgets](decisions/widgets.md) (déploiement C) · [ADR migrations](decisions/migrations.md) · [PLAN-F3](PLAN-F3.md) · [AUDIT](AUDIT.md) AUD-25 et AUD-28 · journal du 2 novembre 2026 (migration B exécutée en prod : `notes` 3, `layouts` 4, `history` 0, toutes `success`).

## Objectif

1. Retirer le format V1 des widgets, dispositions et historiques : un seul format stocké et lu, `formatVersion: 2`. Le code de transition (adaptateurs, garde `MIGRATION_REQUIRED`, index temporaire) disparaît.
2. Corriger structurellement AUD-28 : un Screen ouvert affiche en direct tous ses widgets, y compris pendant une insertion en masse.

## Partie 1 — Contraction

### Garde-fous de déploiement

- **Inventaire d'abord.** Une query interne `gmWidgetMigrations:inventory`, paginée par lots bornés (curseur en argument, pas de lecture globale), renvoie des compteurs par table et au plus quelques IDs, jamais de contenu.
  - **Compteurs bloquants** (doivent être à zéro) :
    - documents V1 ;
    - payloads `gmWidgetContents` en double ou orphelins ;
    - notes de kind `note` sans payload ;
    - payload dont `ownerId`, `projectId` ou `screenId` diffère de son widget, ou dont le widget n'est pas de kind `note` ;
    - placements **courants** d'une disposition qui pointent vers un widget absent, d'un autre Screen ou d'un autre propriétaire ;
    - sujets d'historique de widget absents ou d'un autre propriétaire. Une révision de widget purgé est retirée par `purgeNote`, donc son absence reste anormale.
  - **Compteurs informatifs** (non bloquants) : références d'**anciens snapshots** de disposition vers des widgets purgés. Elles sont légitimes, puisque `purgeNote` ne réécrit pas l'historique des dispositions et que `restoreRevision` ignore ces placements (revue F3c-01). On conserve ces données telles quelles.
  - Les contrôles reprennent les correspondances déjà vérifiées par `scripts/snapshots.mjs`, sans dupliquer sa logique si elle peut être partagée.
- **Ordre de livraison en deux commits sur `main`**, déployables séparément :
  - **F3c-1**, additif : l'inventaire seul, compatible avec le code A/B actuel. L'utilisateur le déploie et l'exécute en prod ; tous les compteurs doivent être à zéro.
  - **F3c-2**, contraction : publié seulement après un inventaire propre.
- **Filet de Convex.** Au déploiement, Convex valide tous les documents existants contre le nouveau schéma et refuse le push entier si un seul document V1 subsiste. Il n'y a donc pas d'état intermédiaire. On le documente comme seconde barrière, pas comme substitut à l'inventaire.
- **Retour arrière** : redéployer F3c-1 (code A, qui lit V2). On ne revient jamais à du code antérieur à A.

### Changements

- Les validateurs (`convex/lib/gmValidators.ts`) et le schéma n'acceptent plus que V2 pour `gmNotes`, les dispositions et `gmEditorHistory`. `formatVersion: v.literal(2)` devient obligatoire.
- Suppressions :
  - les adaptateurs de lecture V1 (`convex/lib/gmFormats.ts` et appelants), la conversion à la première écriture (`gmEditing.ts`, `gmWidgetWriting.ts`) ;
  - la garde `MIGRATION_REQUIRED` et le message de maintenance côté client ;
  - l'index `by_screen_format`.
- Les passes de migration `notes`, `layouts` et `history`, ainsi que `run`, sont retirées du code. Le composant `migrations` reste enregistré dans `convex.config.ts` : ses tables d'état sont conservées et serviront aux prochaines migrations.
- **Restauration** : une archive antérieure à la contraction ne s'importe pas directement. Le runbook (`docs/backup-restore.md`, `docs/decisions/migrations.md`) dit de restaurer avec A, de lancer B, puis de redéployer C. Les fixtures V1 des tests et de `scripts/snapshots.mjs` sont retirées ou converties ; aucun test ne doit perdre sa raison d'être sans le dire.
- **Exports** : inchangés dans leur forme ; ils ne contiennent plus que du V2.

## Partie 2 — Lecture complète des métadonnées (AUD-28)

- Une **nouvelle** query réactive `getScreenWidgetMetadata` renvoie toutes les métadonnées normalisées du Screen, sans corps de note. Elle est bornée par les budgets de l'ADR : 100 placements au plus, métadonnées ≤ 16 Kio par widget, donc ≤ 1,6 Mio par Screen. Les corps restent chargés un par un par `getNoteContent`.
- **Transition de contrat** (revue F3c-02) : `listScreenWidgets` reste en place, paginée et compatible, pour les clients déjà ouverts et pour le retour arrière. Le nouveau client n'appelle plus que `getScreenWidgetMetadata`. Le retrait de `listScreenWidgets` est une tranche ultérieure, après au moins un déploiement complet du nouveau client. Le retour arrière vers F3c-1 redéploie frontend et backend ensemble ; les anciennes vues sont rechargées, comme pour A.
- Le client abandonne `usePaginatedQuery`, le cache des widgets connus et la relance de pagination (`src/features/gm/use-screen-widgets.tsx`), et lit directement la nouvelle query.
- Un dépassement de budget est refusé à l'écriture, comme aujourd'hui ; la lecture ne tronque jamais.
- Le test E2E d'AUD-28, une insertion en masse observée en direct, exige 100/100 sans rechargement, au lieu de simplement journaliser l'écart.

## Hors périmètre

Renommage physique de `gmNotes`, nouveau kind de widget, retrait du composant `migrations`, changement des budgets, exercice de restauration de la prod (à la charge de l'utilisateur, AUD-25).

## Critères d'acceptation

1. F3c-1 : `pnpm check` vert. L'inventaire est testé avec des fixtures V1, un payload en double, un payload orphelin et un placement orphelin, un payload ou un placement incompatible (mauvais kind, propriétaire, projet ou Screen), chacun détecté ; un cycle suppression, purge puis restauration d'une ancienne disposition qui reste à zéro en bloquant ; une base propre à zéro ; plusieurs pages.
2. F3c-2 :
   - `pnpm check` vert, `pnpm audit:convex` à 0, inventaire des fonctions de `docs/AUDIT.md` à jour ;
   - un test prouve que le schéma refuse un document V1 ;
   - aucune occurrence de `formatVersion` 1, de `MIGRATION_REQUIRED` ou de `by_screen_format` ne reste dans `convex/`, `shared/` et `src/`, hors historique documentaire.
3. AUD-28 : `listScreenWidgets` reste compatible (test de non-régression de son contrat paginé) ; l'E2E d'insertion en masse en direct atteint 100/100 dans la CI, sur plusieurs exécutions de la branche. AUD-28 passe à « corrigé » dans l'audit.
4. E2E CI verte. `docs/product.md`, les deux ADR et le journal sont à jour.

## Commandes de preuve

`pnpm check` · `pnpm audit:convex` · `grep -rn "MIGRATION_REQUIRED\|by_screen_format" convex shared src` (vide) · CI de branche, puis avance rapide de `main`, une fois par commit.
