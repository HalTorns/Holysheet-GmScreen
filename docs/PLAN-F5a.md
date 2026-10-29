# Plan — Chantier 2, tranche F5a : tableau, horloge et initiative

Références : [PRD §8](../PRD.md) (« Tableaux personnalisables : lignes, colonnes, cellules éditables, copier/coller de tableaux » ; « Horloges / chronomètres / minuteurs : fonctions simples, état partagé » ; « Initiative / combat : aide légère d'ordre de tour, ne pas en faire le centre du produit ») · [PLAN-F1](PLAN-F1.md) (feuille de route) · [PLAN-F3](PLAN-F3.md) et [ADR widgets](decisions/widgets.md) (socle, budgets, verrouillage) · [PLAN-F4](PLAN-F4.md) (précédent d'ajout de kind).

## Découpage

- **F5a (ce plan)** : trois nouveaux kinds sans fichier, `table`, `clock` et `initiative`.
- **F5b (plus tard, regroupée avec F6)** : images, illustrations et cartes. Elles ont besoin du stockage de fichiers Convex, qui fait l'objet de F6 avec les PDF ; un seul ADR stockage pour les deux.

Hors périmètre : cellules riches ou formules dans les tableaux, tri ou filtre de tableau, alarme sonore, suivi de PV ou d'états de combat, plateau tactique, nouveau mécanisme de synchronisation.

## Règles communes (héritées de F3)

- Chaque kind est une branche stricte de l'union V2 (`formatVersion: 2`), dans le validateur Convex (`convex/lib/gmValidators.ts` : schéma, mise à jour, widget, corbeille, snapshot d'historique) et dans le schéma Zod partagé `gmWidget` qui porte les bornes. Le kind est immuable, et un kind inconnu est refusé.
- Budget inchangé : métadonnées, config et état d'un widget ≤ **16 Kio** (`widgetBudget`). Un dépassement est refusé par `INVALID_INPUT` ou le code de budget existant, sans jamais tronquer.
- **Verrouillage** : un Screen verrouillé refuse un changement de `config`, et accepte un changement de `state`. Cette tranche place donc dans `state` ce qui est contenu de séance, et dans `config` ce qui est structure.
- Versions de concurrence, historique (20 révisions), corbeille, duplication, profils, styles, groupes, export, nettoyage et restauration : réutilisés tels quels. Aucune migration de données, puisque les nouveaux kinds naissent en V2 (même règle que F3b, PLAN-F3 §arbitrage). `scripts/snapshots.mjs` doit connaître et valider les trois kinds.
- `addWidget(screenId, kind)` accepte les trois kinds et crée une configuration par défaut valide.

## Kind `table`

- `config: { title (≤120), columns: [{ id, label (≤60) }] }`, de 1 à 12 colonnes, `id` uniques.
- `state: { rows: [{ id, cells: string[] }] }`, de 0 à 100 lignes, `cells.length === columns.length`, chaque cellule ≤ 500 caractères, `id` uniques. Le budget de 16 Kio reste la borne effective : il s'agit de tableaux de référence, pas de feuilles de calcul.
- Défaut à la création : deux colonnes « Colonne 1 », « Colonne 2 » et une ligne vide.
- **Écriture par `updateWidget`** (aucune nouvelle mutation), toujours avec une config et un état **complets et cohérents** soumis ensemble. Le serveur les valide atomiquement (`cells.length === columns.length` pour chaque ligne, bornes, budget) et ne recalcule ni n'aligne rien. `expectedVersion` garantit que le client est parti de l'état stocké ; sinon `CONFLICT`.
  - Ajouter, supprimer ou renommer une colonne : le client soumet les nouvelles colonnes et les lignes réalignées. C'est un changement de config, refusé si le Screen est verrouillé.
  - Éditer une cellule, ajouter ou supprimer une ligne : config inchangée, permis si verrouillé.
  - Restauration d'une révision (`intent: 'restore'`) : config et état du snapshot restaurés ensemble, tels quels, avec les contrôles habituels de version, propriété, budget et verrouillage. Les valeurs d'une colonne supprimée depuis sont ainsi retrouvées.
