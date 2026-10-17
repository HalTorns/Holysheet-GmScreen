# Instructions de travail

## Documentation actuelle

Utiliser Context7 MCP avant de coder contre une bibliothèque, un framework, un SDK, une API, une CLI ou un service cloud. Commencer par `resolve-library-id`, sélectionner l’identifiant pertinent puis appeler `query-docs` sur un concept précis. Utiliser une version spécifique lorsqu’elle est demandée. Préférer les sources officielles pour les compléments. Cette règle ne concerne pas la logique métier, les concepts généraux, les revues et refactorings sans changement d’API.

## Architecture

Lire `README.md`, `docs/architecture.md` et `docs/security.md` avant une modification structurante.

Au démarrage d’un nouveau produit, lire `docs/project-start.md` avant le premier domaine. Proposer une recommandation motivée : données individuelles → mode personnel ; propriété collective, invitations et droits d’équipe → organisations ; besoins mixtes → scopes distincts. Un SaaS ou un abonnement seul ne justifie pas les organisations. Consigner le choix dans `docs/decisions/access-model.md` du nouveau projet, conserver le défaut personnel si aucun besoin partagé n’est établi et respecter les choix explicites de l’utilisateur. Cette recommandation n’ajoute pas une étape systématique d’approbation ; préserver le mode et les données d’un projet existant jusqu’à une demande de changement.

Pour adapter le produit ou ajouter/remplacer un domaine, lire `docs/adopting.md`. La configuration publique est dans `shared/app-config.ts`, la navigation dans `src/config/navigation.ts` ; aucun de ces fichiers n’autorise un accès backend. Intégrer les nouvelles données personnelles à l’export de compte, au nettoyage borné et aux fixtures de restauration.

- Le backend métier est Convex. Les fonctions serveur TanStack Start gèrent le SSR et les intégrations qui en ont besoin ; elles ne remplacent pas les contrôles d’accès Convex.
- Pour une fonction privée, valider la session via le helper d’authentification du projet puis contrôler les droits sur la ressource. Ne jamais considérer un identifiant client ou un garde de route comme une autorisation.
- Utiliser les IDs stables pour la propriété ; l’adresse email est modifiable.
- Valider les entrées et retours des fonctions publiques. Paginer les listes, indexer les accès et borner les opérations coûteuses.
- Les opérations internes restent `internalQuery`, `internalMutation` ou `internalAction` tant qu’un appel public n’est pas nécessaire.
- Garder les données serveur dans Convex/TanStack Query ; réserver l’état React aux interactions locales.
- Ne pas installer Prisma, une deuxième base de données, Redis ou un autre framework sans besoin établi et décision d’architecture documentée.
- Organisations, paiements, stockage et IA restent optionnels ; lire `docs/modules.md` avant de les ajouter.
- Les organisations sont intégrées, désactivées par défaut côté Convex. Lire `docs/organizations.md` avant d’étendre leurs droits. Préserver les routes natives Better Auth Organization fermées, les mutations atomiques du composant et la protection du dernier propriétaire. Les ressources personnelles et partagées ont des scopes distincts ; la suppression d’un compte ne détruit pas les données communes.
- Toute réduction de délégation, modification de rôle ou sortie d’un membre révoque atomiquement les invitations devenues incompatibles ; les anciennes invitations ne doivent pas restaurer des droits retirés. Refuser une invitation à un membre déjà présent.

## Secrets et authentification

- `VITE_*` est public. Ne jamais exposer une clé de déploiement/admin, un cookie de session Better Auth, un OTP ou un secret dans Vite ou un retour SSR. Aucun token de session ou JWT dans une URL, un log ou un stockage navigateur persistant. Seul le module Magic Link autorise son jeton de vérification haché, valable cinq minutes et consommé une fois dans son URL email ; ne jamais journaliser ou persister cette URL.
- Le JWT Convex de courte durée est un bearer destiné au navigateur authentifié. Son passage SSR via `initialToken` est permis uniquement pour la requête de cet utilisateur, avec une réponse `Cache-Control: private, no-store`. Ne pas le partager entre requêtes.
- Ne pas lire ni afficher les secrets existants pour diagnostiquer un problème. Vérifier leur présence, leur longueur et leur portée avec des sorties masquées.
- Ne pas journaliser les OTP, cookies, tokens de session ni clés de déploiement. Garder les traces, vidéos, captures et snapshots ARIA automatiques E2E désactivés dans les parcours d’auth ; conserver `PLAYWRIGHT_NO_COPY_PROMPT=1` dans le lanceur.
- Préserver les protections CSRF et origines. Pas de `disableCSRFCheck`, `disableOriginCheck`, origine globale ou wildcard d’hébergeur pour faire passer une intégration.
- La surface HTTP Better Auth utilise les cookies signés et refuse `Authorization` avant les hooks des plugins (JWKS public excepté). Préserver ce garde : une conversion bearer tardive contournerait les contrôles préalables de session et de confirmation. Les JWT des appels métier directs à Convex restent distincts.
- Pas de cache de session supplémentaire sans décision explicite sur la révocation. Les opérations courantes utilisent la session valide sans limite de cinq minutes. Les actions sensibles consomment une preuve serveur à usage unique liée à la session et à l’opération, obtenue dans le parcours sans perdre le formulaire ; lire `docs/accounts.md`. Le support technique conserve ses protections de session récente.
- Le code email sert aussi de récupération de compte. Préserver ses limites d’envoi, d’essais et sa consommation unique.
- Les passkeys nécessitent un domaine/RP ID stable. Ne pas partager les données ou secrets de production avec des previews.
- Préserver les hooks passkeys qui imposent le flag UV issu de la vérification cryptographique, avant création de clé ou de session. Une option navigateur `userVerification` ou un booléen client ne remplace pas ce contrôle serveur.
- Ne pas modifier à la main un schéma d’auth généré ; modifier la configuration puis lancer `pnpm auth:generate` et examiner le diff.

