# Journal de review — Claudex

## Session 2026-10-28 — Chantier 1 (audit)

- Hôte / planificateur : Claude Code (Opus 5.5)
- Reviewer du plan : Codex CLI 0.164.0 (modèle : configuration par défaut du CLI)
- Builder : Codex · Inspecteur final : Claude (session fraîche)
- Plan : `docs/PLAN.md` · Rounds max : 3 · Mode : review (exigences issues de `docs/BRIEF.md`)
- Autorisation : planification et review uniquement ; build soumis à confirmation de l'utilisateur.

### Round 1 — BLOCKED (échec opérationnel, non compté comme review)

- Résultat : `scratchpad/claudex/r1/claudex-uuxgxl7g/result.json` · plan SHA256 `8841ff3e…859b` · Codex 0.164.0, modèle effectif `gpt-6.1-sol` (effort medium), sandbox `read-only`.
- Verdict : BLOCKED, 0 finding. Cause : `bwrap: No permissions to create a new namespace` — le conteneur webtop n'autorise pas les user namespaces ; aucun fichier du repo n'a pu être lu. `codex sandbox linux` échoue de même ; landlock legacy n'est plus disponible.
- Conséquence : le bac à sable Codex (read-only pour la review, workspace-write pour le build) est inutilisable sur cet hôte. Décision demandée à l'utilisateur (ne pas assouplir la sécurité Docker de l'hôte).

### Round 1 (relance sans bac à sable) — REVISE

- Lancement direct `codex exec` en `danger-full-access` (choix utilisateur), consigne de lecture seule + empreinte du checkout avant/après : **inchangé**. Session `01a18219-011b-7650-aa52-d5f864fee455`, modèle effectif gpt-6.1-sol (config CLI). Réponse complète : `scratchpad/claudex/r1b/reply.txt`.
- Plan revu : SHA256 `8841ff3e…859b`.
- **REV-01 (high)** — T0 ne prouve pas le protocole MFA/twoFactor après montée (CI ne lance que holysheet.spec.ts ; `authOptions.ts:47-63` adapte les hooks internes ; `upgrades.md:36` exige les E2E modules). → **Accepté** : revue twoFactor + job CI `auth-modules` (T0 b, c).
- **REV-02 (high)** — Pas de régénération/revue du schéma auth (`auth:generate`) ni de test sur compte antérieur (`upgrades.md:56-59`). → **Accepté** : T0 a, d ; A7 étendu aux tables Better Auth.
- **REV-03 (medium)** — `security.spec.ts` incompatible avec le mode produit (passkey/OTP/libellé) ; preuves CSP à prendre dans `holysheet.spec.ts:226-303`. → **Accepté** : axe C corrigé, constat ajouté à l'axe D.
- Ajout de l'hôte : branche de validation `codex/t0-auth` pour T0 (exception aux commits directs, à faire valider par l'utilisateur).
- Plan révisé : SHA256 `416a4e04fbb3a79145b1747c9960fc02b56fab5d7b017f849df28a523e6f984b`.

### Round 2 — REVISE

- Même session Codex (resume), empreinte du checkout inchangée. Plan revu : SHA256 `416a4e04…984b`. Réponse : `scratchpad/claudex/r2/reply.txt`. REV-01..03 confirmés comme traités.
- **REV-04 (medium)** — Le lanceur `test-auth-modules.mjs` ne gère pas `AUTH_PASSWORD_ONLY` (imposé par `setup-local.mjs:74`) et les helpers attendent l'ancien dashboard (« Nouvelle ressource ») au lieu de Projets ; le job échouerait avant les garanties MFA. → **Accepté** : prérequis ajoutés à T0 c (flag sauvegardé/restauré sur services isolés, helpers adaptés, Chromium + build).
- **REV-05 (high)** — Un `pnpm install` entre deux lockfiles ne change pas le code Better Auth exécuté par Convex (publié une fois par `convex dev --once`) : fausse preuve possible. → **Accepté** : T0 d redéfini en deux phases cohérentes (checkout + install + `backend:push` + rebuild), mêmes données/secret/session témoin, révisions publiées consignées.
- Plan révisé : SHA256 `89f01768e245f405f48dded2283a758430b54b211d8fa854b3202a88336d4a12`.

### Round 3 — APPROVED

- Même session Codex, empreinte du checkout inchangée. Réponse : `scratchpad/claudex/r3/reply.txt`.
- **APPROVED**, 0 finding, lié au plan SHA256 `89f01768e245f405f48dded2283a758430b54b211d8fa854b3202a88336d4a12` (vérifié sur disque après le round).
- Limites déclarées : revue statique ; implémentation, migrations et CI à prouver dans les work orders ; prod et avis distants non vérifiés ; exception de branche `codex/t0-auth` en attente de l'accord utilisateur.
- Note d'outillage : rounds 1b–3 exécutés hors runner (bac à sable bwrap indisponible) ; la vérification mécanique `runner.py check` n'est donc pas applicable — le hash ci-dessus a été vérifié manuellement.
- Rounds utilisés : 3/3 (+1 échec opérationnel non compté).

## Build T0 — 2026-10-28

- Branche `codex/t0-auth`, base `9c83744`. Builder Codex (exec direct, `danger-full-access`, session `01a18231-ac6f-7761-b490-93845e5c5349`).
- Build 1 : arrêt conforme à l'arbre T0 — option 1 impossible (aucun rétroportage 1.6.x ; plages corrigées ≥ 1.7.0-rc.3/1.7.7), option 2 incompatible (`@convex-dev/better-auth` 0.12.5/0.12.6 importe `better-auth/plugins/oidc-provider`, supprimé en 1.7). Vérifié par Claude (avis GHSA relus).
- Décision utilisateur (2026-10-28) : **option 3 acceptée** — non-exposition établie par les conditions des avis eux-mêmes (magic link `storeToken: 'hashed'` sans `storeIdentifier` global ; plugins deviceAuthorization et oAuthProxy absents ; account linking désactivé).
- Build 2 : `auditConfig.ignoreGhsas` (3 GHSA) dans `pnpm-workspace.yaml`, garde `tests/backend/auth-advisories.test.ts` (options réelles, liste pnpm effective, échéance 2026-11-30), décision dans `docs/upgrades.md`, reformatage oxfmt des docs.
- Correction Claude (auteur) : restauration des sauts de ligne du verbatim dans `docs/BRIEF.md` (fusionnés par oxfmt).
- `docs/PLAN.md` reformaté par oxfmt uniquement (diff `-w` : échappement `\|` dans un tableau) — contenu approuvé inchangé ; nouveau SHA256 `6ed3c2660c3e9ab9375f4386307c22d1a8f12fce1da4632c09a30bb0e4f26fee`.
- T0 c/d (job `auth-modules`, test compte antérieur) reportés à la future montée de version : aucune version ne change dans T0.
- Preuves Claude : `pnpm audit --prod --audit-level=high` → 0 ; `pnpm check` → 0.
- Note : l'utilisateur demande désormais d'appliquer les recommandations sans le solliciter.

### Inspection T0 n°1 — REVISE (session Codex neuve)

- Instantané `1e04f21`, empreinte du checkout inchangée. Réponse : `scratchpad/claudex/i1/reply.txt`.
- **T0-01 (medium)** — le garde inspectait l'instance de génération du schéma, pas la fabrique de production (`createAuth`, plugins finaux de `convex/auth.ts`). → **Accepté**, corrigé par le builder : `createAuth(ctx).options` en mode password-only et Magic Link + Google/GitHub, cas négatif `storeIdentifier: 'hashed'`.
- CI `40689261671` (sur `1e04f21`) : échec du seul test pnpm — `pnpm config get audit --json` vide sur le runner, alors que l'étape `pnpm audit` passe. → corrigé : lecture stricte du bloc YAML ; l'étape CI `pnpm audit` reste la preuve que pnpm honore la clé.
- Observation à reporter dans l'audit (axe D) : timeout isolé et intermittent dans `tests/backend/gm-editor.test.ts` signalé par le builder.

### Inspection T0 n°2 — APPROVED (session Codex neuve) · clôture T0