- **Collage** : dans l'éditeur, coller un tableau HTML (`<table>`) ou du texte tabulé (TSV, lignes séparées par des sauts de ligne) remplace colonnes **et** lignes en une seule écriture `updateWidget`, après un aperçu « N lignes × M colonnes » et une confirmation. La première ligne collée devient les en-têtes si l'utilisateur coche « Première ligne = en-têtes » (coché par défaut pour un `<table>` avec `<th>`). Si le nombre ou les libellés de colonnes changent, c'est un changement de config : refusé sous verrouillage, avec un message explicite. Parseur pur côté client, déterministe, sans IA. Le HTML passe par le même document inerte que F4b (`stripEventHandlers` puis gabarit), on ne garde que le texte des cellules. Au-delà des bornes : refus explicite avant envoi (« 12 colonnes / 100 lignes maximum »), pas de troncature silencieuse.
- Rendu : `<table>` avec `<caption>` (titre), `<th scope="col">` pour les en-têtes ; défilement horizontal dans le widget.

## Kind `clock`

- `config: { title (≤120), mode: 'stopwatch' | 'timer' | 'segments', durationMs?, segments? }`.
  - `timer` : `durationMs` entier entre 1 s et 24 h, obligatoire ;
  - `segments` (horloge de progression à cases) : `segments` entier de 2 à 12, obligatoire ;
  - les champs non pertinents pour le mode sont refusés.
- `state` :
  - `stopwatch` et `timer` : `{ running: boolean, startedAt?: number, elapsedMs: number }`, avec `startedAt` présent si et seulement si `running` ;
  - `segments` : `{ filled: number }`, de 0 à `segments`.
- **Nouvelle mutation `gmWidgets.controlClock(id, expectedVersion, action)`**, où `action` vaut `start | pause | reset` (chronomètre et minuteur) ou `{ filled }` (segments).
  - L'heure est celle du serveur (`Date.now()` de la mutation), jamais celle du client. `pause` ajoute `now - startedAt` à `elapsedMs`. `reset` remet à zéro et arrête.
  - Contrôles : `requireUser`, `ownedNote`, kind `clock` et mode compatible avec l'action, sinon `INVALID_INPUT`. Versions comme `setCounterValue`. Limite de débit utilisateur existante.
  - C'est un changement d'état, permis si verrouillé.
- **Aucune écriture par seconde.** Le client affiche le temps localement (intervalle d'une seconde, arrêté quand le widget n'est pas monté) à partir de `startedAt`, `elapsedMs` et de l'heure locale.
  - Un décalage d'horloge client/serveur est corrigé par un offset mesuré au chargement : `getServerTime` n'existe pas, donc on mesure l'offset à partir de la réponse de `controlClock`, qui retourne `{ version, serverNow }`. Sans mesure, l'offset vaut 0. **Limite acceptée et documentée** : une seconde vue qui n'a jamais piloté l'horloge peut afficher un écart égal au décalage de son horloge système.
  - Minuteur : affichage du temps restant borné à 0, état « Terminé » visuel et annoncé une seule fois (`role="status"`), aucun son. Le minuteur expiré reste `running` côté serveur jusqu'à `pause` ou `reset` : pas de tâche planifiée.
- `updateWidget` sur un `clock`, en édition ordinaire, ne pilote jamais le temps : si la config ne change pas, l'état soumis doit être identique à l'état stocké ; si elle change (titre seul excepté), l'état soumis doit être l'état initial du mode (`running: false, elapsedMs: 0` ou `filled: 0`). Le serveur valide, il ne réinitialise pas lui-même. Un changement de config est refusé si verrouillé.
- Restauration d'une révision (`intent: 'restore'`) : config et état du snapshot restaurés ensemble. Une horloge enregistrée en marche est restaurée **en pause**, avec `elapsedMs` du snapshot augmenté du temps écoulé jusqu'à la date du snapshot (`updatedAt` du snapshot − `startedAt`), sans `startedAt` : on ne relance jamais un chronomètre depuis une heure passée.
- Rendu statique et papier : valeur figée à l'instant du rendu (`mm:ss` ou `h:mm:ss`) ou cases remplies.

## Kind `initiative`

