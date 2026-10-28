# Plan — Chantier 2, tranche F3 : widgets typés, checklists, compteurs et dés

Références : [PRD §5–9](../PRD.md) · [BRIEF](BRIEF.md) · [feuille de route F1](PLAN-F1.md) · [F2](PLAN-F2.md) · [ADR widgets](decisions/widgets.md) · [migrations](decisions/migrations.md) · [AUDIT](AUDIT.md).

Proposition du 28 octobre 2026 pour revue/arbitrage Claude Code, depuis `main e4ba1f7`, branche `codex/f3-widgets`. Ce document ne vaut ni validation du plan ni autorisation de déploiement.

## Objectif et découpage

Ajouter trois widgets utilisables en partie, synchronisés entre vues du propriétaire, sur un socle commun qui conserve les notes et leur historique. Deux work orders successifs pour un builder :

| Lot | Livraison et condition de sortie |
| --- | --- |
| **F3a — modèle et migration** | Union typée (note seule activée), extraction du corps, adaptation de l'éditeur et du cycle de vie, migrations A/B/C testées, export/nettoyage/restauration. Notes sans régression et preuves locales/CI avant F3b |
| **F3b — nouveaux kinds** | Checklist, compteur autonome/lié, dés ; contrôles accessibles, rendu statique et tests. Publication des nouveaux kinds seulement après vérification de la migration en production |

Les trois étapes opérationnelles A/B/C de l'ADR peuvent nécessiter des révisions séparées de déploiement au sein de F3a ; ne pas retirer la compatibilité simplement parce que les tests locaux passent. **AUD-25 est un préalable avant que l'utilisateur lance une migration de production** : sauvegarde vérifiée, copie indépendante et exercice de restauration réel. Aucune commande de prod dans le work order de construction.

## Modèle et limites

Décision recommandée : conserver les IDs de `gmNotes`, généraliser cette table en widgets et extraire les corps dans `gmWidgetContents`. Le nom physique demeure ; pas de seconde population de widgets ni de mapping d'IDs. Détails du déploiement, de la reprise et du retour dans l'[ADR](decisions/widgets.md).

Champs communs : `ownerId`, `projectId`, `screenId`, `updatedAt`, `version`, `deletedAt?`, `trashPlacements?`, `formatVersion: 2`. Union Convex/Zod stricte portant sur **l'objet complet** : `kind`, `config`, `state` cohérents ; pas trois unions indépendantes permettant de combiner les types. Schémas partagés via `@shared/zod`, sans `any` ni `eval`. Le kind d'une instance est immuable en F3.

| Kind | Configuration et état persistés | Bornes / comportements |
| --- | --- | --- |
| `note` | `config: {}`, `state: {}` ; `body` dans le payload unique `gmWidgetContents` | 50 000 unités UTF-16 comme aujourd'hui ; enveloppe de contenu ≤ 200 Kio, sans normalisation/troncature des anciennes notes |
| `checklist` | `config: { title, items: [{ id, label }] }` ordonné ; `state: { checkedIds: string[] }` | Titre ≤ 120 caractères, 40 items, libellé 1–80 ; IDs ASCII stables 1–40, uniques. Cases uniques, sous-ensemble des IDs ; suppression d'un item retire sa case. Réordonner conserve IDs et état |
| `counter` autonome | `config: { title, source: { type: 'local', step, min?, max? } }`, `state: { value }` | Nombres finis ; `step > 0`, `min ≤ max`, valeur dans les bornes. Toute opération donnant un résultat non fini/hors bornes est refusée, sans saturation silencieuse |
| `counter` lié | `config: { title, source: { type: 'variable', variableId, step } }`, `state: {}` | Variable **number** du même projet et propriétaire, jamais formula/texte/booléen. Pas de valeur locale ni de copie des bornes : valeur/min/max viennent de la variable |
| `dice` | `config: { title, expression }`, `state: {}` | Expression ≤ 40 caractères, grammaire unique `NdS[+K | -K]`, espaces autorisés autour des termes ; N 1–100, S 2–1000, K entier entre −10 000 et 10 000 ; ni références, ni fonctions, ni jets explosifs |

