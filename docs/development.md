# Développement et validation

## Boucle locale

### Ports par checkout

Les ports hôte sont résolus par `scripts/local-config.mjs`, validés (entiers de 1 à 65535, distincts) et conservés dans `.env.docker`. Les défauts restent : application `3000`, API Convex `3210`, HTTP Convex `3211`, dashboard `6791`, Mailpit `8025`, Spotlight `8969`. PostgreSQL ne publie aucun port.

Avant le premier setup d’un second checkout, créer `.env.docker` avec uniquement les ports souhaités, ou les fournir à la commande initiale :

```sh
LOCAL_APP_PORT=3400 LOCAL_CONVEX_PORT=3410 LOCAL_CONVEX_SITE_PORT=3411 LOCAL_DASHBOARD_PORT=6991 LOCAL_MAILPIT_PORT=8225 LOCAL_SPOTLIGHT_PORT=9169 pnpm setup
```

Le setup complète ce fichier avec une identité et des secrets propres au checkout. Les exécutions suivantes reprennent ses ports sans réexporter les variables. Une variable de shell contradictoire est refusée pour éviter de cibler accidentellement un autre service. Ne pas copier `.env.docker` ni `.env.local` d’un projet : la propriété du checkout, des conteneurs et des ports publiés est contrôlée avant démarrage. Le contrôle examine les bindings TCP hôte réels de Docker, y compris ceux des conteneurs sans label Compose ; deux conteneurs peuvent partager leurs ports internes avec des ports hôte distincts. Un conflit ne provoque aucun arrêt de l’autre projet. Pour déplacer les ports d’un checkout déjà configuré, arrêter ses services avec `pnpm services:down`, modifier les ports dans `.env.docker` et les URLs correspondantes dans `.env.local`, puis relancer `pnpm setup` ; conserver identités, secrets et volumes.

Le navigateur et la CLI utilisent les **ports hôte** : `VITE_CONVEX_URL` / `CONVEX_SELF_HOSTED_URL` pour l’API, `VITE_CONVEX_SITE_URL` pour HTTP, `VITE_SITE_URL` pour SSR. Le dashboard reçoit aussi l’URL hôte de l’API. Vite, Playwright, doctor et les outils opérateur partagent cette résolution. Le lanceur E2E choisit son propre port frontend libre et restaure ensuite l’origine backend.

Les conteneurs conservent leurs **ports internes** (`3210`, `3211`, `6791`, `8025`, `8969`). Mailpit reste accessible depuis Convex à `http://mailpit:8025`. Pour un issuer HTTP loopback local, `convex/auth.config.ts` garde l’issuer externe fourni par `CONVEX_SITE_URL`, mais récupère JWKS sur `http://127.0.0.1:3211/api/auth/convex/jwks` depuis le backend lui-même. Aucune nouvelle variable privée n’est requise au premier déploiement ou à la restauration. Les issuers de production et leur transport restent inchangés. Ce chemin local suppose le backend Docker du dépôt et son port interne fixe.

`VITE_SPOTLIGHT_URL` est une URL publique locale, produite par le setup à partir du port Spotlight. Elle configure le SDK navigateur, le SDK SSR et la CSP lorsque Spotlight est activé.

Après `pnpm setup`, lancer `pnpm dev` et, pendant les changements backend, `pnpm backend:dev` dans un second terminal. Les modifications de schéma Better Auth nécessitent `pnpm auth:generate` avant le déploiement des fonctions.

Le frontend utilise `http://localhost:3000`. Mailpit affiche les emails sur le port 8025 et reçoit les envois via REST depuis le conteneur Convex. Le port SMTP n’est pas nécessaire au socle. Les données Convex sont persistées dans PostgreSQL 18.6 (`postgres-data`) ; fichiers, modules et indexes restent dans `convex-data`. Ces volumes sont conservés lors d’un arrêt normal ; les emails Mailpit sont temporaires. Le dashboard Convex tourne sur `http://127.0.0.1:6791` : `pnpm dashboard` facilite la connexion admin locale sur Mac. Voir [le démarrage d’un nouveau projet](new-project.md) pour la connexion, l’isolation et le passage d’un projet à l’autre.

Exécuter `pnpm doctor` pour diagnostiquer la sélection locale, les versions, les permissions et l’exclusion Git des fichiers privés, les URLs et la santé des services. Ce diagnostic reste en lecture seule et n’affiche aucune valeur de secret. `pnpm services:status` affiche les conteneurs du checkout ; `pnpm services:up` et `pnpm services:down` utilisent son identité Docker persistante.

