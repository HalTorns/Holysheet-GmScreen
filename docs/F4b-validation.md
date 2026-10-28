# F4b — Livraison et preuves locales

Construction sur `codex/f4b-rich-text`, base `b8f508a`, suivant le plan et l’arbitrage du coordinateur. Aucun commit, push, déploiement ou lancement de migration.

Le couple `{ body, bodyFormat }` est atomique dans les deux écritures publiques, les snapshots, la restauration et les copies. Les valeurs absentes restent `plain` ; une omission lors d’une écriture conserve le format courant. Le rendu n’enregistre aucun HTML dérivé. Les fiches restent en texte brut. Aucun nouveau module Convex : aucune entrée supplémentaire nécessaire dans `_generated/api.d.ts` ; l’inventaire des signatures existantes est actualisé dans `AUDIT.md`.

L’éditeur utilise le brouillon existant, une textarea, un groupe de commandes accessibles, des dialogues de lien/repli, un aperçu dérivé et un collage HTML dans un template d’un document inerte. Un collage dépassant les limites HTML propose explicitement le collage brut ; une insertion dépassant 50 000 unités est entièrement refusée. La lecture seule utilise le rendu commun ; sa variante statique développe tous les replis. Le schéma d’assainissement ferme les balises et attributs, puis chaque lien est revérifié dans le composant. La CSP est inchangée.

## Dépendances

Versions exactes : `react-markdown@10.1.0`, `remark-directive@4.0.0`, `rehype-sanitize@6.0.0`. Aucun changement des versions existantes ni des exceptions d’âge de publication/audit. Le pair React et les types de react-markdown sont `>=18`, satisfaits par React et types 19.3.0 ; les deux plugins ne déclarent pas de pair React. L’installation pnpm 11.8.0 applique `minimumReleaseAge: 1440`.