## Modules et conventions des agents

Lire `docs/agent-patterns.md` pour les Server Functions, fonctions Convex, formulaires et composants shadcn. Lire `docs/auth-modules.md` et `docs/observability.md` avant d’activer un module d’auth ou un fournisseur externe. Les flags privés font autorité ; les capacités publiques servent uniquement à l’affichage. Les plugins restent dans un schéma stable.

Les rôles applicatifs `user`/`admin` sont distincts des organisations et du support : contrôler le rôle courant dans chaque opération, protéger atomiquement le dernier admin actif et ne jamais ouvrir une attribution publique. Les pseudos passent uniquement par la mutation atomique du profil ; préserver la politique privée, la normalisation, l’export et le nettoyage.

Préserver l’assurance MFA liée à la session et à l’ID du facteur réellement vérifié. Une désactivation du flag ne libère pas un compte enrôlé. Le support technique avec impersonation exige une allowlist d’IDs, une MFA vérifiée récemment et un accès support limité à cinq minutes en lecture seule, lié à sa session d’origine. Conserver les limites d’essais et le nettoyage/exports des métadonnées d’audit, sans exporter de secret TOTP ou code de récupération.

Sentry et PostHog utilisent des allowlists de données. Ne pas ouvrir autocapture, replay, logs, corps HTTP, variables ou propriétés personnelles par défaut. Arcjet exige une IP attestée par un proxy de confiance et le garde auth côté Convex ; ne pas utiliser des forwarded headers clients comme preuve.

## Qualité et validation

Oxlint type-aware avec Ultracite, Oxfmt et Knip sont les outils communs ; Lefthook/lint-staged formatent les fichiers staged et vérifient les types avant commit. Installer Chromium avant Vitest Browser Mode. Les alias et plugins UI viennent de `config/vite-shared.ts`.

TypeScript strict, pas de `any` dans le code maintenu, erreurs typées, fonctions ciblées et noms explicites. Le code généré par les dépendances est traité comme généré.

Pour les schémas applicatifs, importer `z` depuis `@shared/zod`, qui configure `jitless` avant les validations. Ne pas importer directement Zod dans `src/` ou les schémas partagés, ni appeler `z.compile()` dans le navigateur : préserver la CSP sans `unsafe-eval`.

Pour chaque test ajouté, identifier le comportement observable, la régression crédible et la limite de la couverture existante. Tester au point d’entrée réel ; ne pas créer de flag, export ou endpoint de production destiné uniquement aux tests. Les E2E possèdent les contrats cookies/SSR/email/WebAuthn ; les tests Convex possèdent les règles métier et d’autorisation.

```sh
pnpm backend:push
pnpm check
pnpm test:e2e:local
pnpm test:e2e:local organizations
pnpm test:e2e:local modules
```

Exécuter les vérifications adaptées à la modification, puis `git diff --check`. Rapporter les preuves réellement exécutées et les éventuelles limitations. Ne pas annoncer un déploiement, une restauration, une CI distante ou un test réussi sans résultat observable.

Le setup est exclusivement local : refuser les sélecteurs Convex distants avant toute mutation, conserver les variables personnalisées et contrôler la propriété Docker du checkout. Utiliser `pnpm services:up`, `pnpm services:down` et `pnpm services:status`, qui désignent l’identité persistante du projet ; ne pas contourner ces protections avec une commande Compose générique. `pnpm doctor` fournit un diagnostic local en lecture seule.

Ne pas publier, pousser, fusionner ou réinitialiser les données sans autorisation applicable. Une restauration `--replace` et `docker compose down -v` sont destructrices ; ne jamais les utiliser comme dépannage de routine.