- `config: { title (≤120) }`.
- `state: { entries: [{ id, name (1–60), score (nombre fini, −999 à 999), note (≤120) }], currentId?: string, round: integer ≥ 1 }`, au plus 30 entrées, `id` uniques, `currentId` présent dans `entries` ou absent.
- **Ordre d'affichage** : `score` décroissant, puis ordre d'insertion. Il n'est pas stocké, mais dérivé.
- Écriture par `updateWidget` (état complet validé, version attendue) : ajouter, modifier ou retirer une entrée, « Tour suivant », « Réinitialiser ». « Tour suivant » est calculé côté client sur l'ordre dérivé : on passe à l'entrée suivante, et après la dernière on revient à la première avec `round + 1`. Le serveur valide l'état final, et une concurrence produit `CONFLICT` avec l'interface existante « Charger la version enregistrée ».
- Retirer l'entrée courante fait passer `currentId` à la suivante (ou l'efface si la liste est vide), dans le même état soumis.
- Accessibilité : liste ordonnée, entrée courante marquée par `aria-current="true"` et un indicateur visuel non uniquement coloré, round annoncé (`role="status"`).

## Interface

- Le sélecteur « Type de widget » propose « Tableau », « Horloge » et « Initiative ».
- Chaque widget a un mode consultation (contrôles de séance : cellules, démarrer/pause/remise à zéro, cases, tour suivant) et un mode édition de structure (colonnes, mode et durée d'horloge, titre). La lecture seule du Screen n'autorise aucune écriture.
- Régions nommées « Widget tableau N », « Widget horloge N » et « Widget initiative N » ; erreurs en `role="alert"`.

## Critères d'acceptation

1. **Tests backend (convex-test)**, pour chaque kind :
   - création par défaut ;
   - bornes et refus : colonnes ou lignes en trop, cellules désalignées, durée hors bornes, champs de mode incohérents, `filled` hors bornes, entrées en trop, `currentId` inconnu, score non fini ;
   - verrouillage : config refusée, état accepté ;
   - versions et `CONFLICT` ;
   - refus de chaque entrée publique à un autre compte ;
   - duplication, corbeille et restauration, historique (restaurer une révision) ;
   - export et nettoyage ;
   - refus de lignes désalignées avec les colonnes soumises ;
   - collage atomique dont la largeur diffère du tableau existant (2 colonnes → 3 colonnes avec valeurs), et le même collage refusé sous verrouillage ;
   - restauration d'une révision de tableau dont une colonne, supprimée depuis, contenait des valeurs ;
   - restauration d'une horloge dont la config historique diffère (mode ou durée), et d'une horloge enregistrée en marche (restaurée en pause, temps cumulé exact) ;
   - `updateWidget` d'horloge qui tente de modifier `running`, `startedAt` ou `elapsedMs` : refusé.
   - Pour `controlClock` : start, pause et reset avec une heure simulée (`vi.useFakeTimers` / `vi.setSystemTime`) ; `elapsedMs` cumulé exact ; action incompatible avec le mode refusée.
2. **Tests unitaires** : parseur de collage (TSV, HTML avec attributs `on*` et scripts, cellules vides, dépassement de bornes), ordre dérivé et « Tour suivant » (égalités, fin de round, retrait de l'entrée courante), formatage du temps.
3. **E2E CI** (`tests/e2e/widget-kinds.ts`, dans le parcours existant) :
   - tableau : coller un TSV de 3 colonnes × 2 lignes dans le tableau par défaut à 2 colonnes, éditer une cellule, recharger, vérifier ;
   - horloge : minuteur, démarrer, attendre que l'affichage diminue, mettre en pause, recharger, vérifier que la valeur est figée et proche ;
   - initiative : trois entrées, deux « Tour suivant », vérifier l'entrée courante et le round ;
   - une seconde vue voit les changements en direct (au moins pour l'initiative).
4. **Vérification et inventaire** : `pnpm check` vert, `pnpm audit:convex` à 0 avec l'inventaire de `docs/AUDIT.md` mis à jour (nouvelle fonction publique `controlClock`), restauration CI qui couvre un document de chaque nouveau kind, CI verte.
5. **Inspection** par Claude (fournisseur opposé au builder Codex). Journal dans `docs/PLAN-REVIEW-LOG.md`, état consolidé dans `docs/product.md`.

## Commandes de preuve

- `pnpm check`
- `pnpm audit:convex`
- CI GitHub sur la branche de tranche, puis avance rapide de `main`.
