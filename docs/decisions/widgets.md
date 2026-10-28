# Socle de widgets typés

Décision du 28 octobre 2026 (chantier 2, F3), rédigée par Codex et arbitrée par Claude Code (voir l’arbitrage dans le plan). Références : [PRD §5–9](../../PRD.md), [plan F3](../PLAN-F3.md), décisions [données](screen-data.md), [éditeur](screen-editor.md), [outils](widget-tools.md) et [migrations](migrations.md).

## Contexte

Les notes de production ont des IDs `gmNotes` référencés dans les placements, les snapshots de disposition et `gmEditorHistory.subjectId`. Leur corbeille conserve les placements par profil dans `trashPlacements`. `gmWidgets.ts` gère déjà leur cycle de vie ; son nom ne désigne pas une table générique.

Changer seulement le rendu ne suffit pas : `getScreen`, `saveLayout`, la copie, la restauration et les validateurs supposent tous des notes. Les lectures de comptage chargent aussi les corps de 50 000 caractères. Il faut un contrat unique pour les douze catégories, sans recopier ces hypothèses dans chaque futur type, ni perdre l'historique des testeurs.

## Décision proposée

**Généraliser en place la table physique `gmNotes` en collection logique de widgets**, conserver ses IDs, et extraire le corps lourd des notes dans `gmWidgetContents`. Le nom physique historique est une dette assumée, documentée ici ; les types, fonctions et composants nouveaux emploient « widget ». Aucun renommage physique en `gmWidgets` dans F3.

- `gmNotes` au format 2 : champs communs actuels, `formatVersion: 2`, puis union stricte discriminée par `kind`, contenant `config` et `state`. Un `kind` inconnu est refusé ; aucun dictionnaire de configuration libre, champ de code ou moteur de plugins.
- Pour `note`, `config: {}` et `state: {}` ; son texte est le payload dans `gmWidgetContents`, unique par `widgetId: Id<'gmNotes'>`. La version du widget couvre aussi le corps ; aucune seconde version de contenu. Les autres types F3 restent petits et portent leur état dans `gmNotes`.
- `gmWidgetContents` : `ownerId`, `projectId`, `screenId`, `widgetId`, `body`, `updatedAt`, `formatVersion: 2` ; index `by_owner`, `by_widget`. Toute écriture assure l'unicité transactionnellement et valide le widget parent.
- Les placements passent de `noteId` à `widgetId`, toujours de type `Id<'gmNotes'>`. Géométrie, groupe et style restent dans chaque profil. `trashPlacements` garde sa forme : il ne contient déjà aucun `noteId`.
- Les snapshots deviennent typés pour tous les widgets ; une note conserve son corps dans le snapshot, jamais une référence vers son corps courant. `subjectId`, versions de concurrence, dates et IDs historiques sont conservés. `formatVersion` est distinct de `version`.

Le modèle fournit une seule identité et un seul cycle de vie. Pour F4–F8, chaque catégorie ajoute une branche validée et un rendu numérique/statique ; les contenus volumineux vont dans un payload séparé, les fiches/variables/fichiers restent des références contrôlées. Aucune réserve de données arbitraires pour anticiper ces tranches. Le code personnalisé du PRD §10 nécessitera son ADR de sécurité en F8.

## Alternatives

| Option | Bénéfice | Coût et risque |
| --- | --- | --- |
| Nouvelle table `gmWidgets`, remplacement des notes | Nommage propre immédiatement, modèle unique | Tous les IDs changent ; mapping durable, reprise des doubles écritures, réécriture des sujets d'historique et de tous les placements archivés, risque de copies orphelines. Un simple renommage de table ne conserve pas les IDs Convex |
| `gmNotes` et table parallèle pour les nouveaux types | Peu de transformations initiales des notes | Deux voies permanentes pour droits, versions, limites cumulées, historique, copie et corbeille ; placements à références alternatives. Cette complexité se propage aux douze catégories |
| **Généralisation en place + payload séparé** | Identités conservées, un seul cycle de vie, comptages légers | Nom physique trompeur et migration de forme réelle, avec lecture transitoire V1/V2 ; une table de payload à exporter/nettoyer |

La troisième option minimise la réécriture des relations, sans reporter le problème des budgets de lecture. Ne pas maintenir simultanément deux sources de vérité pour le corps.

## Migration et déploiement

Appliquer l'[ADR migrations](migrations.md) avec `@convex-dev/migrations` 0.3.7 prévu par C1, sous réserve de vérification des pairs et de la documentation par le builder. Aucune mise à niveau implicite de Convex 1.46.0. Migrations et suivi restent internes.

**Préalable opérateur : AUD-25**, sauvegarde de production vérifiée et exercice de restauration sur cible isolée, avant tout lancement de migration. La restauration CI du backend jetable ne satisfait pas ce préalable. Le builder prépare le code/runbook ; l'utilisateur choisit la cible et déploie.