Le titre des nouveaux kinds peut être vide (≤ 120) ; un libellé de type sert alors de titre accessible. Configurations initiales : liste vide, compteur local `0`/pas `1`, dés `1d20`.

**Budgets serveur**, à matérialiser par constantes et tests avec texte multioctets (Kio = 1024 octets) :

- 100 widgets vivants **tous kinds cumulés**, 100 en corbeille par Screen ; huit profils dont papier ; copie/suppression par lots de vingt. Aucun quota multiplié par kind. `take(limite + 1)` sur métadonnées/index, pas de lecture de payload pour compter.
- Métadonnées/config/état et `trashPlacements` d'un widget ≤ **16 Kio** ; disposition et snapshot de disposition ≤ **48 Kio**, 100 placements maximum. Contrôler les octets et les bornes des champs, en conservant les anciennes valeurs valides. Le corps d'une note et son snapshot ont une enveloppe de **200 Kio** ; les autres snapshots ≤ 16 Kio. Budgets incluant champs système et références, pas seulement la taille du texte. Vérifier les fixtures V1 maximales avant d'imposer ces seuils ; un dépassement interdit la contraction, jamais les données ne sont tronquées.
- `getScreen` devient une lecture de structure (Screen et ≤ huit profils) ; `listScreenWidgets`, paginée à dix, renvoie les widgets normalisés sans corps de note. Après contraction, ≤ 1,6 Mio de métadonnées par Screen au total. Une query `getNoteContent` par note affichée charge un seul corps ; ne pas reconstruire un `getScreen` qui hydrate cent corps dans la même transaction. Le client agrège les pages réactives ; au plus cent abonnements de corps, à surveiller sans ajouter de cache local.
- Migration transitoire : `by_screen_format` détecte une note V1 ; bloquer les opérations structurelles sur ce Screen (`MIGRATION_REQUIRED`), permettre lecture paginée et édition des notes. Une lecture de page V1 reste ≤ 2 Mio. Suppression de ce garde/index après inventaire final. Les versions de concurrence ne changent pas lors des seules transformations de format.
- Historique : vingt snapshots par sujet, pages de dix. La rétention actuelle relit jusqu'à 21 snapshots dans `recordHistory` : une copie de vingt notes pleines lit ≤ 4 Mio de corps, huit historiques de dispositions ≤ 7,875 Mio, métadonnées/profils environ 2 Mio ; cible **< 15 Mio cumulés** avec marge sous 16 Mio. Instrumenter les lectures du scénario maximal ; si l'enveloppe ne tient pas, corriger la rétention dans F3a, sans réduire silencieusement le lot de vingt ni supprimer de révisions.
- Export : pages serveur ≤ dix pour `gmNotes`, `gmWidgetContents`, `gmEditorHistory` et `gmSheetContents` ; cinquante pour les autres. Nettoyage, pendant et après transition : lots 5 pour `gmNotes`/`gmWidgetContents`/`gmSheetContents`, 10 pour `gmEditorHistory`, 20 pour les autres ; somme GM visée **< 8 Mio** par transaction, avec contenus et snapshots pleins. Migration : cinq documents par lot initial ; vérifier aussi limites d'écriture et taille des retours.

Ajouter `gmWidgetContents` à `gmTables`, `gmCollection`, `gmDocument`, avec validateurs d'export des formes transitoires. Index `by_owner` et `by_widget`. Index actuels de `gmNotes` préservés. `gmLayouts.formatVersion` et `gmEditorHistory.formatVersion` distinguent les références/snapshots V1/V2. Les placements et leur géométrie restent embarqués, `noteId → widgetId` avec le même ID ; pas de table de placements.

## API et droits

Toute fonction publique valide arguments **et retours**, appelle `requireUser` puis les helpers de propriété, et vérifie Screen/projet, instance vivante et références. Inaccessible : `NOT_FOUND` (ou `null` pour la lecture unitaire existante). `formatVersion` est choisi par le serveur, jamais fourni comme droit d'écriture. Chaque `expectedVersion` est un entier sûr positif ou nul ; écart : `CONFLICT`, aucun écrasement du brouillon.