Context7 MCP n’est pas disponible dans cette session. Vérification des README, types et sources installés (`react-markdown/lib/index.js`, `remark-directive/lib/index.d.ts`, `rehype-sanitize/lib/index.d.ts`) et des documentations officielles versionnées : [react-markdown 10.1.0](https://github.com/remarkjs/react-markdown/blob/10.1.0/readme.md), [remark-directive 4.0.0](https://github.com/remarkjs/remark-directive/blob/4.0.0/readme.md), [rehype-sanitize 6.0.0](https://github.com/rehypejs/rehype-sanitize/blob/6.0.0/readme.md). Les concepts vérifiés sont les plugins synchrones, `urlTransform`, `components`, `skipHtml`, les métadonnées `hName` des directives et le schéma fermé de sanitation.

## Commandes et résultats

Environnement : Linux x86_64, Node 26.11.1 (`source ~/.nvm/nvm.sh && nvm use 26.11.1`), pnpm 11.8.0, Chromium headless 156.0.8078.4.

- `pnpm check` : code 0 ; types, Oxlint strict, Oxfmt, Knip, 37 fichiers / 240 tests unitaires et backend, 7 fichiers / 17 tests Chromium, build de production. Avertissements de bundling upstream « use client » déjà documentés dans `upgrades.md`.
- Les suites ajoutées sont `tests/unit/note-rich-text.test.ts` (29 cas de rendu réel, sanitation, URL, activation et limites), `tests/backend/gm-rich-text.test.ts` (5 scénarios aux entrées publiques), `tests/browser/note-rich-text.test.tsx` (7 scénarios d’édition/collage, dialogues, conflits, lecture seule et mesures). Les tests F3 de migration réelle et d’idempotence restent exécutés et passent.
- `pnpm audit --prod --audit-level=high` : code 0 ; trois low et deux moderate subsistent, les deux high et le critical correspondent exclusivement aux trois exceptions Better Auth existantes. Aucune exception ajoutée.
- `pnpm audit:convex` : code 0 ; 76 fonctions publiques, 0 hors inventaire.
- `git diff --check` : code 0.

## Bundle et rendu de production

Un `pnpm build` de base a été exécuté avant modification. Les 92 assets JavaScript client de `.output/public/assets` totalisaient 1 778 900 octets minifiés et 585 873 octets gzip. Chaque fichier est compté une fois, y compris les chunks partagés. L’inventaire `{ bytes, gzip }` par fichier a été conservé dans `/tmp/f4b-base-sizes.json`. Le delta de tous les assets client constitue une mesure conservatrice du coût F4b, importé uniquement par le Screen privé.

`node scripts/measure-rich-text.mjs /tmp/f4b-base-sizes.json` : code 0, **+151 344 octets minifiés (147,8 Kio), +46 568 octets gzip (45,5 Kio)**. Budgets de 250/80 Kio respectés. La commande rebâtit également une page de mesure temporaire de production utilisant le vrai `NoteRender`, la sert localement avec une CSP sans scripts inline/eval et supprime ses fichiers à la fin.

Sur cette page isolée, après chargement des modules, cinq rendus synchrones React et calcul de disposition par fixture :

| Fixture | Essais, ms | Médiane, ms |
| --- | --- | --- |
| Une note de 50 000 unités, 700 segments gras et sauts de ligne, complétée par du texte | 156,9 ; 71,4 ; 61,2 ; 43,1 ; 52,2 | 61,2 |
| Cent notes courtes avec gras et saut de ligne | 29,3 ; 22,6 ; 32,9 ; 15,8 ; 13,6 | 22,6 |

Mise à jour d’une seule note parmi cent, autres props inchangées : 2,3 ms sur cet essai. `memo` préserve les rendus inchangés ; aucune assertion temporelle fragile. Ces mesures isolent le renderer, elles n’incluent pas le chargement réseau du Screen. Le spec E2E ajoute des mesures sur le véritable Screen construit (une note maximale puis cent notes courtes, cinq essais, pièce jointe JSON agrégée). La CI exécute aussi `node scripts/measure-rich-text.mjs --render-only` pour le renderer de production isolé, sans prétendre y mesurer un delta de base.

## Preuves réservées à la CI et limites

Les E2E n’ont pas été exécutés localement, conformément au work order. Le job `application` conserve Holysheet et les budgets, ajoute `rich-text.spec.ts` : activation littérale, toolbar/focus, collage synthétique Word/Docs hostile, absence de requête vers les ressources hostiles et de violation CSP, lecture seule, repli au clavier, synchronisation/conflit et restauration brute. Chaque navigation/rechargement attend l’hydratation. La restauration existante prépare aussi une note riche et sa révision brute ; son rapport expose seulement leurs compteurs, en complément des checksums canoniques.

Aucun `backend:push` local sans services Docker, aucun résultat CI distant ou restauration réelle revendiqué. Le collage natif depuis Word/Docs selon OS reste à inspecter manuellement ; les événements synthétiques couvrent le chemin applicatif. L’inspection du coordinateur reste à effectuer. Aucun écart fonctionnel intentionnel à l’arbitrage ; ces limites concernent les preuves disponibles dans cette session.

## Fichiers livrés

- Modèle/API : `shared/gm.ts`, `convex/gm.ts`, `convex/gmWidgets.ts`, `convex/gmEditor.ts`, `convex/lib/gmValidators.ts`, `convex/lib/gmFormats.ts`, `convex/lib/gmEditing.ts`.
- Interface : `src/features/gm/note-editor.tsx`, nouveaux `src/features/gm/rich-text/input.tsx`, `render.tsx`, `policy.ts`, `paste.ts`.
- Tests : nouveaux `tests/unit/note-rich-text.test.ts`, `tests/backend/gm-rich-text.test.ts`, `tests/browser/note-rich-text.test.tsx`, `tests/e2e/rich-text.spec.ts` ; attentes adaptées dans `gm-access.test.ts`, `gm-widget-migrations.test.ts`, `gm-widgets.test.ts`, `tests/e2e/screen-editor.ts` et hydratation dans `widget-budgets.spec.ts`.
- Restauration et mesures : `scripts/snapshots.mjs`, `tests/e2e/backup.ts`, `tests/e2e/holysheet.spec.ts`, nouveau `scripts/measure-rich-text.mjs`.
- Intégration : `package.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`, `docs/AUDIT.md`, `docs/product.md` et ce rapport. Plan et arbitrage inchangés.