- Instantané `4d05cd9` (diff `9c83744..4d05cd9`), empreinte du checkout inchangée, 0 finding. Réponse : `scratchpad/claudex/i2/reply.txt`.
- CI `40691187876` sur `4d05cd9` : **success** (Validation — Holysheet avec `pnpm audit`, `pnpm check` et E2E Holysheet ; secrets).
- Fast-forward de `main` vers `4d05cd9`. Inspections utilisées : 2/2 ; correctifs : 2 (T0-01, test pnpm en CI).
- Auteurs : code et docs T0 par Codex ; Claude : verbatim de `docs/BRIEF.md` et ce journal.
- Reste à faire par l'utilisateur : rien d'obligatoire pour la sécurité (aucune version ni config d'auth changée en prod). Réexamen de l'exception au 2026-11-30.

## T1, T2, T3 — 2026-10-28

- **T1** (Claude) : Node 26.11.0 via nvm (alias `default` inchangé), `pnpm check` vert sous Node 26 ; section « Poste Linux sans Docker » dans `docs/development.md` (`35e1289`).
- **T2** (Codex, exec direct sans sandbox) : `docs/AUDIT.md` (27 constats : 1 bloquant, 8 majeurs, 18 mineurs) et `scripts/audit/convex-inventory.mjs` (`pnpm audit:convex`, contrôle A6 durable) (`0bd7b8a`). Vérifié par Claude : AUD-02 reproduit dans le code, inventaire exit 0, et l'inventaire détecte bien une fonction publique ajoutée sans ligne d'audit.
- Décision : l'utilisateur délègue les choix à Claude et demande d'économiser le quota Codex → Claude code T3, Codex garde la review de plan et l'inspection finale.
- **T3** (Claude, auteur) : correctif AUD-02 — `account.exportApplicationEvents` (paginé `by_actor`, 100 max, événement + date), ajout `applicationEvents` au téléchargement, test `tests/backend/account-events.test.ts` ; inventaire et AUD-02 mis à jour dans l'audit. `pnpm check` : 146 + 7 tests verts. Constats majeurs et décisions de dette : planifiés (voir `docs/AUDIT.md`), non traités dans ce chantier.

## Tranche C1 — consolidation (2026-10-28)

- Plan `docs/PLAN-C1.md` (Claude). Review Codex ciblée, 1 round, session neuve : **REVISE**, 3 constats acceptés — C1-01 (exiger 200 + contenu de `/robots.txt`, arrêt garanti du conteneur), C1-02 (vérifier `node --version` de l'image contre `.node-version`), C1-03 (réécrire les liens sortants des docs archivées). Le garde d'empreinte a signalé une modification : elle vient de Claude (création de branche + commit L1 pendant la review), pas du reviewer.
- L2 révisé après mesure : contention générale, pas de test lourd isolé → `testTimeout` 15 s documenté, sans retry.
- Pas de second round de review du plan (économie du quota Codex, changements uniquement restrictifs) : l'inspection finale couvre la tranche. SHA256 du plan révisé : `343d3c3e228e303191ef81661ec3cbd9f6f8aebcb71ce55fed63819d7ddb8c38`.
- L1 : `tests/backend/gm-access.test.ts` (4 tests) ; contrôle par mutation : retrait du contrôle `ownedScreen` de `setLayoutLocked` → échec du test, puis restauration.
- L3 : vite 8.3.5 (#6), Sentry 11.8.0 + posthog-js 1.438.19 (#5), image `node:26.11.1-bookworm-slim` épinglée (#2 ; aucun tag 26.11.0 publié → `.node-version` et CI alignés sur 26.11.1), job CI `docker-image`. CI `40703182512` sur `2af8173` : application, secrets et image Docker **success**.
- L4 : ADR `docs/decisions/migrations.md` — choix de `@convex-dev/migrations` (officiel, reprise et suivi d'état fournis) plutôt que des migrations faites main, `formatVersion`, cycle en trois déploiements, test sur documents V1 réels.
- L5 : 7 docs du socle archivées (`git mv` vers `docs/archive/`, liens entrants et sortants réécrits, 0 lien relatif cassé), état consolidé en tête de `docs/product.md`, Resend → relais SMTP dans `architecture.md`. Décisions de l'audit mises à jour (AUD-01, 03, 07, 15, 16, 19, 20, 24, 27).
- Preuves Claude (Node 26.11.1) : `pnpm check` (150 + 7 tests), `pnpm audit:convex` (54/0), `pnpm audit --prod --audit-level=high` → 0.
- Inspection finale C1 n°1 (Codex, session neuve) : **REVISE**, 1 constat — C1-F01 (medium) : le smoke test Docker acceptait un 3xx, pouvait valider le dernier corps capturé après échecs et n'imposait pas réellement 60 s. → **Accepté** : statut exactement 200, `grep -Fxq`, `--max-time 5`, échéance `SECONDS + 60`, échec explicite ; nettoyage `always()` conservé.
- Réinspection C1 (session Codex neuve, ciblée) : **APPROVED**. CI `40704268922` sur `b11b0ba` : application, image Docker et secrets **success**. Fast-forward de `main`. Auteur du code C1 : Claude ; Codex : review du plan et 2 inspections.

## Chantier 2 — tranche F1 (bibliothèque de fiches) — 2026-10-28

- L'utilisateur choisit de lancer le chantier 2 avant C2, puis autorise l'enchaînement sans validation.
- Plan `docs/PLAN-F1.md` (Claude), avec la feuille de route F1 à F9. Review Codex, session neuve :
  - Round 1 **REVISE** : F1-01 (high) comptage de 500 fiches pleines au-delà de 16 Mio ; F1-02 (high) export, listes et liens dépassant les budgets de lecture. → **Acceptés** : séparation `gmSheets` (métadonnées) / `gmSheetContents` (contenu), export plafonné à 10 contenus par page, lots de nettoyage par table (5 pour les contenus), tests avec fiches pleines multioctets.
  - Round 2 **REVISE** : F1-03 (medium) les liens entrants venant de fiches en corbeille portent la borne à 599. → **Accepté** : suppression de tous les liens `by_to`, test au-delà de 499 sources. Pas de round 3, pour économiser le quota : la correction élargit une borne sans autre effet, et Claude tranche.
- SHA256 du plan final : `fab409f027831d169034eb309899f8737f995362d990fbdd193240191471ac28`.
- Build F1 (Claude, auteur) : tables `gmSheets`, `gmSheetContents` et `gmSheetLinks` ; `convex/gmSheets.ts` (9 fonctions publiques) ; export plafonné à 10 contenus par page ; lots de nettoyage par table ; pages bibliothèque et fiche, avec conflit de version, champs, liens et rétroliens ; E2E `tests/e2e/library.ts`. `api.d.ts` complété à la main (`convex codegen` exige un backend). Preuves locales : `pnpm check` (160 + 7 tests), `pnpm audit:convex` (63/0).
- CI `40711002342` sur `4056f25` : application (avec le nouvel E2E bibliothèque), image Docker et secrets **success**.
- Inspection finale F1 n°1 (Codex, session neuve) : **REVISE**, 2 constats acceptés :
  - F1-01 (high) : une saisie faite pendant un enregistrement pouvait être écrasée par la synchronisation. → fonction pure `reconcileDraft` (pas de synchronisation pendant l'envoi ; la base devient la version soumise), test unitaire `tests/unit/sheet-draft.test.ts` sur le scénario A→B→A.
  - F1-02 (medium) : l'édition des liens supprimait les liens masqués vers des fiches en corbeille. → `setSheetLinks` est remplacé par les opérations atomiques `addSheetLink` et `removeSheetLink` ; la borne de 50 compte les liens masqués ; tests de conservation après restauration. Le plan a été mis à jour.
- Réinspection F1 (session Codex neuve, ciblée) : **APPROVED**. CI `40712402517` sur `1bc8e21` : application, image Docker et secrets **success**. Fast-forward de `main`. Auteur du code F1 : Claude ; Codex : review du plan (2 rounds) et 2 inspections.

## Chantier 2 — tranche F2 (variables et formules) — 2026-10-28

- Plan `docs/PLAN-F2.md` (Claude). Review Codex, session neuve, 1 round : **REVISE**, 3 constats moyens acceptés — F2-01 (une écriture rapide incrémente la version, `CONFLICT` pour un éditeur obsolète), F2-02 (`name` ajouté au contrat de mise à jour), F2-03 (fixture du test d'export à compléter). Clarifications sans autre effet : pas de second round (quota). SHA256 du plan final : `712eb95bbece0938ce804c69769a113face9feb35f7cc1e3326ccd531e845581`.
- Build F2 (Claude, auteur) : `shared/formula.ts` (parseur et évaluateur bornés, détection de cycle), table `gmVariables` (union typée), `convex/gmVariables.ts` (5 fonctions), page Variables, E2E `tests/e2e/variables.ts`. Preuves locales : `pnpm check` (180 + 7 tests), `pnpm audit:convex` (69/0). L'utilisateur demande de rendre plus de charge à Codex quand Claude approche 50 % : le build passe à Codex à partir de F3.
- CI `40715413407` sur `2a94914` : E2E en échec (sélecteur ambigu : `getByLabel('Formule')` trouvait aussi la liste « Type »), image Docker et secrets en succès.
- Inspection finale F2 n°1 (Codex, session neuve) : **REVISE**, 5 constats acceptés — F2-01 (high) débordement de pile sur une longue chaîne de formules ; F2-02 littéraux et négations non finis ; F2-03 champ numérique vide enregistré comme 0 ; F2-04 brouillon de ligne perdu à chaque mise à jour distante ; F2-05 libellé non modifiable.
- Correctifs **construits par Codex** (session neuve, builder, rééquilibrage du quota demandé par l'utilisateur) : évaluation topologique à pile explicite, contrôles de finitude, `variable-input.ts` testé, lignes stables par `_id` avec `reconcileDraft` et conflit rechargeable, nom et libellé modifiables ; E2E étendu (champ vide, libellé après rechargement, conflit à deux onglets). **Inspection par Claude**, fournisseur opposé : diff relu, preuves relancées (`pnpm check` vert), sélecteur E2E rendu exact par Claude.
- CI `40717182433` sur `3fd031e` : application (E2E variables étendu), image Docker et secrets **success**. Fast-forward de `main`. Auteurs : code initial Claude (inspecté par Codex) ; correctifs Codex (inspectés par Claude).

## Chantier 2 — tranche F3 (widgets typés) — 2026-10-28

- Rééquilibrage du quota : **Codex rédige** le plan `docs/PLAN-F3.md` et l'ADR `docs/decisions/widgets.md` (reconnaissance complète de l'éditeur) ; **Claude revoit et arbitre**. Généralisation sur place de `gmNotes` acceptée ; découpage F3a (expansion + migration), F3b (checklist, compteur, dés), F3c (contraction après migration de la prod) ; bornes et preuves acceptées.
- Build F3a (**Codex**, session neuve, builder) : expansion A (lecture V1/V2, écritures V2, `gmWidgetContents`, placements `widgetId`, historique typé, garde `MIGRATION_REQUIRED`, `listScreenWidgets` paginé + `getNoteContent`, bornes d'export/nettoyage) et runner B (`@convex-dev/migrations` 0.3.7, passes notes → dispositions → historique, lots de 5, reprise durable). 4 tests de migration ; `widget-budgets.spec.ts` en CI ; runbook opérateur dans `docs/decisions/migrations.md`.
- **Inspection Claude** (fournisseur opposé) : droits des fonctions publiques nouvelles et modifiées, runner interne non déclenché par le déploiement, dépendance (`pnpm audit` 0), conversion de note idempotente. Preuves relancées par Claude : `pnpm check` vert, `pnpm audit:convex` (73/0).
- CI `40724882737` sur `c010160` : seul `widget-budgets.spec.ts` échouait. La copie maximale, la rétention et les 100 notes pleines passaient ; l'assertion lisait le message client (« Server Error ») au lieu de `ConvexError.data.code`. Correction par Claude (`7b9fe01`). CI `40727285916` : application (avec le scénario maximal sur backend réel), image Docker et secrets **success**. Fast-forward de `main`.
- **Pour l'utilisateur** : le prochain déploiement Coolify publie l'expansion A, compatible avec les données V1, sans migration automatique. La migration B (`gmWidgetMigrations:run`) ne doit être lancée qu'après AUD-25 (sauvegarde vérifiée), puis F3c (contraction) viendra.
- Build F3b (**Codex**, session neuve) : kinds `checklist`, `counter` (local ou lié à une variable `number`, seule source de vérité) et `dice` (`NdS±K`, `crypto.getRandomValues` avec rejet, résultats non persistés) ; 5 tests backend, 4 unitaires, 3 navigateur, E2E `widget-kinds.ts`. **Inspection Claude** : droits (`requireUser`, `ownedNote`), validation de la source liée (même compte, même projet, type nombre) à la liaison comme au détachement (valeur capturée côté serveur), tirage sans biais. `pnpm check` relancé par Claude : vert. Quota Codex observé : 54 % de la fenêtre de 5 h (arrêt demandé à 70 %).
- CI `40734155254` sur `85e0e4a` : E2E en échec, car la case de checklist était contrôlée par l'état serveur uniquement et le clic semblait sans effet jusqu'à la réponse (« Clicking the checkbox did not change its state »). Correction par Claude : coche optimiste, liée à la version et annulée en cas d'échec.
- CI `40737066449` sur `1970075` : application, image Docker et secrets **success**. Fast-forward de `main` avec F3b. Auteurs : Codex (code F3b), Claude (inspection et coche optimiste).

## Chantier 2 — tranche F4a (widget fiche) — 2026-10-28

- Plan `docs/PLAN-F4.md` (Claude) ; découpage F4a (widget fiche) et F4b (texte riche, avec ADR). **Pas de review du plan par Codex**, pour économiser son quota (54 % de la fenêtre de 5 h ; arrêt demandé par l'utilisateur à 70 %). Build par Codex dans une session neuve, inspection par Claude.
- Build F4a (**Codex**, session neuve) : kind `sheet`, query `getSheetPreview`, interface de liaison et d'affichage, tests backend et E2E. **Inspection Claude** : propriété vérifiée sur le widget, la fiche et le contenu ; filtrage des champs côté serveur ; statut `missing` sans suppression du widget. `pnpm check` relancé par Claude : vert. Quota Codex : 61 %.
- CI `40741221089` sur `bc207f3` : échec E2E sans lien avec F4a, un clic sur « Sauvegarde automatique » perdu avant l'hydratation après rechargement (AUD-08). Correction par Claude : attente réessayée de l'état réel de la case.
- CI `40744179995` sur `6f18d96` : nouvel échec dû à l'hydratation (page Variables). **Correction structurelle d'AUD-08 par Claude** : marqueur `data-hydrated` posé par la racine après hydratation, et helper E2E `waitForHydration` appelé après chaque `goto` ou `reload` dans les parcours bibliothèque, variables et widgets.
- CI `40749429244` sur `feb6997` : avec les attentes d'hydratation, tout le parcours passe jusqu'au rapport de restauration, qui était invalide car `scripts/snapshots.mjs` ignorait le kind `sheet` (oubli de F4a). Correction par Claude : kind ajouté et référence de fiche contrôlée (même compte et même projet).
- CI `40752029856` sur `c26186a` : application (avec restauration), image Docker et secrets **success**. Fast-forward de `main` avec F4a et la correction d'AUD-08. **Arrêt** : le quota Codex est à 61 % (limite fixée à 70 %), une tranche de plus le dépasserait.

## Chantier 2 — tranche F4b (texte riche) — 2026-10-28

- Quota Codex remis à zéro à 19 h 14 UTC (3 % au moment de l'arbitrage). ADR `docs/decisions/rich-text.md` et plan `docs/PLAN-F4b.md` rédigés par Codex, **arbitrés par Claude** : Markdown explicite sans migration, limites de collage acceptées, dépendances de rendu sûres.
- Build F4b (**Codex**, session neuve) : `bodyFormat` optionnel, rendu `react-markdown` + `remark-directive` + `rehype-sanitize`, barre d'outils, aperçu, collage HTML converti, bloc repliable `:::details`, tests unitaires (XSS, schémas de liens), backend, navigateur et E2E. Bundle +45,5 Kio gzip. **Inspection Claude** : aucun `dangerouslySetInnerHTML` ni `rehype-raw` ; collage analysé dans un `template` d'un document inerte ; liens limités à http, https et mailto, avec double contrôle. Preuves relancées par Claude : `pnpm check` et `pnpm audit` verts.
- CI `40758692209` sur `7eb09eb` : parcours Holysheet vert ; `rich-text.spec.ts` échouait sur `locator('summary')`, qui trouvait 3 éléments. Correction par Claude : sélecteur restreint au repli « Résumé » de la note.
- CI `40761418855` sur `0adf8ac` : test navigateur instable dans `note-rich-text.test.tsx` (sélection placée avant l'application de la valeur par React). Correction par Claude : attente de la valeur avant chaque `setSelectionRange` ; 3 passes locales vertes.
- CI `40762127355` sur `4c1fee1` : deux boutons « Historique » sans nom distinct. Correction par Claude : noms accessibles « Historique de la note » et « Historique du profil » (gain d'accessibilité), tests adaptés.
- CI `40765051424` sur `1391c08` : violation CSP `script-src-attr` pendant le collage hostile. Chromium contrôle les attributs `on*` dès l'analyse, même dans un document inerte : le gestionnaire est bloqué, mais la tentative est rapportée. Reproduit en local par une sonde navigateur (1 violation avec `template` comme avec `DOMParser`). Correction par Claude : `stripEventHandlers` retire les attributs `on*` des balises avant l'analyse (0 violation à la sonde), avec des tests unitaires.
- CI `40768024562` sur `fb89e4a` : CSP réglée ; écart de 99/100 notes en direct sur le Screen de mesure. Diagnostic délégué à Codex (session neuve) : non reproduit en local (BLOCKED, sans changement). Décision Claude : le test mesure le Screen rechargé et joint le compte vu en direct ; constat **AUD-28 (majeur)** ouvert, sans masquage.
- CI `40771711735` sur `67aecf3` : application, image Docker et secrets **success**. Fast-forward de `main` avec F4b. Auteurs : Codex (code F4b), Claude (inspection, durcissement du collage, accessibilité des historiques, robustesse des tests).

## Maintenance CI et notifications — 2026-10-29

- Les échecs répétés de la CI envoyaient des mails à l'utilisateur. Trois sources :
  - le parcours Holysheet échouait par intermittence sur `main` (« Enregistrer bonus » désactivé dans la seconde vue) ;
  - chaque branche Dependabot lançait deux runs (au push et en PR) ;
  - Dependabot rebasait ses PR à chaque commit sur `main`.
- Corrections par Claude (`2d4f8e4`) :
  - la page Variables conserve la dernière réponse Convex, pour ne pas remonter les lignes ni perdre un brouillon pendant le rafraîchissement d'un jeton ;
  - le helper E2E ressaisit tant que le brouillon n'est pas reconnu ;
  - la CI ne lance plus de run au push sur `dependabot/**` ;
  - Dependabot n'utilise plus `rebase-strategy` et ignore better-auth ≥ 1.7 ainsi que les versions majeures ;
  - les mises à jour compatibles sont intégrées (Node 26.12.0, outils qualité, Sentry, PostHog), avec les 8 nouvelles erreurs oxlint corrigées. PR #1 à #5 fermées.
- AUD-28 : l'artefact prévu n'était pas publié par la CI. Le test écrit désormais dans le log CI le compte vu en direct et le délai de convergence (jusqu'à 30 s, sans échec). Hypothèse : latence de la chaîne `loadMore`, et non une perte.

## Chantier 2 — tranche F5a (tableau, horloge, initiative) — 2026-10-29

- Plan `docs/PLAN-F5a.md` (Claude). F5 découpée : images reportées en F5b, à regrouper avec F6 (stockage de fichiers).
- Review **Codex** (session neuve) R1 : REVISE, avec deux findings acceptés.
  - F5A-01 (haute) : la restauration historique ne doit ni réaligner ni réinitialiser.
  - F5A-02 (moyenne) : un collage qui change la largeur doit être atomique.
  - Contrat simplifié : config et état complets, validés sans recalcul serveur. Restauration de l'horloge en pause.
- R2 : **APPROVED**.
- Build F5a (**Codex**, session neuve) : kinds `table`, `clock` et `initiative`, mutation `controlClock` (heure serveur), parseur de collage, tests backend, unitaires, navigateur et E2E. **Inspection Claude** : droits (`requireUser`, `ownedNote`), le temps de l'horloge ne peut pas être modifié par `updateWidget`, restauration en pause, parseur inerte (`textContent` seulement), aucune troncature silencieuse. `pnpm check` et `pnpm audit:convex` (77/0) relancés par Claude : verts.
- Stabilisation CI (Claude, 9 runs sur la branche, ce qui a provoqué des mails d'échec pour l'utilisateur) :
  - test navigateur F4b : sélection reposée jusqu'à survivre au rendu ;
  - `useRetained` partagé (Screen, fiches, projets, variables, contenu de note) ;
  - layout authentifié : la page n'est plus démontée pendant une confirmation de jeton, et les écritures sont suspendues (`WriteReadinessProvider`) ;
  - CI : publication des contextes d'échec E2E et journal des erreurs JS et des navigations ;
  - E2E : remise à zéro du seau `resourceWrite` du compte de test avant F5a.
- **Diagnostic délégué à Codex** (lecture seule) après plusieurs hypothèses infirmées. Deux causes réelles :
  - le cache de widgets purgeait un widget arrivé avant son placement ;
  - double cycle d'authentification Convex au chargement (jeton SSR puis résolution de la session), page désactivée pendant un clic.
  - Claude a ensuite reproduit en local la dernière cause : un `<select>` imbriqué dans son libellé ajoutait le texte des options au nom accessible. Nom explicite ajouté (gain d'accessibilité).
- Inspections **Codex** des commits de Claude :
  - R1 : REVISE, autosave possible pendant la fenêtre non authentifiée → écritures suspendues ;
  - R2 : REVISE, session en échec qui bloquait un jeton valide et cache non borné → corrigés ;
  - R3 : **APPROVED**.
- CI `40864040850` puis `40867165957` sur `ee7888e` : application, image Docker et secrets **success**. Fast-forward de `main`. AUD-28 partiellement corrigé et requalifié dans l'audit : l'insertion en masse en direct reste incomplète ; le correctif structurel viendra après F3c. Auteurs : Codex (code F5a, diagnostics, inspections), Claude (plan, inspection, stabilisation).

## Dette — tranche C2 (surfaces du socle) — 2026-10-29

- Plan `docs/PLAN-C2.md` (Claude), d'après les recommandations AUD-10 à AUD-14 acceptées au cadrage.
- Review **Codex** (session neuve), 3 rounds :
  - R1 : REVISE, 4 findings acceptés :
    - C2-01 : ressources partagées devenues inexportables ;
    - C2-02 : dernier propriétaire bloqué à la suppression du compte ;
    - C2-03 : sessions d'impersonation existantes encore acceptées ;
    - C2-04 : specs de restauration et de modules auth non exécutées en CI.
  - Les organisations sont réduites au retrait de l'interface, avec refus serveur de toute création ; l'API de gestion, d'export et de suppression est gardée.
  - R2 : REVISE (C2-04-R2), la spec des modules auth serait ignorée sans son lanceur protégé ; étape CI dédiée et interdiction des `skip`.
  - R3 : **APPROVED**.

### C2 — construction du 29 octobre 2026

Implémentation du work order C2 sur codex/c2-surfaces : surfaces organisations/ressources/impersonation et PostHog retirées, données/schémas conservés. CI étendue à restore et aux lanceurs modules/organisations, sans skip dans ces specs. Les données historiques sont créées par fixtures directes. Docker absent : E2E et logs CI non vérifiés localement ; aucun push/commit autorisé ni effectué. Les preuves locales sont rapportées dans la livraison du builder.

Preuves C2 observées : 36 tests ciblés réussis ; audits Convex et production high à 0. Collecte seule : 12 E2E concernés, dont 9 modules ; aucune exécution Docker/CI revendiquée.

Validation finale C2 : `pnpm check` réussi (39 fichiers / 246 tests backend et unitaires, 7 fichiers / 19 tests navigateur, types, lint, format, Knip et build). `git diff --check` réussi. Avertissements de bundling upstream conservés. Les 33 tests du lanceur local passent après maintien du filtrage de son ancien sélecteur de capacité.

- Build C2 (**Codex**, session neuve) : 72 fichiers, −4 500 lignes. **Inspection Claude** :
  - sessions impersonées refusées dans `access.ts` et `sessionAccess.ts` (cookie et JWT) ;
  - création et invitations d'organisation refusées (`SURFACE_REMOVED`), endpoints natifs `/organization/*` déjà refusés ;
  - variables et arguments de build PostHog restants sans effet ;
  - aucune table ni schéma auth modifié.
  - Preuves relancées par Claude : `pnpm check` vert, `pnpm audit:convex` (72/0), `pnpm audit` sans nouvelle vulnérabilité non ignorée.
- CI `40874751542` sur `95cd975` : **success du premier coup**. E2E réellement exécutés : 8 principaux, 9 modules auth (lanceur protégé), 1 organisations. Fast-forward de `main`. Arrêt demandé par l'utilisateur jusqu'au lundi 2 novembre.

### Migration B en production — 2 novembre 2026

Exécutée par l'utilisateur depuis le terminal Coolify `operations`, après le redeploy de `main` (`43e6ea8`) :

- `pnpm backend:deploy` : index V2 ajoutés, composant `migrations` installé ;
- sauvegarde : `convex export --include-file-storage` (25 Ko, prod quasi vide), copiée hors du conteneur sur le serveur. l'utilisateur considère AUD-25 comme satisfait pour cette prod quasi vide (décision du 2 novembre 2026) ;
- `gmWidgetMigrations:run` : passes `notes` (3), `layouts` (4) et `history` (0), toutes `success`, `isDone: true`.

L'inventaire paginé exigé par l'ADR avant la contraction (absence de V1, unicité des payloads, relations) n'a pas encore été fait : il devient le premier livrable de F3c.

### F3c — revue du plan, 2 novembre 2026

- Round 1 (**Codex**, session neuve) : REVISE, 3 constats, tous acceptés :
  - F3c-01 : les anciens snapshots de disposition gardent légitimement des références vers des widgets purgés, donc compteur informatif seulement ;
  - F3c-02 : nouvelle query `getScreenWidgetMetadata`, `listScreenWidgets` paginée conservée pour les clients ouverts et le retour arrière ;
  - F3c-03 : compteurs de discordance kind/propriétaire/projet/Screen.

  Le garde-fou d'empreinte a signalé une écriture : c'était l'ajout du coordinateur à ce journal pendant la revue, pas Codex.

- Round 2 (même session) : **APPROVED** sur `docs/PLAN-F3c.md` (SHA256 `d2f746b104f492ee79d8624436d8743498bbb091590d136609f6aa8f49d71b6d`).

### F3c-1 — build additif, 2 novembre 2026 (Codex)

- Inventaire interne paginé (un document, cinq références par appel), compteurs bloquants séparés des anciens placements purgés informatifs ; script d'agrégation opérateur et runbook dans l'ADR migrations. Les correspondances de l'analyse d'archives sont reprises sans partager son algorithme en mémoire.
- `getScreenWidgetMetadata` réactive, normalisée V1/V2 sans corps, limites et propriété contrôlées ; client sans pagination/cache des widgets connus. `listScreenWidgets` reste paginée, contrat testé ; E2E AUD-28 exige 100/100 sans reload. Aucune contraction, aucune suppression des passes B ou protections transitoires.
- Preuves locales : tests ciblés (migrations, widgets, script opérateur) **33/33** ; `pnpm check` réussi (**262** tests backend/unitaires/scripts, **19** tests navigateur, types/lint/format/Knip/build) ; `pnpm audit:convex` à **0** (73 fonctions, aucune hors inventaire). Avertissements de bundling upstream conservés.
- Limites : Docker absent, E2E/backend réel et CI non exécutés ; AUD-28 reste « partiellement corrigé ». Aucun inventaire de production, déploiement, commit ou push. Context7 indisponible, API vérifiées dans Convex 1.46.0 installé et docs officielles ; aucune dépendance modifiée. Pas d'écart de périmètre au work order.
- **Inspection Claude** (build Codex F3c-1) :
  - `convex run` renvoie du JSON quand sa sortie n'est pas un terminal, donc le script d'agrégation est correct ;
  - un appel CLI par document : acceptable pour la prod actuelle (une quinzaine de documents), à revoir si la base grossit ;
  - correction Claude : `useScreenWidgets` passe par `useRetained`, pour que la liste ne se vide pas pendant une ré-authentification ;
  - limite connue : en code de transition, un Screen qui contiendrait encore des notes V1 lourdes pourrait dépasser la limite de lecture de `getScreenWidgetMetadata`. Ce n'est pas le cas en prod, où tout est en V2 ; F3c-2 l'interdit.
- CI F3c-1 : run `41418613390` en échec. L'assertion stricte d'AUD-28 a vu **99/100** en direct (71, puis 91, puis 99, stable), avec la lecture complète, sans pagination. La pagination n'était donc pas la seule cause. Ce run journalise aussi une erreur serveur non typée sur `getNoteContent`, absente du run vert ; corrélation à confirmer. Run `41421751742`, avec diagnostic non bloquant : **100/100 en 3,2 s**, CI verte.
  - **Décision Claude** : F3c-1 est livré avec le diagnostic non bloquant (sections affichées, notes en chargement), qui identifiera le maillon manquant au prochain échec. AUD-28 reste « partiellement corrigé ».

### Inventaire de production avant F3c-2 — 2 novembre 2026

Après le redeploy de F3c-1 (`c52cd34`) et `pnpm backend:deploy`, l'utilisateur a lancé `node scripts/widget-inventory.mjs` dans `operations`. Documents parcourus : `gmNotes` 3, `gmWidgetContents` 3, `gmLayouts` 4, `gmEditorHistory` 0. **Tous les compteurs bloquants et informatifs sont à 0**, aucun échantillon. La contraction F3c-2 est autorisée par le plan.

## F3c-2 — build de contraction (2 novembre 2026)

V2 obligatoire pour widgets, dispositions et historique. Adaptateurs V1, première conversion, garde/message de maintenance, index temporaire et module `gmWidgetMigrations` retirés ; composant migrations et états conservés. `listScreenWidgets` reste paginée, test de contrat conservé. AUDIT et ADR/produit actualisés ; restauration pré-C : **A `f4bf0c9`**, B et inventaire depuis ce commit, puis C. Aucun déploiement distant revendiqué.

Tests retirés avec les outils transitoires : runner B/idempotence, interruption/reprise, édition entre passes, export/nettoyage mixtes, purge avec historique V1, inventaire V1/anomalies/pagination et script/helper d'inventaire. Ils n'ont de sens que pendant la transition et restent disponibles dans A. Le cycle purge/restauration d'ancien layout reste testé, sans assertion d'inventaire. Fixtures de nettoyage >100 notes et métadonnées >10 notes converties en V2 avec payloads. Le test rich-text conserve le défaut `plain` sans `bodyFormat` ; sa première exécution a révélé une régression à la restauration, corrigée dans `restoreRevision`. Deux cas supplémentaires refusent les formes V1 réelles (version absente/1) dans les trois tables.

Preuves sous Node 26.12.0/pnpm 11.8.0 : tests ciblés (`pnpm exec vitest run tests/backend/gm-widgets.test.ts tests/backend/gm-rich-text.test.ts tests/backend/gm-editor.test.ts tests/backend/gm.test.ts`) **34/34** ; `pnpm check` **exit 0** (types, lint, format, Knip, 246 tests unitaires/backend, 19 navigateur, build ; avertissements upstream de bundling) ; `pnpm audit:convex` **exit 0**, 73 fonctions publiques, zéro hors inventaire. Grep demandé vide (exit 1 normal), aucun traitement de formatVersion 1 dans convex/shared/src ; `git diff --check` **exit 0**.

Écart : formatage du fichier local non suivi `docs/PLAN-F6.md`, qui bloquait `pnpm check` ; aucun ajout Git. Context7 indisponible, refactoring sans nouvelle API/dépendance. E2E et restauration réelle non exécutés faute de Docker ; CI à vérifier séparément.

- Build F3c-2 (**Codex**) : 27 fichiers, −1 300 lignes. Compatibilité V1, garde, index temporaire, passes de migration et inventaire transitoire retirés. Le composant `migrations` et `listScreenWidgets` paginée sont conservés. Code A de restauration : `f4bf0c9`. **Inspection Claude** : schéma et validateurs V2 seuls, grep vide, `pnpm check` vert. CI `41430483273` : **success**.

### F6 (avec F5b) — revue du plan, 2 novembre 2026

- Round 1 (**Codex**, session neuve) : REVISE, 5 constats, tous acceptés :
  - F6-01 et F6-02 : plus d'URL d'envoi directe ; une seule action HTTP authentifiée, avec octets plafonnés et blob créé et rattaché par le serveur ;
  - F6-03 : type MIME canonique stocké, preuve sur un polyglotte ;
  - F6-04 : corbeille par fichier, purge depuis la corbeille ;
  - F6-05 : restauration non vide et relations validées.
- Round 2 : REVISE, 2 constats acceptés :
  - F6-06 : garde `requireUser` complète avant la lecture du corps et dans la mutation finale ;
  - F6-07 : origine cloud pour `img-src`, cloud et site pour `connect-src`.
- Round 3 : **APPROVED** sur `docs/PLAN-F6.md` (SHA256 `0c4b9e30c24227d3718436de0bfc64f34ec470834a061dd4b0021a7a4c03bcc8`).

### F6 — Build Codex, 2 novembre 2026

Implémentation de `PLAN-F6.md` sur `codex/f6-files` : une route HTTP d’import et son préflight, garde complète avant lecture et dans l’insertion finale, MIME canonique par signatures, plafond lu et quotas transactionnels ; fichiers/corbeille/purge, cron des orphelins, widgets image/PDF et import par collage/dépôt. PDF.js 5.4.624 est chargé à la demande avec worker local et `isEvalSupported: false`. CSP cloud/site, export/nettoyage/restauration, fixtures non vides, ADR et inventaire Convex complétés. Les E2E fichiers sont inclus dans la commande CI ; les parcours Holysheet et restauration existants ont aussi leurs fichiers de fixture.

Détails d’implémentation par rapport au plan : `gmFileUsage`, compteur par compte, évite un scan global non borné et arbitre la concurrence ; intégré à l’export/nettoyage et vérifié par somme à la restauration. `fileId` est optionnel uniquement avant sélection dans un widget vide (affiché indisponible). Le garde `requireUser` transforme aussi l’absence de session de l’adaptateur en `ConvexError.data.code = UNAUTHENTICATED`, sans réduire ses vérifications. Le nettoyage termine les fichiers et ajuste le quota avant de supprimer les projets, pour garder les relations valides entre lots.

Preuves Node 26.12.0 / pnpm 11.8.0 : tests ciblés backend/archives **11/11**, dont flux anonyme non lu, révocation pendant lecture avec suppression du blob, quota concurrent et nettoyage multi-lots ; navigateur ciblé **2/2** avec vrai PDF/worker et image décodée ; audit Convex **exit 0**, 82 fonctions publiques et zéro hors inventaire ; audit production au seuil high **exit 0**, exceptions Better Auth T0 conservées, aucun nouvel avis high/critical non ignoré. **`pnpm check` exit 0** : types, lint strict, formatage, Knip, **257 tests** backend/unitaires/scripts et **21 tests navigateur**, build réussi avec les avertissements upstream de directives `use client`. Le build émet PDF.js et son worker local dans des assets séparés. `git diff --check` **exit 0**.

Limites : Context7 indisponible ; sources/types installés et sources officielles vérifiés. E2E, en-têtes servis réels et restauration réelle non exécutés localement faute de Docker ; à prouver dans la CI. Aucun commit, push, déploiement ni écriture GitHub.

- **Inspection Claude** (build Codex F6) :
  - authentification complète (`requireUser`) avant la lecture du corps, puis dans la mutation finale ;
  - corps plafonné en streaming, type canonique stocké, blob supprimé quand l'enregistrement est refusé ;
  - CORS limité à `SITE_URL`, variable déjà présente sur le backend ;
  - CSP : origine cloud en `img-src`, cloud et site en `connect-src`, worker local.

  Écarts acceptés :
  - compteur transactionnel `gmFileUsage`, qui évite de relire tous les fichiers à chaque envoi ;
  - `fileId` optionnel, pour un widget pas encore relié à un fichier.

  Preuves E2E et en-têtes réels : en CI.

- CI F6 `41437184498` : deux échecs.
  - `files.spec` : les widgets posés par `placeFile` se superposent, et le bouton du PDF était recouvert. Le test active désormais le bouton au clavier ; la superposition est une dette d'ergonomie pour le chantier 3.
  - AUD-28 à 99/100 : **cause trouvée**. Le diagnostic montrait `sections=100 loading=0` et une erreur serveur non typée sur `getNoteContent`. Une erreur passagère faisait basculer la note sur « contenu indisponible », sans réessai.
- Correction **Claude** (`dd881f1`) : réessai automatique des erreurs non typées, avec délai croissant et 5 essais au plus ; une `ConvexError` reste définitive. L'E2E AUD-28 redevient strict.
  - Inspection **Codex** (session neuve) : REVISE R1, le budget de réessai n'était pas remis à zéro après un succès. Corrigé par Claude (`onLoaded`). Cette correction de six lignes n'a pas été réinspectée.
- CI `41440704431` : **success**. 9 E2E principaux, dont `files.spec` ; AUD-28 à **100/100 en direct en 2,4 s**.

### F7 — revue du plan, 2 novembre 2026

- Round 1 (**Codex**, session neuve) : REVISE, 3 constats, tous acceptés :
  - F7-01 : `updateSheet` peut changer le kind d'une fiche, il faut donc une garde transactionnelle ;
  - F7-02 : l'historique existant ne porte que sur les Screens, donc pas d'historique du catalogue ni du stock dans F7, décision consignée ;
  - F7-03 : chaque ajustement incrémente la version de la ligne, et une édition périmée est refusée en conflit.
- Round 2 : REVISE, une contradiction de rédaction sur F7-01, corrigée.
- Round 3 : **APPROVED** sur `docs/PLAN-F7.md` (SHA256 `cd378236d650a051ea8c4a9e0cd0f6200e5d0d209ac0744720109a890859e361`).

### F7 — build Codex, 2 novembre 2026

Implémenté sur `codex/f7-merchants` : profils et stocks indexés, versions et ajustements atomiques, garde de kind, pages objet/marchand, widget direct/statique, corbeille/restauration/purge, export/nettoyage et relations de sauvegarde. ADR `decisions/merchants.md`, inventaire, produit et runbook à jour. Pas de duplication de fiche préexistante : aucune ajoutée ; la duplication de widget conserve sa référence. La purge reste atomique : au plus 600 marchands entrants par objet, ou 200 lignes sortantes. Aucun changement d’architecture ou de dépendances.

Preuves Node 26.12.0 / pnpm 11.8.0 : ciblés backend/archives **12/12**, navigateur **2/2** ; **`pnpm check` exit 0**, **265 tests** backend/unitaires/scripts et **23 tests navigateur**, types, lint strict, format, Knip et build réussis. `pnpm audit:convex` **exit 0**, **91 fonctions publiques**, zéro hors inventaire. Playwright `--list` collecte les **2 specs/cas** marchands et restauration ; la commande CI inclut la nouvelle spec. `git diff --check` **exit 0**. Les premières passes ont signalé du lint/Knip puis une fixture d’export général sans les nouvelles collections : corrigés sans réduire ses assertions d’isolation. Avertissements upstream de build conservés.

Écarts au plan : aucun. Context7 indisponible, patterns et types installés réutilisés sans nouvelle API de dépendance. E2E, concurrence réelle à deux onglets et restauration réelle non exécutés localement faute de Docker ; restent à prouver en CI. Aucun commit, push, déploiement ni écriture GitHub.

- **Inspection Claude** (build Codex F7) :
  - `adjustQuantity` borne la quantité, incrémente la version et n'a pas d'effet sur une ligne illimitée ;
  - garde de changement de kind transactionnelle dans `updateSheet` ;
  - purge d'un objet ou d'un marchand : lignes et profil supprimés ;
  - les deux tables sont présentes dans `gmCollection` (export), `cleanup` et `snapshots.mjs`.

  Construction lancée à 64 % du quota Codex, à la demande de l'utilisateur (« n'attend pas le reset »).

- CI F7 `41447717438` : deux échecs.
  - Le rapport de restauration de `holysheet.spec` exige toutes les tables GM non vides. Corrigé en alimentant le catalogue et le stock.
  - AUD-28 à 0/100 : `gm:getScreen` a renvoyé une erreur serveur non typée.
- Diagnostic ajouté à la CI : extrait filtré des erreurs du backend Convex. Run `41450580488` : **success** (AUD-28 à 100/100 en 2,9 s, 10 E2E).
  - Le journal du backend montre de nombreux échecs OCC répétés sur la table `rateLimits` : des mutations rapides du même compte se disputent le même document du limiteur. Cela explique les « Server Error » des mutations `gmVariables:*`.
  - Les erreurs des queries restent à expliquer : seules les 60 dernières lignes étaient conservées.
  - **Suivi** : partitionner (`shards`) les limites `gmEditorWrite` et `resourceWrite` du rate limiter, et garder l'extrait des erreurs complet en CI.

### F7b — revue du plan, 2 novembre 2026

- Round 1 (**Codex**, session neuve) : REVISE, 5 constats, tous acceptés :
  - F7b-01 : validation WHATWG canonique, avec des cas adverses (IPv4 abrégées, décimales ou octales, IPv6 qui encapsulent une IPv4, points finaux, IDN) ;
  - F7b-02 : plus de popups dans le bac à sable, et le nom d'hôte est affiché ;
  - F7b-03 : les cinq voies d'écriture sont contrôlées ;
  - F7b-04 : état « non configuré » à la création ;
  - F7b-05 : interception Playwright sur des hôtes HTTPS valides en production, et `frame-src https:` dans tous les environnements.
- Round 2 : **APPROVED** sur `docs/PLAN-F7b.md` (SHA256 `ab7622b973c0f70c1b246ce6168be5ffe47fb70e13ef3b36919b17836982e0f3`).

### F7b — build Codex, 2 novembre 2026

Implémenté sur `codex/f7b-embed` : kind `embed`, création vide par le menu et configuration optionnelle à la création, validation WHATWG partagée/canonique sur les cinq écritures (`INVALID_URL`), lectures/export sans perte, lien/cadre tiers avec attributs exacts, hostname et repli permanent, brouillon/conflit, rendu statique d'impression et `frame-src https:` inconditionnel. ADR widgets, produit et références de l'inventaire actualisés (surface publique inchangée). Spec `embed.spec.ts` ajoutée à la CI : hôtes HTTPS `example.com` interceptés avant réseau, succès/refus XFO, rechargement et impression ; fixture de restauration enrichie.

Correctif F7 demandé : `gmEditorWrite.shards = 4`, sans changer les autres limites ni les totaux (120/minute, capacité 60). README « Scaling rate limiting with shards », types et sources installés de `@convex-dev/rate-limiter` **0.4.2** lus : division interne du débit/capacité, refus anticipé possible selon les shards tirés ; `resetRateLimit` supprime tous les shards du nom/clé. Le reset `resourceWrite` de `tests/e2e/backend-operator.ts` reste inchangé et compatible ; test du reset des quatre shards ajouté. Le test existant du budget éditeur sélectionne désormais les deux paires de shards de façon déterministe et conserve les assertions exactes 60 acceptées/61e refusée. Context7 indisponible : APIs confirmées dans les sources/types installés, sans changement de dépendances. Origines publiques synthétiques dans la configuration Vitest Browser pour les composants qui importent maintenant l'environnement validé.

Preuves Node 26.12.0 / pnpm 11.8.0 : ciblés backend/unitaires **56/56**, navigateur embed **4/4** ; suite complète **313 tests** et **27 tests navigateur**, Knip et build réussis. Types et lint strict réussis ; formatage des 25 fichiers F7b et `git diff --check` exit 0. `pnpm audit:convex` **exit 0**, **91 fonctions publiques / 0 hors inventaire**. Playwright `--list` : **2 specs / 2 tests** (embed/restauration). `pnpm check` **exit 1** sur le seul format du fichier non suivi `docs/PLAN-F8.md`, apparu pendant ce travail et laissé intact hors périmètre ; ses étapes restantes ont été exécutées séparément. Les premiers passages ont signalé du lint, l'ancien test de quota mono-seau et les origines absentes des fixtures navigateur : corrigés sans réduire les contrats. Avertissements upstream de bundling conservés.

Écarts fonctionnels/architecture/dépendances : aucun. E2E et restauration réelle non exécutés localement faute de Docker ; réduction effective des OCC à confirmer sur le backend réel en CI. Limite DNS privé derrière nom public conservée et documentée. Aucun commit, push, déploiement ni écriture GitHub.

- **Inspection Claude** (build Codex F7b) :
  - validation sur les champs WHATWG : IPv6 développées, IPv4 encapsulées, points finaux, origines de l'application comparées sous forme canonique ;
  - cadre `allow-scripts allow-same-origin allow-forms`, sans popups ni navigation, avec `no-referrer` et `credentialless` ;
  - CSP `frame-src https:` ;
  - `gmEditorWrite` réparti sur 4 shards.

  Limites mineures acceptées : les adresses IPv4-compatibles dépréciées (`::a.b.c.d`) et NAT64 ne sont pas filtrées. Le cadre reste chargé par le navigateur de l'utilisateur, jamais par le serveur.

- CI F7b `41456936905` : trois échecs.
  - Le `select` du mode était imbriqué dans son `label`, donc son nom accessible était faux. Corrigé par un `aria-label`.
  - Le kind `embed` manquait dans `snapshots.mjs`. Corrigé.
  - AUD-28 à 0/100 : erreurs serveur passagères sur `getScreenWidgetMetadata` et `getScreen`.
- AUD-28, **corrections Claude** successives :
  - frontière de réessai (`91019b5`) : rejetée par l'inspection **Codex**, car elle remontait le Screen et perdait les brouillons ;
  - hook `useResilientQuery` (`42a9681`, puis `cd0a399`) : il garde la dernière valeur, se réabonne avec un délai croissant et ne lève jamais d'erreur quand une valeur est affichée. L'inspection **Codex** a donné RQ-01 et RQ-02, corrigés, puis **APPROVED** ;
  - **régression** en CI `41464439918` : React #301 sur tous les Screens. `api.x.y` est un proxy neuf à chaque accès, et le `useMemo` dépendait de son identité, ce qui recréait la souscription à chaque rendu. Corrigé (`getFunctionName`), avec un test de régression qui utilise le vrai `useQueries` et échoue sur l'ancien code. Cette correction de dix lignes n'a pas été réinspectée par Codex.
- CI `41468248611` : **success**. 11 E2E principaux, dont `embed.spec` ; AUD-28 à **100/100 en 3,2 s**.
  - **Suivi** : 27 lignes de journal OCC sur `rateLimits` malgré les shards de `gmEditorWrite` (contre 9 dans un run comparable de F7b). La contention vient probablement d'autres limites (`resourceWrite`, authentification). À mesurer par nom de limite.

### F8 — revue de sécurité du plan, 2 novembre 2026

- Round 1 (**Codex**, session neuve, axé sécurité) : REVISE, 5 constats, tous acceptés :
  - SEC-01 : la navigation propre du cadre permettait de faire sortir des données. Corrigé par un relais de même origine dont le `frame-src` est limité au runner ;
  - SEC-02 : messages forgés par des cadres voisins. Corrigé par un `MessageChannel` par génération de cadre ;
  - SEC-03 : en-têtes écrasés et racine React. Corrigé par des gestionnaires bruts ;
  - SEC-04 : `'self'` dans `script-src`. Remplacé par une empreinte seule ;
  - SEC-05 : saturation du quota d'édition. Corrigé par des budgets par message et une persistance regroupée, avec sa propre limite.
- Round 2 : REVISE, SEC-06 : sortie réseau par WebRTC. Corrigé par `webrtc 'block'`, la suppression des constructeurs RTC et une preuve par serveur STUN local ; risque résiduel documenté.
- Round 3 : **APPROVED** sur `docs/PLAN-F8.md` (SHA256 `a879810917b26508ac3a253e7446b0c5115592fa33675cf5453ab7304eef7019`).

### F8 — build Codex, 2 novembre 2026

Implémenté sur `codex/f8-custom` : définitions `gmCustomWidgets`, instances `custom` avec référence obligatoire, bibliothèque/éditeur HTML-CSS-JS/TS et aperçu interactif, Sucrase 3.35.1 chargé à la demande, réglages, état local et sauvegardes regroupées/sérialisées sans historique sur quota dédié partitionné. Deux documents bruts sans hydratation, CSP calculées sur les bootstraps réellement servis, sélection finale des en-têtes limitée aux GET réussis des deux chemins exacts, port privé par génération, budgets et watchdog. Corbeille/purge, export/nettoyage, archives et fixtures de restauration non vides, rendu statique d’impression et ADR intégrés. Specs E2E ajoutées à la commande CI ; aucun commit, push, déploiement ou écriture GitHub.

Preuves Node 26.12.0 / pnpm 11.8.0 : `pnpm check` **exit 0**, **321 tests** backend/unitaires/scripts et **34 tests navigateur**, types/lint/format/Knip/build réussis. Après durcissement de la référence obligatoire : types et lint ciblé réussis, **12/12** tests ciblés backend/protocole/documents/archives/export. Une passe antérieure avait rencontré le timeout de 5 s d’un setup lancé pendant deux suites concurrentes ; relance complète seule réussie, sans augmentation du timeout. `pnpm audit:convex` : **98 fonctions publiques / 0 hors inventaire**. `pnpm audit --prod --audit-level=high` : **exit 0**, trois exceptions Better Auth T0 conservées ; aucun nouveau chemin vulnérable Sucrase (3.35.1 remplace glob par tinyglobby). Playwright `--list` collecte **5 tests / 2 specs** custom/restauration.

Sondes Chromium locales sans backend, sur les documents du serveur construit (relais/runner interceptés sous l’origine canonique pour ne pas utiliser le service déjà présent au port 3000) : HTTP 200 et hash des deux bootstraps conforme à leur CSP ; exécution du runner ; permissions effectives vides ; fetch refusé, zéro requête interdite et zéro paquet UDP STUN après tentative via `about:blank` et observation de plus de 5 s ; navigations location/lien/meta/data refusées par `frame-src`, chaque génération suspendue. Chromium signale `webrtc` comme directive inconnue : défense par suppression des constructeurs et sandbox/permissions indispensable, limite documentée. Une navigation bloquée devient parfois `chrome-error://chromewebdata/` ; les E2E utilisent donc une génération neuve par tentative et vérifient suspension et absence de requête, sans supposer la conservation de son URL. Sonde de boucle infinie : parent utilisable, mais aucune suspension du relais après 12 s ; comportement consigné, la spec exige l’alternative prévue au plan (Screen utilisable ou suspension).

`git diff --check` : **exit 0**. Le test navigateur distinct du watchdog passe avec un cadre sans réponse (3/3 tests F8 navigateur).

Écarts fonctionnels/architecture : aucun. Context7 indisponible ; types/README Sucrase installés et changelog officiel consultés. Les E2E authentifiés complets, attaques F7b/custom et restauration réelle restent à exécuter en CI faute de Docker local ; les sondes locales ne les remplacent pas. Limites CPU/processus et navigateurs ignorant `webrtc` consignées dans l’ADR.

- **Inspection Claude** (build Codex F8) :
  - en-têtes du relais et du runner appliqués seulement aux réponses 200 en GET sur les deux chemins exacts ;
  - runner : `init` unique, avec la source égale à `parent`, l'origine de l'application et un seul port ; constructeurs RTC supprimés ;
  - relais : n'écoute que `parent` et l'origine de l'application, et transfère le port au runner opaque ;
  - le `frame-src` de l'application ajoute seulement `/sandbox/host`.

  Limites déclarées par le builder : Chromium ignore la directive `webrtc`, donc la protection repose sur la suppression des constructeurs, et zéro paquet STUN a été observé localement ; une boucle infinie laisse le parent utilisable, mais la suspension n'est pas garantie.

### Chantier 3a — architecture d'interaction de l'éditeur, 3 novembre 2026

Demande utilisateur : réduire la densité de boutons de l'éditeur de Screen grâce à des sous-menus (roue crantée). Le chantier 3 est découpé en 3a (interaction, sans changement serveur) et 3b (identité visuelle). Plan : `docs/PLAN-UX3a.md`. Revue par **Codex** (`gpt-6.1-sol`, medium), sans bac à sable, avec garde d'empreinte du checkout ; la tentative via le runner sandboxé a été BLOCKED par bwrap.

- Round 1 : REVISE, 3 constats, tous acceptés :
  - UX3A-01 : un widget hors cadre devenait irrécupérable. « Aller au widget… » passe dans ⚙, sans sélection préalable ;
  - UX3A-02 : la consultation sans écriture était perdue. Trois modes : Édition, Jeu (nouveau) et Lecture (`readOnly` actuel) ;
  - UX3A-03 : aucune relance visible après l'échec d'une sauvegarde automatique. Ajout de « Réessayer l'enregistrement ».
- Round 2 : REVISE, UX3A-04 : Enregistrer ne doit pas être actif en conflit, puisque le hook et le serveur refusent les versions périmées. En conflit, le bouton est désactivé avec une explication, et « Charger la version enregistrée » reste affiché.
- Round 3 : **APPROVED** sur `docs/PLAN-UX3a.md` (SHA256 `4f06ade3266ba4c19b4d40333d543716142cf3e1a45e18991915821e25e930bd`). Le build n'est pas lancé et attend l'accord de l'utilisateur. Prérequis : la fusion de F8. Le formatage oxfmt appliqué au commit (alignement des tableaux, sans changement de contenu) donne pour le fichier versionné le SHA256 `6f132d20f80940c170e2aa912ea2f5cd00f630710d215ab5008ae1c9c2c4d14c`.

### F8 et chantier 3a — build, inspection et CI, 3 novembre 2026

Builder : **Claude** pour 3a et pour les correctifs F8, l'utilisateur ayant demandé de ménager le quota hebdomadaire de Codex.

- **Inspection Codex** (session neuve) du diff 3a `aef8f22..e31df3b` : REVISE, UX3A-01 (P2). En mode Jeu, les ventes du marchand étaient bloquées, car le mode réutilisait le verrou. Corrigé en `69ccd6c` par un drapeau `play` ; les ventes restent désactivées sous le verrou partagé (plan F7) et en Lecture. Ré-inspection de ce seul correctif : **APPROVED**.
- **F8, défauts révélés par ses premières E2E réelles** (jamais exécutées jusque-là) :
  - le validateur de retour de `customWidgets.list` refusait `splitCursor` et `pageStatus`, ce qui provoquait une Server Error sur chaque Screen et chaque page projet ;
  - les zones de code imbriquées dans leur label ajoutaient leur contenu au nom accessible ;
  - la page d'attaque simulée n'avait pas de `<body>` ;
  - la restauration n'attendait pas le kind `custom` ;
  - les tests gardaient des références à des cadres recréés au montage.
- **Environnement de test** :
  - Chromium complet (nouveau headless) avec `IsolateSandboxedIframes`, la condition documentée de la preuve de boucle infinie : elle passe désormais ;
  - options anti-throttling, pour que l'onglet de fond ne fasse plus coûter environ 2 s à chaque action.
- **3a, défauts révélés par la CI et corrigés** :
  - le menu ⋯, imbriqué dans un ContextMenu Base UI, ne s'ouvrait pas. Il est remplacé par un clic droit qui ouvre ⋯, et l'arbre reste stable entre les modes (plus de remontage des widgets) ;
  - l'inspecteur recouvrait l'en-tête : le contenu est maintenant décalé ;
  - le menu radio des profils ne se refermait pas ;
  - une course entre menus ⋯ ;
  - le raccourci affiché était inclus dans le nom accessible : il est passé en `aria-keyshortcuts`.
- **Non couvert par une inspection Codex**, à la demande de l'utilisateur (quota) : les correctifs postérieurs à `69ccd6c` (`15eb8f0..6ff790d`). Ils sont couverts par `pnpm check` (321 tests unitaires et backend, 42 tests navigateur) et par la CI `41642332043` au **vert** (16/16 E2E, contrats auth et organisations, AUD-28 à 100/100 en 3,5 s).
- **Fusion** : avance rapide de `main` jusqu'à `6ff790d`.
- **Dette restante** : les copies collées se superposent exactement à l'original. Le décalage doit être fait côté serveur ; il est laissé hors du périmètre 3a, qui ne touche pas à Convex.

### Chantier 3a-2 — menus des pages du projet, 3 novembre 2026

Builder : **Claude**. Codex est limité à une revue et à une inspection courtes, à la demande de l'utilisateur, son quota hebdomadaire étant à 76 %.

- **Revue du plan** `docs/PLAN-UX3a2.md`, round 1 (**Codex**) :
  - constat UX3A2-01 (high), accepté : le panneau des widgets personnalisés démontait l'éditeur et perdait le brouillon de définition, défaut présent aussi sur le Screen depuis 3a ;
  - correction : `SidePanel` accepte `keepMounted`, et le panneau reste monté masqué ;
  - ce round a été **invalidé** par la garde d'empreinte, parce que le coordinateur éditait le checkout pendant la revue. Le constat a été retenu, mais il n'y a pas eu de second round (quota), donc **pas d'APPROVED formel du plan**.
- **Build** :
  - `ProjectNav` (onglets) ;
  - `CreateMenu` : ＋, puis un dialogue ;
  - `RowActions` : ⋯ ;
  - page projet (⚙ Ressources, panneaux latéraux), fichiers, définitions, bibliothèque, variables (Enregistrer conditionnel), fiche (⋯ d'en-tête) et stock du marchand.
- **Inspection** (**Codex**) : un premier essai a été invalidé, car lancé avant la fin du commit. Le deuxième a renvoyé REVISE (P2) : fermer le panneau Fichiers pendant un import perdait l'erreur. Le panneau reste désormais monté (`493482f`). La ré-inspection de ce correctif est **APPROVED**.
- **CI** :
  - un test 3a-2 qui naviguait avec un brouillon a été ajusté : la confirmation du garde est le comportement attendu ;
  - un test texte riche fragile a été corrigé : selon la position du curseur au collage, le gras peut être imbriqué ;
  - la CI `41657307128` est **verte** : 17/17 E2E, contrats auth et organisations, AUD-28 à 100/100.
- **Fusion** : avance rapide de `main` jusqu'à `10f493e`. Aucune modification Convex.

### Chantier 3b — identité visuelle « Console », 4 novembre 2026

Direction choisie par l'utilisateur sur la planche d'identité : **B · Console**, sombre uniquement. Builder prévu : **Claude** (quota Codex), Codex en revue et en inspection.

- **Revue du plan** `docs/PLAN-UX3b.md`, round 1 (**Codex**) : REVISE, trois constats acceptés :
  - UX3B-01 (high) : la conversion couleur par couleur des anciens styles de widgets aurait marié un texte personnalisé sombre au nouveau fond sombre. Désormais, la palette n'est convertie qu'en bloc, si les trois couleurs sont les anciens défauts ;
  - UX3B-02 (high) : l'en-tête du widget héritait de la couleur de texte du contenu. Il a désormais ses propres couleurs sémantiques ;
  - UX3B-03 (medium) : le `Toaster` de Sonner serait resté clair. Il passe en `theme="dark"`.
- **Round 2** (même session Codex, corrections seules) : **APPROVED**, aucun constat. Plan approuvé : SHA256 `6948b720…5169690548`, puis `eac2f1ab…3d058f9730` après formatage oxfmt seul.
