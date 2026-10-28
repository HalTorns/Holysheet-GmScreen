# Plan — Chantier 2, tranche F2 : variables typées et formules

Références : [PRD §8](../PRD.md) (« Variables typées du projet, formules et calculs automatiques ; détecter/refuser les cycles de dépendance et valider les entrées. Aucun moteur de script libre requis ») · [PLAN-F1](PLAN-F1.md) · journal [PLAN-REVIEW-LOG](PLAN-REVIEW-LOG.md)

## Objectif

Chaque projet dispose de variables nommées et typées (nombre, texte, booléen, formule), visibles et modifiables sur une page dédiée. Les formules calculent automatiquement des nombres à partir d'autres variables. Les cycles de dépendance et les entrées invalides sont refusés côté serveur, et tous les calculs sont recalculés en direct.

Les compteurs et widgets liés à ces variables arrivent en F3.

## Modèle de données

Nouvelle table `gmVariables`, ajoutée à `gmTables`, `gmCollection` et `gmDocument` (export, nettoyage, restauration) :

- Champs communs : `ownerId`, `updatedAt`, `projectId`, `name`, `label`, `version`.
  - `name` : identifiant `^[A-Za-z_][A-Za-z0-9_]{0,39}$`, unique dans le projet (insensible à la casse, via `nameKey` en minuscules indexé).
  - `label` : libellé affiché, au plus 120 caractères.
  - `version` : concurrence optimiste.
- Partie typée, sous forme d'union discriminée par `type` :
  - `number` : `value: number` fini, `min?` et `max?` (bornes incluses), refus de la valeur hors bornes ;
  - `text` : `value: string` d'au plus 2 000 caractères ;
  - `boolean` : `value: boolean` ;
  - `formula` : `expression: string` d'au plus 500 caractères et `dependencies: string[]`, les noms en minuscules extraits par le parseur.
- Index : `by_owner`, `by_project` (`projectId`), `by_project_name` (`projectId`, `nameKey`).
- Limite : `GM_MAX_VARIABLES = 200` par projet. Les documents sont petits (moins de 3 ko), donc 200 variables pèsent moins de 1 Mo. La lecture de toutes les variables d'un projet pour le calcul tient dans le budget d'une transaction.

## Formules (`shared/formula.ts`, partagé entre client et serveur)

- **Grammaire bornée**, sans `eval` ni moteur de script :
  - nombres décimaux ;
  - références à des variables (identifiants) ;
  - opérateurs `+ - * / %`, moins unaire, parenthèses ;
  - fonctions `min(a, b, …)`, `max(…)`, `abs(x)`, `floor(x)`, `ceil(x)`, `round(x)`.
  - Priorités usuelles, associativité à gauche.
- **Bornes** : expression d'au plus 500 caractères, profondeur d'imbrication d'au plus 32, au plus 200 nœuds dans l'arbre.
- **Erreurs** :
  - à l'analyse, sous forme de résultat typé `{ ok: false, error: { code, position } }` ;
  - à l'évaluation, sous forme de codes stables : `DIVISION_BY_ZERO`, `UNKNOWN_VARIABLE`, `NOT_A_NUMBER` (la référence vise un texte ou un booléen), `CYCLE`, `NON_FINITE`, `DEPENDENCY_ERROR` (une dépendance est en erreur).
- **Évaluation d'un projet** : `evaluateProject(variables)` renvoie, pour chaque variable, sa valeur calculée ou un code d'erreur. On procède par ordre topologique avec mémoïsation, sans récursion non bornée : la profondeur est limitée par les 200 variables. Une formule ne référence que des variables de type `number` ou `formula`.

## API Convex (`convex/gmVariables.ts`)

Chaque fonction applique `requireUser`, `ownedProject` ou un nouveau `ownedVariable`, `limitUserOperation` sur les écritures, et a des validateurs de retour.

