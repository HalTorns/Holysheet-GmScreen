# Migrations des données métier

Décision du 28 octobre 2026 (tranche C1, constat [AUD-03](../AUDIT.md)). Choix délégué à Claude par l'utilisateur.

## Contexte

La V1 est en production avec les données des testeurs, qui doivent être conservées ([BRIEF](../BRIEF.md)). Le schéma métier (`convex/schema.ts`) ne contient aujourd'hui que le domaine des notes GM. Jusqu'ici, il n'a évolué que par ajout de champs optionnels, ce qui reste compatible.

Le chantier 2 va introduire la bibliothèque de fiches et de variables, puis les autres widgets. Certains changements ne seront plus de simples ajouts : déplacement d'un contenu de note vers un widget typé, renommage, nouvelle forme d'un snapshot d'historique. Or il n'existe aujourd'hui aucun mécanisme de migration des documents métier. `profileNames.ts` ne migre que les pseudos, et `scripts/migrate-postgres.mjs` migre le stockage interne de Convex.

Il ne faut pas confondre la `version` des notes et dispositions avec une version de format. La première sert à la concurrence optimiste, pas à décrire la forme d'un document.

## Décision

1. **Moteur : le composant officiel [`@convex-dev/migrations`](https://www.npmjs.com/package/@convex-dev/migrations)**, version 0.3.7 au 28/10/2026.
   - Ses pairs (`convex ^1.42.0`, `convex-helpers ^0.1.115`) sont satisfaits par Convex 1.46.0 et convex-helpers 0.1.128, qui est déjà dans le lockfile.
   - Il fournit des migrations par lots paginés, reprenables après échec, avec un suivi d'état. Chaque document est traité dans une mutation bornée.
   - Il sera installé avec la première migration réelle, pas avant.
2. **Version de format explicite.**
   - Toute table métier dont la forme change de manière incompatible reçoit un champ optionnel `formatVersion: number`. L'absence de ce champ signifie version 1.
   - Le code de lecture accepte l'ancienne et la nouvelle forme tant que la migration n'est pas terminée en production. Le schéma reste en union pendant la transition.
3. **Cycle d'une migration**, en trois déploiements si besoin :
   1. le schéma accepte les deux formes et le code sait lire les deux ;
   2. la migration réécrit les documents par lots, puis on vérifie l'état ;
   3. on retire l'ancienne forme du schéma et du code.
4. **Preuves obligatoires pour chaque migration :**
   - un test `convex-test` charge des documents **au format V1 réel**, en partant des fixtures de restauration existantes plutôt que de documents inventés ;
   - le test exécute la migration, puis vérifie la lecture, l'export de compte (`gm.exportCollection`) et le nettoyage ;
   - un second passage doit être sans effet, ce qui prouve l'idempotence.
5. **Ordre opérationnel en production**, à la charge de l'utilisateur : sauvegarde vérifiée (voir AUD-25), déploiement de l'étape 1, lancement de la migration, vérification de son état, puis déploiement de l'étape 3. Un retour arrière du code n'annule pas une migration de données : chaque migration documente son plan de retour.

## Alternatives écartées

- **Migrations internes faites main** : une table de suivi plus des `internalMutation` paginées. C'était la piste initiale de l'audit. Elle offre un contrôle total, mais il faudrait écrire et tester soi-même la reprise après échec, le suivi d'état et le cadencement, que le composant fournit déjà et que Convex maintient.
- **Réécriture au fil de l'eau, à la lecture** : aucun lot à gérer, mais les documents jamais relus garderaient l'ancienne forme indéfiniment, ce qui complique l'export et le nettoyage. On peut s'en servir en complément, jamais comme seul mécanisme.
- **Champs uniquement optionnels, sans migration** : c'est la règle actuelle, et elle suffit pour des ajouts. Elle ne couvre ni un renommage ni un changement de structure.

## Conséquences

- Une dépendance de plus (`@convex-dev/migrations`) et les tables propres au composant, ajoutées à la première migration.
- Chaque changement incompatible du chantier 2 coûte un test de migration et, au besoin, deux déploiements. C'est le prix de la conservation des données des testeurs.
- Les sauvegardes de production (AUD-25) deviennent un prérequis avant la première migration réelle.

## Réalisation F3a — expansion A et runner B

`@convex-dev/migrations` **0.3.7** est installé sans changement des versions existantes. Les pairs vérifiés au registre et dans son manifeste (`convex ^1.42.0`, `convex-helpers ^0.1.115`) sont satisfaits par **1.46.0** et **0.1.128** au lockfile. Context7 n'est pas disponible dans cette session : consultation du [README officiel versionné 0.3.7](https://github.com/get-convex/migrations/blob/v0.3.7/README.md), des sources/types livrés `src/client/index.ts`, `src/component/lib.ts`, `src/test.ts`, ainsi que des validateurs, de `getDocumentSize` et de `usePaginatedQuery` installés avec Convex 1.46.0. Le harness officiel `@convex-dev/migrations/test` fonctionne hors ligne avec convex-test 0.0.61 ; aucun moteur de repli n'est nécessaire. React reste en 19.3.0.

Le composant est enregistré dans `convex/convex.config.ts`. `gmWidgetMigrations:run` (arguments `{}`, interne) lance les trois passes ordonnées `notes`, `layouts`, `history`. Le runner générique interne est enveloppé pour fixer cette séquence sans assertion de types : les références produites par `define` comportent des champs optionnels `| undefined`, incompatibles avec `MigrationFunctionReference` sous `exactOptionalPropertyTypes`. Le composant conserve la pagination, le journal durable et le cadencement ; ce contournement ne change pas son comportement d'exécution.

Chaque lot traite initialement **5 documents** ; chaque document est borné (note/snapshot ≤ 200 Kio, disposition/snapshot ≤ 48 Kio, métadonnées ≤ 16 Kio), donc les lectures/écritures d'une passe restent bornées. Ne pas augmenter `batchSize` sans nouvelle preuve. Le calcul utilise `getDocumentSize` de Convex 1.46.0, champs système compris, avec 128 octets de réserve, pour ne pas confondre UTF-8 stocké et échappements JSON. Une note conserve la limite existante de 50 000 unités UTF-16 ; aucune troncature/normalisation du texte. La migration ne change ni version optimiste, ni dates, ni IDs, ni historique utilisateur. La première édition V1 convertit le document et son payload dans la transaction de sauvegarde, après contrôle de version.

Avant exécution sur une cible choisie explicitement suivant `docs/deployment.md`, l'opérateur doit satisfaire **AUD-25**, déployer A et faire recharger les clients. Appeler ensuite la mutation interne `gmWidgetMigrations:run` avec `{}`. Le statut se consulte via `lib:getStatus` du composant `migrations` ; une annulation utilise son `lib:cancel` avec le nom de passe (par exemple `gmWidgetMigrations:notes`). Rappeler `gmWidgetMigrations:run` reprend au curseur durable ; les passes terminées sont ignorées. `gmWidgetMigrations:runner` permet un redémarrage explicite avec `reset` après diagnostic, sans modifier les données déjà V2. Aucun lancement ne fait partie du déploiement ou d'un cron.

Une interruption conserve le code A, qui lit les deux formats. Les opérations structurelles du Screen sont refusées tant qu'une note V1 vivante **ou supprimée** existe ; l'édition et les pages de lecture restent disponibles. Le schéma accepte aussi une version V1 explicite, sans la produire. Les exports conservent les formes stockées et les comptes se nettoient en lots mixtes. Après les trois statuts terminés, l'opérateur doit encore vérifier par inventaire paginé l'absence de V1, l'unicité des payloads, les relations, l'export et la restauration. **La contraction C est F3c, une livraison séparée** ; le retour arrière fonctionnel reste A compatible, jamais le code antérieur à A.

Les tests backend prouvent le cycle de vie et les tailles de documents, pas les octets réellement débités par le service. La copie maximale et le nettoyage lourd sont préparés dans `tests/e2e/widget-budgets.spec.ts` sur backend réel jetable, avec quotas actifs, compte dédié et nettoyage `finally`. Leur exécution et la restauration réelle sont réservées à la CI faute de Docker local ; une réussite Vitest ne vaut pas réussite de ces preuves. Les rapports de restauration ajoutent seulement des agrégats de relations widgets/payloads, sans corps ni identifiants, à la comparaison canonique existante.
