# Vérifications du socle

> **Historique des preuves, non prescriptif.** Chaque entrée décrit les commandes et résultats observés à sa date et dans son périmètre. Un ancien succès ne valide pas le checkout courant ou la production. Pour choisir les contrôles actuels, suivre [la matrice agents](../agent-patterns.md#choisir-les-vérifications) et [development.md](../development.md).

## Revue approfondie des corrections d’adoption — 22 octobre 2026

Contrat relu : les trois corrections d’adoption, sans logique métier importée, comparées au commit de base `e265fa9`. Relecture des appels privés, du proxy HTTP, des cookies, des hooks Better Auth 1.6.22 installés, des fixtures opérateur, des bindings Docker et du pipeline CI. Les versions, le lockfile et le schéma d’auth généré restent inchangés.

| Constat corrigé pendant la revue | Correction et preuve |
| --- | --- |
| Le filtre Docker `publish` vise le port conteneur, ce qui manquait les conflits sur ports hôte personnalisés et bloquait des checkouts pourtant distincts | `scripts/local-config.mjs` inspecte uniquement les bindings TCP hôte et le label projet. Trois régressions ont échoué avant correction : conflit hôte personnalisé avec/sans label Compose, et coexistence sur des ports hôte distincts. Le cas propriétaire reste accepté. Les bindings réels des projets locaux ont confirmé le comportement, sans mutation |
| Le port HTTP standard `80` est supprimé par `URL.port`, puis converti en `0` par Vite | `vite.config.ts` conserve explicitement `80` pour dev et preview ; chargement réel de la configuration en échec avant correction, puis réussi |
| Un issuer HTTP loopback sans port explicite ne bénéficiait pas du transport JWKS Docker | `convex/auth.config.ts` reconnaît aussi ces origines canoniques sans modifier l’issuer, l’audience ou l’algorithme. Deux cas ont échoué avant correction ; les quatre cas de `tests/backend/auth-config.test.ts`, dont l’issuer HTTPS de production, passent |
| La CI pouvait appeler la commande intégrée pnpm au lieu du diagnostic du dépôt | `.github/workflows/ci.yml` appelle explicitement `pnpm run doctor` |

L’adaptation du plugin MFA demeure limitée au matcher de `/sign-in/email`. Les contrôles de mot de passe, les endpoints de vérification, les quotas et les schémas du plugin restent présents. Les sessions primaires ne reçoivent aucune assurance héritée : lectures et écritures privées restent refusées jusqu’à vérification du facteur exact. Le flag MFA désactivé ne libère pas les comptes enrôlés. La révocation et le remplacement/restauration de session restent contrôlés côté serveur. `getAccessState` retourne seulement `hasPassword`, jamais le hash. Le refus d’`Authorization` précède toujours les plugins et JWKS reste public. Aucun cache de session, contournement CSRF/origines, endpoint de test ou dépendance supplémentaire n’a été introduit.

La documentation du cookie d’annulation précise désormais que c’est le jeton de la session précédente qui ne passe jamais dans le JSON de ce parcours ; elle ne généralise pas cette propriété aux réponses natives du SDK Better Auth.

| Validation locale sur le diff corrigé | Résultat |
| --- | --- |
| `pnpm check` | **108 tests backend/scripts**, **4 Browser Mode**, types, lint, format, Knip et build réussis |
| Tests scripts ciblés | **33 réussis** ; fixture Docker conforme à la sémantique réelle des ports publiés |
| `pnpm test:e2e:local` | **19 réussis**, 12 optionnels ignorés |
| `pnpm test:e2e:local modules` | **9 réussis** ; une exécution directe du script modules a également réussi |
| `pnpm backup:verify` | **27 tables**, **0 fichier**, comparaison canonique et préservation des fichiers d’environnement source réussies sur une cible vierge |
| Browser Mode analytics dans le chemin accentué avec espaces | **1 réussi**, provider simulé observé, brouillon préservé et aucun transport analytics utilisé |
| `pnpm test:e2e:local spotlight` | **1 réussi**, livraison réelle de l’exception expurgée au sidecar local sur le port hôte personnalisé `9169` |
| `pnpm test:e2e:local observability` | **1 réussi**, SDK sous CSP de production avec endpoints SaaS interceptés par le test |
| `pnpm run doctor` | Configuration et services du checkout isolé validés |
| `git diff --check` | Réussi |

Une première suite personnelle a rencontré une erreur serveur ponctuelle dans la fixture de restauration. Le test ciblé puis la suite personnelle complète ont réussi sans changement du test ni des données. Le préambule CLI modules a également échoué une fois avant les scénarios ; une instrumentation temporaire limitée aux noms d’opérations, statuts et catégories d’erreur a été utilisée sans afficher de valeur privée. L’exécution diagnostique puis le lanceur complet ont réussi ; l’instrumentation est retirée. Ces causes intermittentes ne sont pas établies, et aucun délai, retry ou garde de production n’a été assoupli pour obtenir les succès.

**Revue finale : conformité à la demande PASS ; standards du dépôt PASS.** Aucun défaut actionnable restant identifié dans ce périmètre. Les preuves ci-dessus sont locales ; la CI distante est vérifiée séparément après le push. Les limites de restauration de fichiers non vides, de reconnexion depuis archive et de production/SaaS réels restent celles de l’entrée d’adoption ci-dessous.

## Corrections d’adoption — 22 octobre 2026

Périmètre : ports hôte configurables par checkout, transport JWKS Docker distinct de l’issuer, credentials optionnels compatibles avec les assurances MFA du socle et mocks analytics canoniques. Le défaut passwordless reste actif ; aucune logique métier extérieure ni dépendance supplémentaire n’a été ajoutée.

Les essais Docker ont utilisé une copie isolée du checkout dans un chemin contenant accents et espaces, avec un PostgreSQL et un backend neufs : application `3400`, API hôte `3410`, HTTP hôte `3411`, dashboard `6991`, Mailpit `8225`, Spotlight `9169`. Les ports internes Convex restent `3210/3211`. Aucun fichier de secrets d’un projet existant n’a été copié dans cette cible.

| Vérification | Résultat observé |
| --- | --- |
| Reproductions avant correction | Le setup ignorait les ports personnalisés ; le handler credentials réel renvoyait le challenge natif du plugin sans session primaire ; Browser Mode chargeait le vrai module `env` dans le chemin accentué malgré le mock relatif. Ces trois boucles passent après correction |
| `pnpm auth:generate` | Réussi ; aucun diff du schéma généré ni du lockfile |
| `pnpm check` final | Réussi : TypeScript, lint, format, Knip, **101 tests backend/scripts**, **4 tests Browser Mode**, build SSR |
| `pnpm setup`, `pnpm backend:push`, `pnpm run doctor` isolés | Réussis, y compris premier déploiement sans nouvelle variable privée requise par `auth.config.ts` |
| `pnpm test:e2e:local` | **19 réussis**, 11 optionnels ignorés à cette exécution ; serveur construit, connexion et lectures privées après SSR sur ports hôte distincts des ports internes, OTP/passkeys, révocation, dashboard, JWKS public et restauration |
| `pnpm test:e2e:local modules` | **9 réussis** : OTP et credentials, TOTP valide/incorrect, lectures ET écritures privées refusées avant challenge, récupération consommée une fois, abandon/restauration puis remplacement de session, support, lien email, pont privé/JWKS, mot de passe courant ET preuve d’identité pour gérer la MFA |
| Assurance backend | Le test existant étendu refuse aussi les écritures quand le flag MFA est désactivé ; la rotation du facteur rejette l’ancienne assurance. Le test HTTP credentials exerce le vrai handler et le plugin installés |
| Formulaire credentials avant hydratation | Nouvelle preuve SSR sans JavaScript : échec sur le formulaire initial sans méthode POST ; succès avec POST et contrôles désactivés avant hydratation. Le test de gestion MFA attend la réponse HTTP et le rechargement après rotation du cookie avant le nettoyage |
| Browser Mode dans le chemin accentué | Vrai Chromium, brouillon conservé avant/après chargement différé et erreur du tracker ; marqueur du provider simulé observé, aucun fetch, beacon ou XHR du tracker. Aucun changement de production destiné uniquement au test |
| `pnpm backup:verify` autonome | Réussi : **27 tables**, **0 fichier stocké**, déploiement vierge puis import/réexport et comparaison canonique sur ports jetables distincts. Fichiers d’environnement source préservés ; seules les ressources créées par cette restauration ont été retirées |
| Configuration JWT | Issuer loopback externe conservé et JWKS interne vérifiés ; issuer HTTPS et transport JWKS de production inchangés au chargement de la configuration |
| Préservation Docker | Les **8 conteneurs** des deux projets préexistants gardent IDs, dates de démarrage et montages ; leurs **4 volumes** restent présents. Aucune commande de mutation n’a ciblé l’autre projet |
| `git diff --check` | Réussi |

Une première exécution modules a échoué pendant le nettoyage du scénario de désactivation, avant l’attente explicite de fin de rotation du cookie. La relance ciblée puis la suite complète ont réussi avec cette synchronisation. Un préambule CLI a également échoué une fois avec sa sortie privée masquée ; sa cause n’est pas établie. Doctor, déploiement local et relance complète ont ensuite réussi sans assouplir de garde. Les avertissements Nitro `aborted`/`ECONNRESET` et bundler `MODULE_LEVEL_DIRECTIVE` déjà documentés restent visibles.

Limites : aucun fournisseur SaaS ni déploiement distant exercé ; aucune restauration de stockage non vide, reconnexion depuis une archive, compatibilité RP ID distant ou durabilité hors hôte prouvée. La préservation des projets initiaux repose sur l’absence de mutation ciblée et la comparaison Docker, pas sur une comparaison de leurs données métier en cours d’utilisation. Le mode credentials ne fournit pas de parcours UI de provisionnement/récupération du mot de passe. Le schéma et les versions sont inchangés. Aucun commit ni push effectué.

Fichiers modifiés dans ce passage :

- **Configuration, scripts et exécution** : `.env.example`, `docker-compose.yml`, `package.json`, `playwright.config.ts`, `scripts/account-operator.mjs`, `scripts/doctor.mjs`, `scripts/local-config.d.mts`, `scripts/local-config.mjs`, `scripts/setup-local.mjs`, `scripts/test-auth-modules.mjs`, `scripts/verify-restore.mjs`, `src/env.ts`, `src/features/observability/sentry.client.ts`, `src/features/observability/sentry.server.ts`, `src/server.ts`, `src/vite-env.d.ts`, `vite.config.ts`.
- **Authentification et interface** : `convex/auth.config.ts`, `convex/auth.ts`, `convex/authOptions.ts`, `convex/capabilities.ts`, `convex/lib/authHooks.ts`, `convex/lib/authModules.ts`, `src/features/account/mfa-section.tsx`, `src/features/auth/credentials-sign-in.tsx`, `src/features/auth/sign-in-form.tsx`.
- **Tests et fixtures opérateur** : `tests/backend/auth-modules.test.ts`, `tests/backend/auth-transport.test.ts`, `tests/browser/analytics.test.tsx`, `tests/e2e/application.spec.ts`, `tests/e2e/auth-modules.spec.ts`, `tests/e2e/backend-operator.ts`, `tests/e2e/dashboard.spec.ts`, `tests/e2e/helpers.ts`, `tests/e2e/security.spec.ts`, `tests/e2e/spotlight.spec.ts`, `tests/scripts/setup.test.ts`.
- **Documentation** : `docs/accounts.md`, `docs/auth-modules.md`, `docs/development.md`, `docs/upgrades.md`, `docs/verification.md`.

## Corrections d’audit et démarrage produit — 19 octobre 2026

Périmètre : modifications locales issues de l’audit du commit `2e0b94d`. Le démarrage formalise brief, MVP, domaines, propriété des données, modules retenus et première fonctionnalité complète. Les consignes agents désignent les outils/exemples du dépôt, les versions installées et les validations adaptées ; les rapports antérieurs sont explicitement historiques et les exemples Garage sont génériques.

Les scripts backend locaux refusent les cibles distantes, les options supplémentaires et un checkout copié avant l’appel CLI. Les suppressions créent une demande durable dans la même transaction que la fermeture d’accès, puis le cron reprend les travaux inachevés. Le correctif Playwright ferme les snapshots ARIA et les aperçus HTML automatiques des assertions sous le flag de confidentialité.

| Vérification | Résultat observé |
| --- | --- |
| Régressions des commandes backend | Quatre cas ont échoué avec les anciens scripts ; refus des sélecteurs/options puis sélection locale vérifiés après correction, ainsi que le refus d’un checkout copié |
| Reprise après perte du scheduler | Deux tests au point d’entrée réel de suppression, compte et organisation : échec avant enregistrement transactionnel ; reprise de 205 ressources après copie des données applicatives sans tâches planifiées, avec préservation des données étrangères |
| Confidentialité Playwright | Valeur synthétique exposée avant patch ; le cas avec attribut HTML `value` a aussi échoué après fermeture des seuls snapshots ARIA. Le vrai runner vérifie désormais deux échecs intentionnels sans cette valeur dans les sorties ou artefacts, puis efface le dossier jetable |
| Backend local | `pnpm backend:push` réussi, index `cleanupJobs.by_retry_at` appliqué ; `pnpm backend:dev` lancé jusqu’au signal de disponibilité puis interrompu |
| Qualité finale | `pnpm check` réussi : types, lint, formatage, Knip, **83 tests backend/unitaires/scripts**, **4 tests Browser Mode**, build SSR |
| E2E personnel | `pnpm test:e2e:local` : **19 réussis**, 8 réservés aux suites optionnelles, 1.6m |
| E2E organisations | Dernière passe `pnpm test:e2e:local organizations` : **19 réussis**, 8 réservés aux suites optionnelles, 1.8m |

La première passe organisations a rencontré un timeout dans le choix initial du pseudo, avant le scénario de changement de compte. Trois répétitions ciblées avec les organisations actives, puis la relance complète ont réussi. Aucun délai ni garde d’authentification n’a été assoupli et le parcours n’a pas été modifié pour contourner cet échec ; sa cause reste indéterminée.

Trois relectures indépendantes ont examiné standards/documentation, conformité à la demande et backend/sécurité/tests, sans constat actionnable restant ; le patch de confidentialité a été relu séparément. La reprise sans scheduler est prouvée au niveau métier ; l’E2E de restauration reste propriétaire de l’import réel des tables et du composant d’auth. Les suites modules, les échanges SaaS et la production n’ont pas été validés à nouveau dans ce passage. La protection réseau publique reste à configurer et vérifier sur l’hébergement selon [deployment.md](../deployment.md).

## Revue approfondie des comptes et sessions — 17 octobre 2026

Périmètre : 96 fichiers modifiés ou ajoutés, incluant les fichiers générés. Trois revues indépendantes ont examiné les règles du dépôt, le cahier des charges et la sécurité/backend/tests ; l’intégration navigateur a été relue séparément. Les constats ci-dessous sont corrigés et aucun blocage confirmé ne reste dans ce périmètre.

| Axe | Défaut confirmé | Correction et preuve |
| --- | --- | --- |
| Standards | Les nouveaux quotas conservaient l’ID et des métadonnées d’activité après suppression du compte | Nettoyage des dix partitions liées au compte, sans toucher aux autres comptes ni aux quotas anti-abus ; test du cycle de vie rouge avant correction puis vert |
| Standards | `take(21)` après un filtre d’expiration pouvait lire un nombre non borné de sessions | Lecture de 100 candidats au maximum, puis aperçu de 20 sessions actives ; signalement explicite d’un aperçu incomplet et régression sur sessions expirées/révoquées |
| Cahier des charges | Une tentative MFA abandonnée gardait l’ancienne session en base mais le navigateur perdait son cookie, contrairement à l’exigence de préserver la session après échec | Reprise via cookie HttpOnly signé, lié au flux et limité à cinq minutes, avec revalidation de la session et du facteur d’origine ; parcours navigateur après mauvais TOTP puis annulation et nouvelle connexion réussie |
| Sécurité | Le plugin bearer pouvait interpréter `Authorization` après les gardes HTTP et atteindre une cérémonie passkey sans preuve ; un token de session révoqué pouvait obtenir un JWT | Refus du header avant les hooks de plugins, JWKS public excepté ; les deux contournements ont été reproduits en HTTP puis refusés après correction |
| Sessions | Le préchargement sans refresh empêchait le renouvellement glissant de `/convex/token` ; les cookies renouvelés n’étaient pas transmis | Refresh après validation vivante et quota, transfert du cookie dans la réponse ; SSR sans refresh puisqu’il ne transfère pas ces cookies. Tests HTTP de renouvellement, lecture SSR, révocation et panne de stockage |

Le test de confirmation utilise désormais deux sessions valides du même utilisateur : la preuve de l’une ne permet pas de supprimer le compte depuis l’autre. Huit tests HTTP de reprise MFA couvrent le contrôle positif, le cookie absent/altéré/d’un autre flux/expiré, la session d’origine révoquée ou sans assurance MFA, et le refus CSRF. La seule possession d’une session en attente n’accorde jamais l’assurance précédente. Les boutons empêchent une vérification et une annulation simultanées.

| Vérification après corrections | Résultat observé |
| --- | --- |
| Backend local | `pnpm backend:push` réussi sur `127.0.0.1:3210` |
| Qualité complète | `pnpm check` réussi : types, lint, formatage, Knip, **75 tests backend/unitaires/scripts**, **4 tests Browser Mode**, build SSR |
| E2E personnel | **19 réussis**, 8 réservés aux autres modes, 1.6m |
| E2E organisations | **19 réussis**, 8 réservés aux autres modes, 1.9m |
| E2E modules d’auth | **5 réussis**, 46.9s, dont annulation MFA et remplacement effectif de la session |
| Dépendances et état local | `pnpm audit --prod --audit-level=high` sans vulnérabilité connue ; `pnpm doctor` réussi et `git diff --check` réussi |

Production/outillage : **+3520 / −181 lignes** ; tests et helpers : **+2284 / −96 lignes** ; fichiers générés examinés séparément. Ces contrôles locaux n’attestent pas un déploiement de production ni un échange OAuth réel avec Google/GitHub. La vérification de la CI du commit publié est rapportée dans le compte rendu d’envoi.

## Comptes, administration et continuité de connexion — 17 octobre 2026

La stack et le mode personnel par défaut sont conservés. Les comportements génériques du projet Truffothèque ont servi de référence en lecture seule ; aucune donnée ou configuration privée de ce projet n’est importée. La politique, le bootstrap opérateur et la migration sont décrits dans [Comptes](../accounts.md).

| Vérification finale | Résultat observé |
| --- | --- |
| Schéma et backend local | Schéma Better Auth régénéré par la CLI ; seuls `nameKey`, `profileVersion` et `adminVersion` optionnels sont ajoutés au schéma généré ; fonctions et index appliqués au backend local |
| Qualité | `pnpm check` réussi : types stricts, Oxlint, Oxfmt, Knip, **61 tests backend/unitaires/scripts**, **4 tests Browser Mode** et build SSR |
| E2E personnel | `pnpm test:e2e:local` : **19 réussis**, 1.6m ; 7 scénarios réservés aux autres modes |
| E2E organisations | `pnpm test:e2e:local organizations` : **19 réussis**, 1.9m ; 7 scénarios réservés aux autres modes |
| Modules optionnels | `pnpm test:e2e:local modules` : **4 réussis**, 38.5s |
| Migration additive | `pnpm profiles:migrate` exécuté puis rejoué ; deux passes successives de 50 comptes, aucune clé à modifier ni collision ; 35 profils incomplets conservés et guidés vers le choix du pseudo à leur prochaine connexion |
| État final | `pnpm doctor` réussi, variables temporaires restaurées, capacités publiques revenues au mode personnel ; `git diff --check` réussi |

Les tests backend possèdent les autorisations sur les rôles courants, les modifications concurrentes du dernier admin, les collisions de pseudos, les versions indépendantes des timestamps d’authentification, la coupure immédiate des sessions et leur nettoyage borné. Ils couvrent aussi le lien session/opération des confirmations, leur expiration, la consommation unique et la persistance des essais refusés. Les fixtures d’organisation utilisent une session vieille d’une heure ; la suppression exige désormais une preuve liée à l’organisation.

Les parcours réels couvrent l’administration sans MFA imposée avec une connexion vieille d’une heure, le choix et les conflits de pseudo entre onglets, les refus des endpoints génériques, les confirmations email dans le parcours, les brouillons à 390 px, la recherche et ses filtres, le changement réel de compte, les budgets anonymes séparés et le remplacement limité à la session présentée du même compte. La restauration isolée compare des données non vides de profil, rôle, audit, révocation et confirmation en attente, en plus des ressources et passkeys.

Plusieurs régressions ont été reproduites avant correction : un renvoi de code refusé invalidait le code déjà délivré ; des tentatives MFA successives perdaient la référence à la session à remplacer ; une erreur de stockage était transformée en refus de session. Les vérifications HTTP et navigateur passent après correction. Le démarrage du client respecte le contrat de jeton SSR/renouvellement de Convex et attend sa confirmation avant d’activer les écritures. Les boutons de reprise sont utilisables dans l’erreur SSR et dans un dialogue ouvert.

Les traces, vidéos et captures automatiques restent désactivées et le lanceur conserve `PLAYWRIGHT_NO_COPY_PROMPT=1`. Les avertissements upstream de bundling et les logs Nitro d’annulation (`aborted`/`ECONNRESET`) restent présents ; ils ne font pas échouer les passes ci-dessus.

L’administration borne à 100 comptes admin et fournit un aperçu des sessions actives, avec révocation de toutes les sessions. La fixture locale `boilerplate-admin-e2e@example.test` est conservée pour respecter la protection du dernier admin. Aucun échange OAuth Google/GitHub réel, déploiement public, CI distante, TLS/proxy de production ou stockage de fichiers non vide n’est certifié par ces passes initiales. Elles précèdent la revue approfondie ci-dessus ; aucune réinitialisation des données du projet n’est effectuée.

Périmètre de cette évolution, hors documentation et fichiers générés : production/outillage **+3190 / −169 lignes** ; tests et helpers **+1633 / −54 lignes**. Les fichiers générés sont examinés séparément.

## PostgreSQL 18 et préparation Coolify — 16 octobre 2026

Vérifications sur ce Mac avec OrbStack. PostgreSQL remplace SQLite comme stockage interne de Convex ; aucune publication distante n’est incluse.

| Vérification | Résultat observé |
| --- | --- |
| Migration locale | **24 tables** exportées puis restaurées et comparées exactement, dont Better Auth ; IDs et dates de création conservés ; zéro fichier de stockage dans la source |
| Préservation | Toutes les valeurs précédentes de `.env.docker` conservées, y compris l’identité du projet et les secrets ; volume SQLite conservé pour récupération |
| Moteur effectif | PostgreSQL **18.6**, tables internes et connexions Convex actives vérifiées avec SQL ; `pnpm doctor` contrôle la version du serveur et le pilote PostgreSQL du backend, y compris quand le pool est au repos |
| Persistance | Exports avant et après `pnpm services:down` / `pnpm services:up` identiques pour les documents et fichiers présents |
| Qualité | `pnpm check` réussi : types, Oxlint, Oxfmt, Knip, **45 tests backend/unitaires/scripts**, **4 tests Browser Mode** et build |
| E2E SSR personnel | **11 réussis en 41,3 s**, 7 scénarios optionnels réservés aux passes dédiées |
| E2E SSR organisations | **11 réussis en 55,0 s**, dont les permissions partagées et la restauration sur PostgreSQL ; origine et flag initiaux restaurés |
| Modules d’authentification | **4 réussis en 37,9 s** : MFA/TOTP, récupération, support admin, Magic Link et refus du contournement du proxy |
| Setup réel | `pnpm setup` réexécuté sur PostgreSQL puis `pnpm doctor` réussis, fichiers privés et secrets conservés |
| Restauration PostgreSQL | Export réel restauré sur un nouveau Convex avec un PostgreSQL 18 isolé ; **24 tables** comparées ; conteneurs, volumes et réseau jetables supprimés |
| Dockerfile SSR | Images construites sous Linux, serveur lancé en utilisateur `node` (UID 1000), réponse SSR HTTP 200 avec CSP en contact avec le backend local |
| Compose de production | Configuration analysée puis quatre services démarrés et sains dans un projet Docker isolé ; ressources jetables supprimées |
| Correction du lanceur | Le lanceur E2E local transmet désormais une absence de sélecteur pour le mode ordinaire au lieu d’une chaîne vide invalide ; son test de processus échoue avant correction puis réussit après |

Le premier passage E2E a révélé le défaut du sélecteur de mode. Une passe perturbée par un build concurrent a été interrompue ; les résultats ci-dessus proviennent de la passe complète exécutée ensuite sans build concurrent. Les annulations Nitro `ECONNRESET` déjà documentées restent présentes dans les logs, sans empêcher cette passe de réussir.

La première CI de publication a échoué pendant le téléchargement Docker : le registre `ghcr.io/get-convex` refuse les accès anonymes (HTTP 403). Les mêmes manifestes, avec exactement les mêmes digests et les plateformes amd64/arm64, sont accessibles sous `ghcr.io/convex`. Les deux Compose et le vérificateur de restauration utilisent ce namespace ; les versions et les données restent identiques.

Les fichiers `docker-compose.coolify.yml`, `Dockerfile`, `.dockerignore` et `.env.coolify.example` préparent la publication. Ce contrôle local ne prouve ni un déploiement Coolify, ni DNS/TLS, ni les règles du proxy, ni l’envoi email de production. Les domaines et secrets réels restent à configurer selon [le guide](../deployment.md). La restauration sans fichier ne prouve pas un stockage de fichiers non vide. Les tâches planifiées ne sont pas transférées par l’export Convex ; les volumes et secrets exigent toujours une sauvegarde cohérente hors serveur.

## Enrichissement DX, auth et observabilité — 14 octobre 2026

La stack initiale et le mode personnel par défaut sont conservés. Les modules et leurs conditions d’activation sont décrits dans [auth-modules.md](../auth-modules.md), [observability.md](../observability.md) et [agent-patterns.md](../agent-patterns.md).

| Vérification | Résultat observé |
| --- | --- |
| Installation verrouillée et audit production | `pnpm install --frozen-lockfile` réussi ; aucune vulnérabilité connue signalée par l’audit |
| Qualité | TypeScript strict, Oxlint type-aware/Ultracite, Oxfmt et Knip réussis |
| Vitest backend/unitaires | **42 tests**, dont autorisation MFA liée au facteur exact, expiration/révocation du support, confidentialité et règles existantes |
| Vitest Browser Mode | **4 tests** avec les vrais SDK, champs accessibles et conservation des brouillons pendant le chargement/échec du tracker |
| E2E SSR construit, personnel | **11 réussis en 37,5 s** ; scénarios des autres modules réservés à leurs passes dédiées |
| E2E SSR construit, organisations | **11 réussis en 54,0 s**, origine et flag initiaux restaurés |
| Auth optionnelle | **4 réussis en 31,9 s** : TOTP réel, assurance des sessions existantes/nouvelles, code de récupération consommé une fois, support MFA/read-only/révocable, Magic Link consommé une fois, refus des appels auth directs sans le secret du proxy |
| Restauration des nouvelles tables | Facteurs, assurances MFA, audit et sessions de support non vides comparés sur un backend jetable ; secrets et données du backend principal conservés |
| Régression démontrée | Dans une copie temporaire sans secrets, retirer le contrôle du facteur et l’expiration propre au support fait échouer leurs deux tests d’autorisation ; le code principal n’a pas été affaibli |
| YAML / GitHub Actions | Parsing YAML et Actionlint 1.7.12 réussis, binaire vérifié par checksum officiel |
| SDK sous CSP de production | **1 E2E réussi** avec PostHog et Sentry réels et transports interceptés ; événement de navigation et véritable exception reçus, sentinelle privée absente |
| Spotlight sans DSN | **1 E2E réussi** en développement ; véritable exception filtrée livrée au sidecar local sain sur le port 8969 |

Les tests SDK utilisent des transports SaaS interceptés ou le sidecar Spotlight local ; les clés/flags hérités sont neutralisés par le lanceur. Les échanges OAuth Google/GitHub et le périmètre reverse proxy/Arcjet doivent être validés avec la configuration propre au futur produit. Aucune infrastructure Coolify ou publique n’est déployée par cette évolution. Les avertissements upstream du build et les annulations Nitro décrits dans les passes précédentes restent observables.

Les sections suivantes consignent les passes historiques ; leurs nombres et limites concernent leurs dates respectives.

## Socle initial — 12 octobre 2026

Vérifications réalisées sur macOS avec OrbStack/Docker, Node 26.11.0 et pnpm 11.8.0. Elles concernent le checkout et les versions verrouillées de ce socle.

| Vérification | Résultat observé |
| --- | --- |
| `pnpm check` | Types, lint, format, **20 tests backend/scripts** et build réussis |
| `PLAYWRIGHT_PRODUCTION=1 pnpm test:e2e` | **6/6 tests**, en **28,3 secondes**, sur un serveur SSR construit lancé par les tests |
| Audit des dépendances de production | **0 vulnérabilité connue** signalée au moment du contrôle |
| Gitleaks | **118 fichiers**, un commit temporaire dans une copie Git isolée, **0 secret détecté** |
| Restauration Docker isolée | Documents comparés exactement dans **17 tables**, avec IDs et `_creationTime` conservés |

Les E2E ont vérifié email OTP réellement envoyé dans Mailpit, ressources persistantes et isolées entre comptes, révocation de JWT déjà émis, passkeys sur authentificateurs virtuels distincts, export privé et suppression de comptes. Le parcours principal n’a produit aucune erreur JavaScript non interceptée.

La revue complète et ses corrections sont consignées dans [review.md](review.md). Les 20 tests comprennent 9 tests backend et 11 tests du setup au vrai processus dans des checkouts jetables. Sept de ces tests ont échoué sur le setup précédent puis réussi après correction. Le setup réel conserve les secrets et le volume existants ; `pnpm doctor` réussit sur cette installation.

Le parcours de ressource vérifie que le dialogue reste ouvert et les champs verrouillés pendant une vraie mutation retenue par le transport, puis que la sauvegarde aboutit. Une assertion WebAuthn signée sans UV, acceptée avant correction, est désormais refusée avec HTTP 403 sans création de session ; le même authentificateur vérifié peut se connecter. Le test OTP refuse un code incorrect, un code remplacé et un rejeu, et admet un seul des deux consommateurs concurrents du code valide.

Le test HTTP a confirmé les réponses privées sans cache et le refus d’une origine étrangère. Le navigateur de production a confirmé un nonce distinct par réponse, l’hydratation sans violation CSP et le blocage d’un script sans nonce injecté dans le HTML reçu.

Une QA publique complémentaire a vérifié accueil et connexion aux largeurs 320, 390 et 1440 px : aucun débordement horizontal, contrôles interactifs après hydratation, ordre clavier cohérent et focus visible. La passe finale stabilisée ne présente aucune erreur JavaScript, erreur console ou requête échouée. Le contour des champs atteint 3,04:1 de contraste.

La restauration a utilisé des tables non vides de ressources, passkeys et authentification. Le backend jetable et son volume ont été supprimés, la configuration principale préservée. La source ne contenait aucun fichier de stockage : ce cas reste à éprouver. La reconnexion sur le backend restauré, la compatibilité RP ID/authentificateur après restauration et la durabilité hors serveur n’ont pas été démontrées. Le runbook décrit ces vérifications complémentaires.

La CI est rédigée. Sa commande Gitleaks exacte a été vérifiée localement, hors réseau, avec sorties masquées. **Aucune exécution GitHub Actions distante n’a été réalisée** ; vérifier la première exécution après intégration au dépôt.

## Module organisations — 13 octobre 2026

Le [module optionnel](../organizations.md) ajoute les organisations et rôles sans activer le mode partagé par défaut.

| Vérification | Résultat observé |
| --- | --- |
| `pnpm check` | Types, lint, format, **27 tests** (16 backend, 11 scripts) et build réussis |
| E2E production en mode personnel | **7 réussis**, en **34,3 s** ; le scénario partagé est réservé à l’autre mode |
| E2E production avec activation locale temporaire | **1 réussi**, en **19,6 s** ; valeur précédente du flag restaurée |
| Restauration avec module actif | Organisations, memberships, invitation en attente et ressources communes non vides restaurées ; comparaison exacte des tables et fichiers présents |
| Audit production et Gitleaks | Aucune vulnérabilité connue ; **141 fichiers**, zéro secret détecté dans une copie Git privée avec un commit temporaire |
| Diagnostic local | `pnpm doctor` réussi ; fichiers privés et services sains ; aucune valeur de secret affichée |

Les tests backend vérifient les scopes personnels et partagés, les droits du lecteur et de l’administrateur, la révocation, les invitations liées à un email vérifié, leur expiration et consommation concurrente, la protection atomique du dernier propriétaire, l’anonymisation à la fermeture du compte et la suppression d’organisation dépassant un lot.

Les E2E vérifient les liens masqués et refus d’API en mode personnel, les routes natives Better Auth Organization fermées dans les deux modes, l’invitation, l’acceptation, le changement de rôle en temps réel, les refus d’écriture par l’API, l’export des appartenances, le renommage, la révocation avec un JWT déjà émis et la suppression explicite. Le parcours partagé est vérifié à 320, 390 et 1440 px sans débordement horizontal et ne produit aucune erreur JavaScript non interceptée. Les erreurs de permission sont contrôlées via leurs données structurées, sans assouplir la redaction des messages serveur.

Le backend et le volume de restauration ont été supprimés ; les secrets et fichiers de configuration principaux restent préservés. Le mode personnel est laissé par défaut. Les limites précédentes concernant CI distante, fichiers de stockage non vides, reconnexion après restauration et infrastructure publique restent applicables.

## Revue des organisations, permissions et transitions de session — 13 octobre 2026

La [revue détaillée](organizations-review.md) décrit les défauts confirmés et leurs corrections. Les [consignes de démarrage](project-start.md) permettent aux agents de recommander le mode selon la propriété des données, avec le personnel comme défaut.

| Vérification finale | Résultat observé |
| --- | --- |
| `pnpm backend:push` | Fonctions et index du composant déployés sur le backend local du checkout |
| `pnpm check` | Types, lint, format, **34 tests** (22 backend, 12 scripts) et build réussis |
| Contrôles après la dernière adaptation du test de navigation | `pnpm ts`, `pnpm lint:ci` et `pnpm format:check` réussis |
| `PLAYWRIGHT_PRODUCTION=1 pnpm test:e2e`, backend personnel | **9 réussis en 34,6 s**, un scénario partagé ignoré |
| Même commande ordinaire, backend organisations activé | **9 réussis en 48,2 s**, un scénario personnel ignoré ; aucun sélecteur de scénario partagé, mode backend initial restauré et relu |
| Restauration du module actif | Comparaison exacte des **20 tables**, avec organisation, deux memberships, invitation en attente et ressources communes non vides ; conteneurs/volumes jetables supprimés, configuration principale préservée |
| Diagnostic local | `pnpm doctor` réussi ; lecture finale de `capabilities.get` laissée à `organizations: false` |

Les tests backend supplémentaires couvrent deux tenants, les rôles différents d’un même compte, l’auteur rétrogradé, les opérations de gestion et exports étrangers, la séparation du personnel et la confidentialité des emails. Le mode désactivé ferme tous les points d’entrée du module, tout en conservant les données et la protection du dernier propriétaire. Quatre tests d’invitations et un test du lanceur copié ont échoué avant correction puis réussi après.

Les E2E finaux vérifient également la conservation d’un formulaire pendant la revalidation d’un token et la remise à zéro du document/caches lors d’un changement réel de compte. Le premier parcours avait reproduit la disparition du formulaire ; le second échouait sur l’utilisabilité du compte suivant sans réinitialisation. Le test HTTP de **125 lectures du JWKS public**, reçu en 429 avant correction, réussit avec un jeu de clés dépourvu de paramètres privés. Les quotas des autres endpoints d’auth restent actifs.

Ces passes utilisent les services locaux réels, Mailpit et le serveur SSR construit. Les traces, vidéos, captures et snapshots ARIA automatiques des parcours d’auth restent désactivés ; les diagnostics temporaires ont été retirés. Les logs du serveur comportent encore des erreurs `aborted`/`ECONNRESET` sur des requêtes annulées par les navigations ; les parcours principaux et partagés ne signalent pas d’erreur JavaScript non interceptée.

Aucune CI distante ni infrastructure de production n’est certifiée par cette revue. La distribution/protection du JWKS public, la sauvegarde hors serveur, les fichiers de stockage non vides et la reconnexion sur une restauration restent à valider sur l’environnement cible. L’audit des dépendances et Gitleaks consignés plus haut appartiennent à leurs passes précédentes ; ils n’ont pas été réexécutés pour cette revue sans changement de dépendances.

## Template privé et simulation OrbStack — 13 octobre 2026

GitHub confirme `private: true` et `is_template: true` pour [NathanDigiDev/boilerplate-v2](https://github.com/NathanDigiDev/boilerplate-v2). Le [guide nouveau projet](new-project.md) décrit la création privée, les secrets et données indépendants, la personnalisation et le dashboard admin local. La [CI préalable du commit 4a588ea](https://github.com/NathanDigiDev/boilerplate-v2/actions/runs/38372318889) a terminé avec succès dans les deux modes et pour Gitleaks ; le push de cette évolution doit également passer ses propres jobs.

| Vérification | Résultat observé |
| --- | --- |
| Checkout neuf issu des seuls fichiers du template | Installation verrouillée, identité publique personnalisée, setup et doctor réussis |
| Isolation réelle du nouveau checkout | Projet Docker, secret d’instance, secret Better Auth et clé admin distincts ; tables ressources, utilisateurs et organisations initialement vides |
| Qualité | `pnpm check` réussi ; après le dernier cas du lanceur, types/lint/format et **36 tests backend/scripts** réussis |
| E2E SSR construit, personnel | **10 réussis en 41,2 s**, scénario partagé ignoré |
| E2E SSR construit, organisations | **10 réussis en 55,0 s**, scénario personnel ignoré ; flag initial restauré |
| Dashboard | Image ARM64/AMD64 alignée sur le backend ; service sain, connexion réelle et lecture d’une ressource créée dans l’application ; clé hors HTML/URL/localStorage, effacée au logout, connexion requise après reload |
| Lanceur macOS | Backend et propriété Docker réels ; commandes OS capturées : clé transmise à l’entrée standard du presse-papiers, URL seule passée au navigateur, aucune clé dans la sortie |
| Refus de configuration étrangère | Port 6791 occupé : test échoué avant correction puis réussi ; dashboard d’un autre checkout refusé avant accès privé |
| Retour au projet principal | Services et frontend relancés, fichiers privés conservés exactement et en mode 600, volume original réutilisé, mode personnel confirmé ; seul le volume jetable créé pour cette vérification supprimé |
| Audit des dépendances de production | Aucune vulnérabilité connue signalée |

La première passe organisations, enchaînée immédiatement après le personnel sur la même instance, a reçu des 429 d’authentification. Après expiration de la fenêtre, la suite complète réussit sans modifier les quotas. La procédure signale cet intervalle ; la CI utilise une instance neuve par mode. Les avertissements upstream du build et les logs Nitro d’annulation décrits plus haut restent observables. Aucun déploiement Coolify ou contrôle d’infrastructure publique n’est inclus.