| Contrat (noms cibles) | Autorisation / validation | Concurrence et débit |
| --- | --- | --- |
| `gm.getScreen`, `gmWidgets.listScreenWidgets`, `getNoteContent`, `listTrash` | Screen/projet possédés ; contenu seulement pour une note vivante possédée ; pages ≤ 10 ; corbeille sans hydrater tous les corps | Queries réactives, pas de limite d'écriture ; validateurs mixtes en A/B |
| `gmWidgets.addWidget(screenId, kind)` | Screen non verrouillé ; limite globale ; valeurs initiales validées ; placement dans tous les profils, papier compris | `resourceWrite` 30/min ; transaction atomique, version initiale 0 |
| `updateWidget(id, expectedVersion, config, state)` et façade `gm.updateNote` | Union du kind courant ; texte via helper de payload ; lien validé côté serveur ; pas de changement de kind | `gmEditorWrite` 120/min, rafale 60 ; version +1 et historique atomiques ; identique = sans effet ; note conserve l'autosauvegarde |
| `setChecklistItem(id, expectedVersion, itemId, checked)` ; `setCounterValue(id, expectedVersion, value)` local | Item existant ou compteur local ; validation de l'état complet et des bornes ; autorisés en disposition verrouillée | Même version/historique/budget `gmEditorWrite` ; aucun toggle aveugle sur état périmé |
| `gmVariables.setVariableValue(id, value)` pour compteur lié | Contrat F2 conservé : variable possédée, type et bornes actuels validés. Liaison widget préalablement validée dans `updateWidget` | `resourceWrite` 30/min ; **sans expectedVersion**, dernière valeur absolue validée gagnante, version variable +1 ; pas d'écriture dans le widget |
| `updateLayout`, profils, duplication/collage, corbeille/restauration/purge | Généralisations des endpoints actuels ; non verrouillé ; lot ≤ 20, versions des sources et du profil ; purge confirmée depuis corbeille | Versions et budgets actuels : disposition `gmEditorWrite`, structure `resourceWrite`. Pas de double débit pour les façades |
| `listHistory`, `restoreRevision` | Sujet possédé et vivant ; restauration valide selon le kind courant, pas de conversion de kind ; contrôle actuel du verrouillage pour la géométrie | Version attendue ; restauration = nouvelle écriture avec capture du remplacé ; rétention 20 ; corps de note inclus |
| Migrations, contrôle final et reprise | `internalMutation`/runner du composant ; aucune API utilisateur de migration | Idempotents, lots bornés ; ne consomment pas de versions ni d'historique utilisateur |

Les actions sur l'état restent permises en mode verrouillé ; création, géométrie, profils, cycles de vie et **configuration des nouveaux widgets** sont bloqués côté serveur. Préserver l'édition du texte des notes verrouillées. Si `updateWidget` change config et état, un changement de config sous verrouillage refuse toute la transaction. La lecture seule locale désactive toutes les écritures et le lancer de dés ; elle n'est pas une permission serveur.

Compteur lié : s'abonner à `gmVariables.listVariables` une fois par projet/vue ; pas de copies des valeurs dans React hors saisie provisoire. Les boutons calculent la prochaine valeur à partir de la valeur affichée, désactivés pendant leur requête. Deux vues peuvent proposer la même valeur absolue : **F3 ne garantit pas des incréments concurrents cumulatifs**, conformément au contrat F2. Erreurs de borne/rate limit visibles, pas de répétition automatique. Toute modification de variable se reflète dans les autres compteurs, la page Variables et les formules.

Renommer la variable conserve le lien par ID. Suppression ou changement de type reste autorisé selon F2 : afficher « Variable indisponible », désactiver les actions, permettre de relier/détacher explicitement en édition ; aucun retour automatique vers une valeur locale. Lier remplace la valeur autonome après confirmation. Détacher une source valide capture sa valeur courante dans la transaction ; si indisponible, demander une valeur locale explicite. Restaurer une ancienne configuration liée exige une référence encore valide et n'écrit jamais une ancienne valeur dans la variable.