Chaque nouveau checkout reçoit un projet Compose distinct dans `.env.docker`, lié à son chemin. Ne jamais copier ce fichier entre projets. Les ports restent fixes : arrêter les services du projet actif avant d’en démarrer un autre. Le setup refuse les ports publiés par un autre projet Docker avant de créer ses services ; un port occupé par un processus externe fait échouer le démarrage Compose. La migration du premier socle conserve son volume uniquement lorsque les labels Docker attestent son propriétaire.

`pnpm setup` refuse un sélecteur Convex distant dans le shell, `.env` ou `.env.local` avant toute mutation. Il conserve les variables propres au projet et leurs lignes existantes dans `.env.local`, puis configure uniquement les valeurs gérées du socle local. Les commandes Docker passent un fichier et un nom de projet explicites ; utiliser les wrappers plutôt qu’un `docker compose` sans configuration.

`pnpm backend:dev` et `pnpm backend:push` passent par `scripts/backend-local.mjs` : refus des sélecteurs distants et options supplémentaires, vérification de l’identité Docker/PostgreSQL et des ports, puis invocation de Convex avec le fichier `.env.local` explicitement désigné et un environnement local. Le watcher relaie son interruption au CLI. Une publication distante suit [deployment.md](deployment.md), sans modifier ces commandes locales.

### Poste Linux sans Docker

Le poste de développement courant est un conteneur Linux (webtop) sans démon Docker ni namespaces utilisateur. Node 26.11.0 y est installé via nvm, sans changer l’alias `default`. Activer `nvm use 26.11.0` dans le shell du projet, puis utiliser pnpm 11.8.0.

| Commande | Sur ce poste |
| --- | --- |
| `pnpm install --frozen-lockfile`, `pnpm audit --prod --audit-level=high` | oui |
| `pnpm check` : types, Oxlint, Oxfmt, Knip, Vitest backend/unitaire avec `convex-test`, Vitest navigateur, build | oui, Chromium installé sans `--with-deps` |
| `pnpm auth:generate` | oui |
| `pnpm setup`, `services:*`, `doctor`, `backend:dev`, `backend:push`, `test:e2e*` | non : ces commandes exigent Docker (PostgreSQL, Convex, Mailpit) |

Les preuves de services et les E2E proviennent de la CI GitHub (`Validation`), qui exécute `pnpm setup` puis l’E2E Holysheet sur un runner Ubuntu. Un changement qui demande ces preuves est poussé sur une branche, puis intégré à `main` une fois la CI verte. Le sandbox de Codex CLI (bwrap) est indisponible sur ce poste : Codex y travaille sans sandbox, avec contrôle de l’état du checkout par le coordinateur.

## Contrats de test

Les tests backend Convex protègent les validations, droits de propriétaire, sessions et quotas avec des cas autorisés et interdits. Les E2E protègent les risques de transport et de cycle de vie : SSR anonyme, code réellement envoyé, cookies, CRUD persistant, isolation via API directe, révocation entre navigateurs, cérémonie WebAuthn virtuelle, export privé et suppression de compte. Le test de restauration crée des données et une passkey réelles avant l’exercice sur un backend jetable.

Le parcours dashboard utilise un contexte admin séparé : il lit une ressource créée dans l’application, vérifie la clé hors HTML/URL/`localStorage`, puis son effacement au logout et la connexion requise après reload. Le runner conserve les protections contre les traces et snapshots d’auth. Les tests de scripts exercent le setup et les lanceurs au vrai processus dans des checkouts jetables, notamment le refus d’un checkout copié et d’un port dashboard appartenant à un autre projet.

```sh
pnpm exec playwright install chromium
pnpm check
pnpm test:e2e
```

Le lanceur E2E démarre son propre Vite et refuse un serveur existant ; Convex et Mailpit doivent être initialisés. Chaque test utilise des adresses aléatoires et des contextes navigateur séparés. Aucun endpoint de production ne crée des comptes de test ou ne révèle un OTP.

Les suites utilisent les quotas d’authentification réels. Laisser au moins une minute entre deux suites complètes sur une même instance ; des passes successives ou un autre navigateur actif peuvent cumuler leurs requêtes et déclencher un 429. La CI sépare les instances des deux modes. Attendre le renouvellement de la fenêtre avant de relancer localement, sans supprimer les compteurs ni assouplir les protections.

Pour vérifier le build SSR et la CSP avec nonce, arrêter Vite, lancer `pnpm build` puis `PLAYWRIGHT_PRODUCTION=1 pnpm test:e2e`. Le lanceur démarre alors `pnpm start`. Le test de sécurité vérifie le refus d’une origine étrangère, l’hydratation sous CSP et le blocage d’un script injecté sans nonce.