| Fonction | Contrat |
| --- | --- |
| `listVariables` | `projectId` → toutes les variables du projet (au plus 200) avec, pour chacune, `computed` : `{ value }` ou `{ error }`, issu de `evaluateProject` côté serveur |
| `createVariable` | `projectId`, `name`, `label`, définition typée ; refus du nom invalide (`INVALID_INPUT`), du doublon (`NAME_TAKEN`), de la limite (`VARIABLE_LIMIT`) ; une formule est analysée (`INVALID_FORMULA`), puis on refuse le cycle en simulant le graphe avec la nouvelle variable (`CYCLE`) |
| `updateVariable` | `id`, `expectedVersion`, `name`, `label`, définition typée ; le nom suit les mêmes règles qu'à la création (identifiant, `nameKey` normalisé, unicité insensible à la casse) (F2-02) ; renommage autorisé si aucune formule ne référence l'ancien nom (`REFERENCED`), sinon refus ; le changement de type est autorisé, avec le même contrôle de cycle ; `CONFLICT` si la version est obsolète |
| `setVariableValue` | `id`, `value` : écriture rapide de la valeur d'une variable non-formule, sans `expectedVersion` (usage en partie : compteurs), mais qui **incrémente atomiquement `version` et `updatedAt`**. Un éditeur resté sur une version antérieure reçoit donc `CONFLICT` (F2-01). Validation du type et des bornes |
| `deleteVariable` | refus si une autre formule la référence (`REFERENCED`), sinon suppression définitive. C'est un petit objet de configuration ; la corbeille n'est pas utile en F2 et pourra s'ajouter avec les widgets |

Le contrôle de cycle et de références porte sur les variables du projet (au plus 200 petits documents), toutes lues dans la transaction d'écriture, ce qui l'isole d'écritures concurrentes.

## Interface

- **Page projet** : un lien « Variables » vers `/app/projects/$projectId/variables`.
- **Page variables** :
  - tableau accessible (`<table>` avec en-têtes) : nom, libellé, type, valeur ou formule, résultat calculé ou message d'erreur lisible ;
  - formulaire de création (nom, libellé, type, valeur ou expression) ;
  - édition par ligne (valeur, libellé, expression), avec enregistrement explicite et gestion du conflit ;
  - suppression avec confirmation ;
  - erreurs de formule affichées près du champ, avec leur position.

## Non-objectifs

Widgets compteurs ou fiches liés aux variables (F3, F4), variables propres à une fiche ou à un Screen, formules sur du texte, fonctions aléatoires (les dés viennent en F3), historique des valeurs.

## Critères d'acceptation

1. **Tests unitaires du parseur et de l'évaluateur** (`tests/unit/formula.test.ts`) :
   - priorités, unaires, fonctions, nombres décimaux ;
   - erreurs de syntaxe avec position ;
   - bornes de longueur, de profondeur et de nœuds ;
   - dépendances extraites ;
   - division par zéro ;
   - non-nombre ;
   - cycle, y compris indirect ;
   - propagation de `DEPENDENCY_ERROR`.
2. **Tests backend** (`tests/backend/gm-variables.test.ts`) :
   - création de chaque type ;
   - nom invalide et doublon insensible à la casse ;
   - bornes `min` et `max` ;
   - cycle direct, cycle indirect et autoréférence refusés à la création comme à la mise à jour ;
   - recalcul après `setVariableValue` ;
   - renommage et suppression refusés si la variable est référencée ;
   - `CONFLICT`, y compris pour un `updateVariable` fait avec la version qui précède une écriture rapide (F2-01) ;
   - limite de 200 variables ;
   - refus de chaque fonction publique pour un autre compte ;
   - export et nettoyage de `gmVariables` ;
   - mise à jour de la fixture du test d'export existant (`tests/backend/gm.test.ts`), qui exige une ligne par table de `gmTables` (F2-03).
3. **Vérification et inventaire** : `pnpm check` vert sous Node 26.11.1 ; `pnpm audit:convex` sort en code 0, avec l'inventaire de l'audit mis à jour.
4. **E2E Holysheet** : sur la page Variables, créer `force = 3` et `bonus = force * 2 + 1`, puis vérifier `7` ; passer `force` à 5 et vérifier `11` ; vérifier qu'une formule cyclique est refusée avec un message. La restauration compte au moins une ligne `gmVariables`.
5. **CI** de la branche verte, puis inspection Codex neuve : APPROVED.