## Interface et contrats conservés

Réutiliser `screen.tsx`, `layout-editor.tsx`, `widget-tools.tsx`, `revision-history.tsx` et `use-editor-draft.ts`. Garder « Ajouter une note » et ajouter un sélecteur « Type de widget » avec action « Ajouter un widget » pour les trois nouveaux kinds. Chaque rectangle utilise un dispatch exhaustif typé ; les événements des contrôles internes ne démarrent pas un déplacement. Chargement/erreur de contenu dans son rectangle, sans casser tout le Screen.

- Checklist : édition du titre/items, ajout/suppression, boutons « Monter/Descendre » au clavier ; cases natives libellées. Cocher persiste immédiatement avec statut et erreur ; la configuration utilise le mécanisme de brouillon/autosauvegarde existant, pas une écriture à chaque frappe.
- Compteur : valeur numérique lisible, boutons « Augmenter/Diminuer », champ de saisie avec validation explicite ; paramètres pas/bornes ou choix d'une variable nombre du projet. Exposer nom et bornes de la source, et un lien vers la page Variables.
- Dés : champ d'expression configuré, bouton « Lancer », liste des dés et total dans une région `aria-live="polite"`. Analyse bornée sans dépendance ; `crypto.getRandomValues` avec rejet des valeurs hors multiple de S avant modulo, jamais `Math.random`. RNG absent : erreur et bouton indisponible. Un lancer produit au plus cent résultats, sans animation ni boucle non bornée sur une entrée utilisateur.
- **Résultats de dés non persistés en F3** : dernier résultat en mémoire de la vue seulement, indiqué dans l'interface ; perdu au rechargement, non synchronisé et absent de l'export/historique. Seule l'expression est partagée. Aucun endpoint de lancer, aucune prétention de preuve anti-triche.
- Libellés distincts par widget, focus préservé après réordre/suppression, contrôles natifs clavier, erreurs `role="alert"`, attente/enregistrement `role="status"`. Pas de refonte de l'éditeur dans ce lot.

| Comportement | Notes existantes | Nouveaux kinds |
| --- | --- | --- |
| Autosauvegarde 1500 ms, explicite, brouillon/conflit, garde de navigation | Inchangé, y compris saisie pendant requête et annuler/refaire du texte | Configurations avec même protection et annuler/refaire ; interactions d'état immédiates, sans brouillon différé |
| Historique durable et restauration | Corps complet, vingt versions ; anciennes révisions restaurables | Configuration + état local (cases/valeur autonome), vingt versions, restauration explicite ; compteur lié : référence seulement, dés : expression seulement |
| Annuler/refaire de disposition | Inchangé | Tous kinds ; ne ressuscite aucun widget supprimé |
| Duplication/collage dans la vue | Corps indépendant, contrôle de version | Configuration/état local copiés indépendamment ; compteur lié garde sa source commune, dés sans résultat local copié ; pas de copie de variable ni d'historique |
| Corbeille, restauration, purge | Corps/historique conservés puis purgés comme aujourd'hui | Tous kinds ; restaurer placements/styles, détacher groupes et ajouter placement dans les nouveaux profils ; purge ne supprime jamais une variable |
| Groupes, sélection, alignement, styles, profils | Inchangé | Identique pour tous, y compris sélection mixte ; contenu/état commun, géométrie/style propres au profil |
| Rendu statique / profil papier | Texte actuel | Cases et libellés, valeur actuelle du compteur ou erreur, expression de dés (sans résultat disponible) ; sans contrôles interactifs. Pas encore de parcours PDF/impression |

Les mutations d'état immédiates ne créent pas une pile locale d'annuler/refaire supplémentaire ; elles sont restaurables via l'historique du widget, sauf valeur de variable qui suit F2 (pas d'historique des valeurs). Une actualisation externe de variable ne modifie pas la version du widget ; le copier/coller contrôle sa configuration, pas la valeur externe à l'instant de copie.

## Non-objectifs

