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