1. **Déploiement A, expansion (F3a).** Schémas acceptant V1 (absence de `formatVersion`) et V2 pour widgets, dispositions et historique ; nouvelle table de payload. Adaptateurs purs de lecture des deux formes ; écritures V2 uniquement. Les anciennes mutations de notes restent des façades du même service. Sur une note V1, la première écriture convertit atomiquement le corps puis applique l'édition ; elle n'efface pas un brouillon concurrent. Les APIs de disposition tolèrent les deux clés en entrée, mais rejettent références doubles, doublons et mélange incohérent. Les retours utilisés par le nouveau client sont normalisés. Les nouveaux kinds restent absents de cette livraison.
2. **Déploiement B, exécution.** Migrer par passes ordonnées : (a) notes vivantes et supprimées ; (b) dispositions numériques et papier ; (c) historique de note et de disposition. Lots initiaux de 5 documents, bornés en octets ; aucune transaction à l'échelle du projet/Screen. Chaque note crée son payload et retire `body` dans la même transaction ; un document déjà V2 est ignoré, jamais réécrit à partir d'une copie ancienne. Chaque disposition/snapshot remplace la clé de référence, sans changer l'ID référencé. Les lecteurs mixtes rendent les passes indépendantes ; une édition concurrente est sérialisée par Convex et relue à la reprise. Conserver `version`, `updatedAt`, `_id`, `_creationTime`, `deletedAt`, styles et groupes ; convertir le format ne crée pas de révision utilisateur.
3. **Déploiement C, contraction.** Après état « terminé » de chaque passe **et** inventaire paginé sans V1, vérifier unicité des payloads, absence d'orphelins, relations, comptes et export/restauration. Puis seulement retirer V1 des validateurs et façades devenues inutiles, imposer `formatVersion: 2` et publier F3b. Faire recharger les vues de l'ancien client avant contraction. Une archive V1 se restaure avec A, puis suit B avant C ; ne pas importer directement une archive V1 dans le schéma contracté.

En A/B, chaque chemin d'écriture, y compris restauration, duplication et historique, doit produire V2 ; aucun ancien endpoint ne peut réintroduire V1. Les lectures transitoires utilisent des pages de 10 au plus : pas de `take(100)` sur des notes lourdes. Un index temporaire `by_screen_format` (`screenId`, `formatVersion`) détecte au plus une note V1 ; tant qu'il en reste, les opérations structurelles de ce Screen refusent avec `MIGRATION_REQUIRED` et un message de maintenance. Lire/modifier le texte reste possible. Paginer un comptage dans une même mutation ne réduirait pas les octets cumulés lus. Après conversion des notes du Screen, les contrôles portent sur les métadonnées légères. Le déploiement A coordonne backend/frontend et demande le rechargement des vues anciennes ; on ne promet pas la compatibilité du vieux client avec le nouveau contrat de lecture. Les nouvelles fonctionnalités ne sont activées qu'après contraction.

## Retour arrière

- Interruption en B : arrêter le runner, conserver A qui lit les deux formats, corriger puis reprendre. L'idempotence porte sur chaque document et sur chaque passe.
- Après B/C : revenir au code **A compatible**, qui reste le point de retour fonctionnel ; jamais redéployer directement le `main` antérieur au format 2. Avant F3b, A suffit à relire toutes les notes migrées.
- Après création de nouveaux kinds, le point de retour doit aussi les comprendre (version compatible F3b). Aucun convertisseur inverse ne les transforme en notes. Revenir à une sauvegarde antérieure sacrifierait les écritures ultérieures : restauration destructive distincte, arbitrée et autorisée par l'utilisateur, jamais un rollback automatique.

## Budgets, cycle de vie et preuves

Le [plan](../PLAN-F3.md) fixe les bornes : 100 widgets vivants et 100 supprimés par Screen, huit profils, documents légers ≤ 16 Kio, corps de note ≤ 200 Kio avec la limite existante de 50 000 caractères. Les corps ne sont plus lus pour compter, valider une disposition ou charger sa structure ; lectures de contenu paginées à dix maximum. Les budgets incluent les snapshots relus par la rétention, pas uniquement les documents modifiés.

`gmWidgetContents` entre dans `gmTables`, `gmCollection`, `gmDocument`, l'export, le nettoyage et les fixtures de restauration. Purger une note retire son payload et ses vingt révisions ; la corbeille garde le payload. Tous les kinds réutilisent duplication, profils, styles et groupes ; une copie de compteur lié conserve sa référence, sans dupliquer la variable.

Tests de migration sur des documents **V1 réels par leur forme**, repris des fixtures backend et des parcours `screen-editor`/`widget-tools` de restauration : absence de champs optionnels anciens, notes multioctets, supprimées, historique plein, profils papier/numériques, styles/groupes. Exécuter le vrai point d'entrée interne de migration, interrompre/reprendre, vérifier second passage sans effet, édition entre deux passes, lecture, export, purge et nettoyage. Aucune lecture de données ou secrets de production pour constituer ces fixtures. La CI doit aussi restaurer des documents V2 de chaque nouveau kind et un payload de note non vide.