F4–F8 (autres catégories, texte riche, fiches liées, médias, initiative, horloges, PDF, stockage, iframe et code personnalisé PRD §10), pop-ups et ensembles de fenêtres, import/export de projet, impression/PDF, communauté, moteur de règles et dés avancés, historique des valeurs de variables. AUD-21 à AUD-23 et identité visuelle restent au chantier 3. Pas de nouveau framework, service ou dépendance, sauf le composant de migration déjà retenu par C1.

## Preuves et critères d'acceptation

Le builder commence par versions/lockfile/`docs/upgrades.md`, puis Context7 `resolve-library-id` et `query-docs` sur le concept utilisé (migration/reprise, unions Convex, subscriptions React). Si indisponible ou version non indexée, lire types/sources et documentation officielle compatible, consigner l'écart sans mettre à jour les dépendances.

1. **F3a, migration réelle**, `tests/backend/gm-widget-migrations.test.ts` : fixtures V1 issues des insertions actuelles `gm.test.ts`, `gm-editor.test.ts`, `gm-widgets.test.ts` et formes laissées par les E2E de restauration, sans les créer par une API V2. Exécuter le runner interne réel sur notes actives/supprimées, corps multioctets pleins, styles/groupes, huit profils dont papier, vingt révisions et `trashPlacements`. Vérifier IDs/dates/versions, texte et géométrie identiques, historique restaurable, second passage sans effet, interruption/reprise et édition entre passes, refus structurel transitoire, export, purge et nettoyage en formes mixtes puis V2. Les tests actuels ne possèdent pas la conversion de format : les conserver et adapter leurs contrats de lecture.
2. **Budgets et cycle de vie**, compléter `tests/backend/gm*.test.ts` : scénarios maximaux ci-dessus, 100 widgets mixtes + 100 supprimés, vingt duplications pleines et huit historiques pleins ; pages d'export bornées ; nettoyage avec contenus F1 pleins ; aucun payload orphelin après purge/nettoyage. Les doubles de test ne prouvent pas les limites du service : mesurer les octets lus par le contexte de test et compléter en CI par le backend réel pour le cas maximal. Tout dépassement bloque F3a.
3. **F3b backend** : création/validation de chaque kind, réordre sans perdre les cases, conflits d'état/config, bornes et nombres non finis, source inter-projet/inter-compte/formule refusée, suppression/changement de type de source, historique sans effet sur la variable ; tous endpoints refusés pour anonyme/autre compte ; verrouillage, limites globales, copie/corbeille/purge de chaque kind. Couvrir la version variable qui avance et le conflit d'un éditeur F2 après une action du compteur lié.
4. **Unitaires/navigateur** : `tests/unit/dice.test.ts` (grammaire, bornes, résultats et branche de rejet RNG avec source injectée dans un helper pur, sans export de production réservé aux tests) ; tests React de configuration/conflits et cases accessibles, sans recopier les tests déjà propriétaires de `useEditorDraft`. Ne pas tester la qualité statistique avec une assertion aléatoire fragile.
5. **E2E CI**, étendre `tests/e2e/holysheet.spec.ts` avec helper de kinds, conserver `screen-editor.ts` et `widget-tools.ts` : créer par l'UI une checklist, un compteur et des dés ; cocher/réordonner/recharger ; configurer `2d6+1`, lancer et vérifier bornes/total ; lier le compteur à une variable nombre, l'incrémenter et constater la nouvelle valeur sur la page Variables et dans une seconde vue. Tester lecture seule et verrouillage, au moins une copie/suppression/restauration de nouveau kind et une sélection mixte. Avant `verifyLocalRestore`, laisser chaque kind, une note non vide, une corbeille et de l'historique. La boucle `gmTables` doit compter aussi `gmWidgetContents > 0` ; ajouter assertions sur présence des kinds et leurs relations dans les données restaurées (les seuls comptes ne prouvent pas le format). Garder la comparaison canonique et les protections de confidentialité de `backup.ts`/du runner.

Commandes de preuve du builder (noms des fichiers nouveaux ci-dessus contractuels) :

