# Vérifications du socle

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

Les fichiers `docker-compose.coolify.yml`, `Dockerfile`, `.dockerignore` et `.env.coolify.example` préparent la publication. Ce contrôle local ne prouve ni un déploiement Coolify, ni DNS/TLS, ni les règles du proxy, ni l’envoi email de production. Les domaines et secrets réels restent à configurer selon [le guide](deployment.md). La restauration sans fichier ne prouve pas un stockage de fichiers non vide. Les tâches planifiées ne sont pas transférées par l’export Convex ; les volumes et secrets exigent toujours une sauvegarde cohérente hors serveur.

## Enrichissement DX, auth et observabilité — 14 octobre 2026

La stack initiale et le mode personnel par défaut sont conservés. Les modules et leurs conditions d’activation sont décrits dans [auth-modules.md](auth-modules.md), [observability.md](observability.md) et [agent-patterns.md](agent-patterns.md).

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

Le [module optionnel](organizations.md) ajoute les organisations et rôles sans activer le mode partagé par défaut.

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