Traces réseau, vidéo et captures sont désactivées pour éviter d’archiver cookies et codes saisis. Le lanceur définit `PLAYWRIGHT_NO_COPY_PROMPT=1` et le [correctif Playwright](upgrades.md#confidentialité-des-échecs-playwright) bloque aussi les snapshots ARIA automatiques des assertions : le flag seul ne ferme pas ce second chemin dans 1.64.0. Un `error-context.md` peut encore contenir le code et les erreurs du test ; son existence seule ne prouve pas une capture de page. Le test `tests/scripts/playwright-privacy.test.ts` provoque deux échecs réels avec une valeur synthétique et vérifie son absence des sorties et artefacts. Vérifier ce contrat lors d’une montée de version. Pour un diagnostic visuel, utiliser des données fictives et des captures ciblées après authentification ; ne pas publier de trace d’auth brute ni faire d’assertion dont le message expose un OTP/token.

## CI

GitHub Actions utilise Node 26.11.0 et pnpm 11.8.0, installe depuis le lockfile, refuse les vulnérabilités de production de niveau high/critical, démarre les services locaux, puis exécute types, lint, format, tests backend, build et E2E Chromium contre le serveur construit. Un second job analyse l’historique Git avec Gitleaks, sorties masquées. Les jobs n’ont pas accès aux secrets de production, utilisent une permission GitHub de lecture et ne déploient rien.

La validation applicative utilise deux jobs de matrice **Personnel** et **Organisations**, chacun avec son runner Ubuntu, ses secrets générés localement et son volume Convex. Les deux exécutent la suite navigateur entière : le personnel avec `pnpm test:e2e:ci`, les organisations avec `pnpm test:e2e:organizations --all`. Le mode demandé est comparé à `capabilities.get` avant les scénarios du module, pour empêcher une validation du mauvais mode par des tests ignorés. Un échec d’un job n’annule pas l’autre (`fail-fast: false`). Les services sont arrêtés dans une étape `always()` ; aucune archive de données, trace d’auth ni fichier privé n’est envoyé comme artefact.

Le workflow se déclenche sur push, pull request et manuellement depuis Actions. Les actions et images sont épinglées à des révisions vérifiées. Les résultats des deux modes et du contrôle de secrets doivent tous être réussis sur le commit courant avant de considérer sa CI valide.

Dependabot propose chaque semaine les mises à jour npm, Docker et Actions. Les dépendances d’auth sont regroupées ; chaque proposition doit suivre `docs/upgrades.md`. Après ajout du workflow au dépôt, vérifier sa première exécution distante avant de la considérer opérationnelle.

## Dépannage

| Symptôme | Vérification |
| --- | --- |
| Passkey refusée | Frontend sur `localhost`, RP ID/origine cohérents, navigateur compatible |
| Aucun email | Services Docker sains, provider local Mailpit et URL réseau du conteneur |
| Types Convex manquants | Exécuter `pnpm backend:push` ; génération interrompue auparavant |
| Requête refusée après logout | Comportement attendu : session supprimée et caches client vidés |
| Backend modifié sans effet | Démarrer `pnpm backend:dev` ou lancer `pnpm backend:push` |
| Build correct, lancement absent | Vérifier `.output/server/index.mjs` et les URLs/variables de l’environnement |

Vérifier les noms et la présence des variables sans afficher leurs valeurs privées. Ne pas réinitialiser les volumes pour résoudre un problème de configuration.

## Qualité et parcours modulaires

La chaîne est Oxlint type-aware + Ultracite, Oxfmt et Knip. Lefthook exécute lint-staged (formatage puis lint des fichiers staged) et TypeScript avant commit ; `pnpm install` installe le hook dans le dépôt de ce checkout, hors CI. VS Code propose OxC comme formatter et les tâches locales.

`pnpm check` inclut aussi Vitest Browser Mode dans Chromium, à installer une fois via `pnpm exec playwright install chromium`. Les tests backend restent dans leur environnement edge ; la configuration navigateur partage les alias et plugins UI Vite sans démarrer Nitro ou Convex.

`pnpm test:e2e:local` construit un serveur de production sur un port libre, conserve le RP ID localhost, change temporairement l’origine backend puis la restaure. Utiliser `pnpm test:e2e:local organizations` pour la suite complète en organisations et `pnpm test:e2e:local modules` pour Mailpit/MFA/support/restauration. Les flags initialement présents sont restaurés, les compteurs de sécurité conservés. Le frontend sur un autre port ne partage pas les données d’un autre backend.

La CI installe Chromium avant `pnpm check`, valide personnel + organisations et exerce aussi les modules auth dans le job personnel. Les intégrations SaaS externes exigent les credentials propres au produit ; les tests sans ces credentials prouvent les frontières locales, pas un échange OAuth ou une livraison Sentry/Arcjet distante.