```sh
pnpm test:ci tests/backend/gm-widget-migrations.test.ts
pnpm test:ci tests/backend/gm.test.ts tests/backend/gm-access.test.ts tests/backend/gm-editor.test.ts tests/backend/gm-widgets.test.ts tests/backend/gm-variables.test.ts
pnpm test:ci tests/unit/dice.test.ts
pnpm check
pnpm audit:convex
git diff --check
```

En F3a, la commande dice attend F3b. L'inventaire public/interne de `docs/AUDIT.md` est mis à jour par le builder, pas seulement le script. `pnpm check` doit être vert sous Node 26.11.1 ; rapporter les résultats réels, notamment Browser Mode si Chromium manque.

**E2E et backend réel uniquement en CI, aucun Docker local disponible.** Sur l'instance jetable du workflow, après setup/déploiement local existants :

```sh
pnpm backend:push
pnpm test:e2e:local -- tests/e2e/holysheet.spec.ts
```

Le parcours lance déjà `pnpm backup:verify` via `verifyLocalRestore`. Ajouter `tests/e2e/widget-budgets.spec.ts` pour le scénario maximal sur backend réel : identité synthétique distincte, préparation par les APIs métier existantes, respect des quotas sans les désactiver, délai de test de quinze minutes et nettoyage dans `finally`. La commande CI devient alors `pnpm test:e2e:local -- tests/e2e/holysheet.spec.ts tests/e2e/widget-budgets.spec.ts`. Aucun endpoint de production destiné au test. Une CI verte, son rapport de restauration, puis inspection neuve APPROVED sont requis ; ne pas annoncer ces preuves depuis une simple exécution Vitest. Aucun commit/push dans le work order sans demande du coordinateur.

## Risques et arbitrage

| Risque | Décision / mitigation |
| --- | --- |
| Nom `gmNotes` désormais générique | Dette de nommage assumée pour préserver les IDs ; isoler les types/helpers de domaine, documenter l'exception |
| Migration de données de testeurs | A/B/C, lecture mixte, courte indisponibilité structurelle par Screen, contrôles d'intégrité, retour au code compatible ; AUD-25 bloque l'exécution prod, pas la préparation |
| Charge des snapshots et abonnements | Séparer les corps, bornes en octets, scénario maximal incluant rétention et mesures backend réel ; pas seulement un test avec une note vide |
| Compteurs cliqués très vite ou depuis deux vues | Quotas F2 conservés, attente visible ; dernière valeur absolue gagnante explicitée, pas d'incrément atomique promis |
| Croissance du périmètre | Deux work orders ; persistance des résultats de dés et refonte UX reportées |

Arbitrage demandé au coordinateur : accepter la généralisation **en place** et sa dette de nommage plutôt que le transfert vers `gmWidgets`, ainsi que le découpage F3a/F3b. Les bornes proposées sont techniques et réversibles, pas de nouveaux quotas métier validés. Aucun autre point bloquant pour préparer F3a ; l'état réel des sauvegardes de production reste à fournir par l'opérateur avant migration.

## Arbitrage du coordinateur (Claude Code, 28 octobre 2026)

1. **Généralisation sur place acceptée** : `gmNotes` devient la collection physique des widgets, et la dette de nommage est assumée. On préserve ainsi les IDs, l'historique et les placements des testeurs, sans table de correspondance.
2. **Découpage accepté et précisé** :
   - **F3a** livre le déploiement A (expansion, lecture V1/V2, écritures V2) et la migration B (runner interne, idempotent et testé), dans une même révision de code ;
   - la **contraction C** devient une tranche **F3c** séparée, construite seulement après que l'utilisateur a exécuté et vérifié la migration en production (AUD-25 d'abord) ;
   - **F3b** (checklist, compteur, dés) n'attend pas la migration en production : les nouveaux kinds naissent en V2 et le code A lit les deux formats. Seule la contraction attend la prod.
3. Bornes, budgets, scénario maximal en CI (`tests/e2e/widget-budgets.spec.ts`) et commandes de preuve : **acceptés tels quels**.
4. Rôles : Codex a rédigé ce plan et l'ADR, et Claude les a revus et arbitrés. Codex construit F3a puis F3b, chacun dans une session neuve. Claude inspecte chaque livraison, car il est le fournisseur opposé au builder.
