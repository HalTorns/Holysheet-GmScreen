# Plan — Tranche F7 : catalogue d'objets et stocks des marchands

Références : [PRD](../PRD.md) §6 (« plusieurs marchands peuvent faire référence à un catalogue d'objets commun ; prix, descriptions, catégories, stocks et disponibilités. Une quantité propre au marchand ne doit pas écraser le modèle d'objet partagé »), §17 (le stock de deux marchands reste distinct pour un même objet) · [PLAN-F1](PLAN-F1.md) (bibliothèque de fiches, kinds `merchant` et `item` déjà présents) · [PLAN-F4](PLAN-F4.md) (widget fiche).

## Objectif

- Une fiche **objet** porte le modèle partagé : prix de référence, catégorie et description.
- Une fiche **marchand** porte ses lignes de stock. Chaque ligne référence une fiche objet et porte des valeurs propres à ce marchand : quantité (ou illimitée), prix appliqué éventuel, disponibilité.
- Modifier l'objet met à jour tous les marchands qui le vendent. Modifier une ligne de stock ne touche ni l'objet ni les autres marchands.
- Le widget fiche affiche en direct le stock d'un marchand pendant la partie, avec une vente rapide (−1).

## Modèle

1. **Table `gmItemProfiles`**, au plus une ligne par fiche objet :
   - champs : `ownerId`, `projectId`, `sheetId` (fiche de kind `item`), `price` (nombre ≥ 0, deux décimales au plus, ou absent), `currency` (texte court libre, ex. « po », puisque le produit ne dépend d'aucun système de JDR), `category` (texte court), `version` ;
   - index : `by_sheet` (unicité garantie en transaction), `by_owner`, `by_project_category` ;
   - la description reste le corps existant de la fiche (`gmSheetContents.body`), sans duplication.
2. **Table `gmMerchantStock`**, une ligne par couple (marchand, objet) :
   - champs : `ownerId`, `projectId`, `merchantId` (fiche `merchant`), `itemId` (fiche `item`), `quantity` (entier de 0 à 1 000 000, ou `null` pour illimité), `price` (prix appliqué, nombre ≥ 0, absent si c'est le prix de l'objet qui s'applique), `available` (booléen), `order`, `version` ;
   - index : `by_merchant`, `by_item`, `by_owner`, `by_merchant_item` (unicité garantie en transaction) ;
   - les deux fiches doivent appartenir au même projet et au même propriétaire, avec les bons kinds, vérifiés à chaque écriture.
3. **Limites** (constantes de `shared/`, hypothèses documentées) : 200 lignes par marchand, et 2 000 profils d'objet par projet, dans la limite de fiches déjà en place. Dépassement refusé avec un code explicite.

## Écritures

- `items.setProfile` : version attendue, comme les autres éditions.
- `merchants.addStock`, `merchants.updateStock` (version attendue), `merchants.removeStock`, `merchants.reorderStock`.
- **Vente et réassort en direct** : `merchants.adjustQuantity` applique un delta atomique, borné à 0, **sans version attendue côté client**. Deux ventes rapides depuis deux vues ne doivent pas en perdre une ; sur une ligne illimitée, l'appel est sans effet.
- **Contrat de version** (revue F7-03) : tout ajustement effectif **incrémente la version de la ligne** dans la même transaction. Une édition absolue en retard (`updateStock` avec une version périmée) est donc refusée en conflit, et le brouillon est conservé : une vente n'est jamais écrasée.
- Toutes les écritures passent par `requireUser`, la propriété du projet et le rate limiter (`resourceWrite` pour la structure, `gmEditorWrite` pour les ventes).
- **Pas d'historique d'annulation** pour les profils et le stock dans F7 (revue F7-02). L'historique existant ne porte que sur les notes et dispositions d'un Screen. L'étendre au niveau projet demande son propre schéma, avec autorisation, restauration et purge : c'est une tranche ultérieure, consignée dans l'ADR. Les conflits sont gérés par les versions.
- **Changement de kind d'une fiche** (revue F7-01) : `updateSheet` refuse (`SHEET_KIND_IN_USE`) de changer le kind d'une fiche objet référencée par des lignes de stock, et celui d'un marchand qui a des lignes de stock. Il faut d'abord retirer ces lignes. Un objet sans ligne de stock peut changer de kind : son profil éventuel est alors supprimé dans la même transaction.

## Lecture

- `merchants.getStock(merchantId)` : lignes triées, chacune avec son objet résolu (titre, prix de référence, catégorie, état vivant ou en corbeille) et son **prix effectif** (prix de la ligne, sinon prix de l'objet). Bornée à 200 lignes, donc au plus 200 lectures d'objets et 200 de profils.
- `items.getProfile(sheetId)` et `items.sellers(sheetId)` : les marchands qui vendent cet objet, paginés.
- Le sélecteur d'objets réutilise la recherche de fiches existante, filtrée sur le kind `item`.

## Interface

- **Fiche objet** : champs prix, devise et catégorie, plus la liste « Vendu par » (lien vers chaque marchand, avec quantité et prix effectif).
- **Fiche marchand** : tableau du stock. On y ajoute un objet depuis le catalogue (recherche) ou on le crée à la volée, ce qui crée une fiche objet. On y édite quantité, illimité, prix appliqué et disponibilité, on réordonne et on retire des lignes. Une ligne en rupture (quantité 0) ou indisponible est visible et marquée.
- **Widget fiche** sur un marchand : vue compacte du stock en direct, avec boutons −1 et +1 par ligne, désactivés en lecture seule ou en verrouillage. Le rendu statique (impression) liste objets, prix effectifs et quantités. Sur un objet, le widget affiche prix, catégorie et description.

## Cycle de vie

- **Fiche objet en corbeille** : ses lignes de stock restent et s'affichent « objet indisponible » ; la restauration les rétablit. **Purge de l'objet** : ses lignes de stock et son profil sont supprimés dans la même opération, par lots si besoin.
- **Purge d'un marchand** : ses lignes de stock sont supprimées.
- **Duplication d'une fiche** (si elle existe déjà) : dupliquer un marchand duplique ses lignes de stock, qui pointent vers les mêmes objets ; dupliquer un objet duplique son profil, sans lignes de stock. À vérifier dans le code de F1 et à aligner.
- Toutes les listes de tables du code (export de compte, nettoyage `cleanupJobs`, `scripts/snapshots.mjs`, `scripts/verify-restore.mjs`) incluent les deux tables. Les relations (kinds, projet, propriétaire, existence) y sont validées et font échouer la vérification si elles sont invalides. La fixture de restauration contient un marchand avec stock et un objet partagé par deux marchands.

## Hors périmètre

Transactions monétaires, bourse du joueur, achat par les joueurs, calculs de taux de change, génération aléatoire de stock, import de catalogue en lot, liaison des quantités aux variables (F2), présentation finale (chantier 3).

## Critères d'acceptation

1. Backend (convex-test) :
   - deux marchands partagent un objet : modifier le prix de l'objet change le prix effectif chez les deux ; la quantité de l'un ne change pas celle de l'autre (PRD §17) ;
   - prix appliqué prioritaire sur le prix de l'objet ;
   - deux `adjustQuantity` concurrents donnent la somme exacte, bornée à 0 ;
   - un `adjustQuantity` suivi d'un `updateStock` à version périmée est refusé en conflit ;
   - ajustement d'une ligne illimitée sans effet ;
   - changement de kind refusé pour un objet stocké et pour un marchand avec stock, via la vraie mutation `updateSheet` ; profil supprimé pour un objet sans stock ;
   - refus pour un kind inattendu, un autre projet, un autre compte, un doublon (marchand, objet) ou une limite dépassée ;
   - corbeille, restauration et purge d'un objet et d'un marchand, sans ligne orpheline ;
   - export et nettoyage de compte.
2. Navigateur (Vitest) : tableau de stock (édition, ligne illimitée, ligne indisponible ou objet en corbeille), widget marchand en direct, rendu statique.
3. E2E CI : créer deux marchands et un objet, les lier, vendre depuis un widget sur un Screen ouvert dans deux onglets (convergence en direct), changer le prix de l'objet et le voir chez les deux marchands, purger l'objet. Restauration non vide via `restore.spec.ts`.
4. `pnpm check` vert et `pnpm audit:convex` à 0, avec l'inventaire à jour. `docs/product.md`, un ADR court `decisions/merchants.md` et le journal sont à jour.

## Commandes de preuve

`pnpm check` · `pnpm audit:convex` · CI de branche (E2E), puis avance rapide de `main`.
