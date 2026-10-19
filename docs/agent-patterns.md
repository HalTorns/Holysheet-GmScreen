# Conventions pour les agents

Suivre le tableau de lecture d’`AGENTS.md` et le brief du produit lorsqu’il est renseigné. Les ponts `CLAUDE.md` et `.cursorrules` renvoient à cette source commune. Lire les versions installées et `docs/upgrades.md`, puis consulter Context7 pour les API compatibles ; ne pas appliquer une convention Next.js à TanStack Start.

## Un nouveau produit

Suivre [project-start.md](project-start.md) pour cadrer le MVP, remplir [product.md](product.md), décider de la propriété des données et livrer une première fonctionnalité complète. [adopting.md](adopting.md) décrit l’adaptation technique et le remplacement du domaine ressources.

## Choisir les outils du socle

Les versions et scripts font autorité dans `package.json` et `pnpm-lock.yaml`. Cette carte indique où lire un exemple réel avant d’implémenter ou d’ajouter une dépendance.

| Besoin | Outil et responsabilité | Exemple du dépôt |
| --- | --- | --- |
| Routes, navigation et SSR | TanStack Start / Router ; loaders et Server Functions | `src/routes/_authenticated.tsx`, `src/routes/_authenticated/app/admin.tsx` |
| Données métier et autorisations | Convex ; validateurs, index, transactions et quotas | `convex/resources.ts`, `convex/lib/resources.ts`, `convex/lib/auth.ts` |
| Cache et subscriptions SSR/navigateur | TanStack Query et intégration Convex ; clients par requête SSR | `src/router.tsx`, `src/lib/convex-query.ts`, `src/features/resources/resource-list.tsx` |
| Connexion et sessions | Better Auth Local Install dans Convex | `convex/authOptions.ts`, `convex/lib/authHooks.ts`, `src/lib/auth-client.ts` |
| Formulaires et contraintes partagées | TanStack Form et Zod importé depuis `@shared/zod` | `src/features/resources/resource-form.tsx`, `shared/validation.ts` |
| Interface, styles et icônes | shadcn local sur Base UI, Tailwind v4, Lucide | `components.json`, `src/components/ui/`, `src/styles.css` |
| Brouillons, conflits et navigation | État React local, `DraftGuard`, `SaveActions`, `ListNavigation` | `src/features/account/display-name-form.tsx`, `src/features/admin/users.tsx` |
| Export, suppression et reprise | Queries paginées, nettoyages Convex bornés et demandes durables | `convex/account.ts`, `convex/cleanup.ts`, `convex/crons.ts` |
| Email | Mailpit local, adaptateur Resend en production | `convex/emails.ts`, `docs/deployment.md` |
| Modules externes | Intégrations existantes, activées selon le besoin | `docs/modules.md`, `docs/observability.md`, `docs/auth-modules.md` |
| Qualité et tests | Oxlint/Ultracite, Oxfmt, Knip, Vitest et Playwright | `package.json`, `oxlint.config.ts`, `tests/backend/`, `tests/e2e/` |

PostgreSQL est la persistance interne de Convex. Ne pas ajouter un ORM ou un accès SQL métier direct. Réutiliser les données serveur sans second cache local, les formulaires existants sans autre framework et les composants Base UI sans introduire une variante Radix. Un outil supplémentaire demande un besoin que le socle ne couvre pas et une décision d’architecture motivée.

## TanStack Start

Les routes sont dans `src/routes`, l’arbre généré n’est jamais modifié manuellement. Définir le `loader`, le `head` et les handlers serveur dans `createFileRoute`. Utiliser `Link` et les imports `@/`, `@convex/`, `@shared/` ; les alias sont partagés par Vite, Vitest et TypeScript.

Une Server Function utilise `createServerFn({ method: 'GET' | 'POST' })`, `.inputValidator(schema)` si elle accepte une entrée, puis `.handler(async ({ data }) => …)`. Importer `z` depuis `@shared/zod`. GET reste sans mutation, POST conserve le middleware CSRF global. Ne retourner que des données publiques nécessaires au parcours. Le fichier `src/routes/_authenticated/app/admin.tsx` montre une lecture SSR privée via `fetchAuthQuery` ; `src/lib/public-capabilities.ts` montre une lecture publique. Convex conserve les permissions métier, même pour un appel SSR. Aucun client ou cache d’utilisateur global sur le serveur.

Les clients Convex et QueryClient sont créés par requête dans `src/router.tsx`. Les données réactives viennent de Convex/TanStack Query ; React gère les brouillons, dialogues et états de soumission. Utiliser les helpers SEO de `src/lib/seo.ts` et ajouter uniquement les pages publiques à `src/config/seo.ts`.

## Convex

Définir `query`, `mutation` ou `action` avec `args` et `returns`. Une fonction privée commence par `requireUser(ctx)` pour les opérations courantes ou `requireConfirmedUser(ctx, operation)` pour une mutation sensible depuis `convex/lib/auth.ts`, puis vérifie la propriété et les permissions de la ressource. Ces helpers imposent session vivante, MFA et restrictions du support. `ownerId` vient du serveur ; un identifiant client ne fait jamais autorité.

Une lecture personnelle utilise l’index propriétaire + scope personnel ; une lecture collective vérifie une membership puis l’index organisation. Voir `convex/resources.ts` et `convex/lib/resources.ts`. Les mutations atomiques restent dans Convex. Limiter les listes/opérations et appliquer les quotas durables ; utiliser `internal*` pour les opérations non publiques. La pagination native reste dans l’application ; le composant local utilise un curseur indexé pour l’audit.

Toute table personnelle doit entrer dans l’export, le nettoyage par lots et une fixture de restauration réelle. Les demandes `cleanupJobs` sont créées dans la transaction de suppression, reprises par le cron et retirées à la fin du nettoyage ; les intégrer au contrat de restauration. Les données communes survivent à la suppression du compte de leur auteur. Les tests backend possèdent les règles métier ; les E2E possèdent cookies, SSR, email, WebAuthn et livraison des preuves MFA.

## Better Auth

Lire `docs/auth-modules.md`. Configuration dans `convex/authOptions.ts`, politique serveur dans `convex/lib/authHooks.ts`, validation de session dans `convex/betterAuth/access.ts`. Les plugins installés conservent un schéma stable, mais leurs endpoints restent désactivés par défaut. Activer les variables privées Convex ; le client ne décide jamais des capacités.

Après un changement de plugin/options de schéma : `pnpm auth:generate`, examiner le diff, puis `pnpm backend:push`. Ne jamais modifier le schéma généré à la main. Ne pas remplacer les vérifications cryptographiques UV des passkeys, la protection des origines, les limites OTP ou le contrôle de facteur par un booléen client. Une assurance MFA est liée au facteur exact et à la session. Les rôles d’organisation ne donnent aucun rôle d’administration de plateforme.

## Formulaires et shadcn/ui

Conserver TanStack Form + Zod ; ne pas ajouter un second framework de formulaire. Utiliser `useForm`, validators et `form.Field`, connecter value/onChange/onBlur et les états pending. `FormTextField` associe label, invalidité et erreurs accessibles ; `FormError` accepte les erreurs Standard Schema. Voir le formulaire de connexion et celui des ressources.

Les composants shadcn sont locaux dans `src/components/ui`, fondés sur Base UI et Tailwind v4. Lire `components.json`, examiner l’API courante du composant, puis générer/adapter le seul composant utile. Préserver focus, labels, dialogues bloqués pendant une mutation et styles `src/styles.css`. Ne pas importer une variante Radix incompatible par habitude.

## Qualité et livraison

`pnpm lint:ci` : Oxlint type-aware + Ultracite, `pnpm format` : Oxfmt, `pnpm knip` : code/dépendances inutilisés. Les ajustements Ultracite sont explicites dans `oxlint.config.ts` ; les erreurs de promesses et les imports Zod restent contrôlés. Le code généré est exclu du format/lint.

Lefthook lance lint-staged puis le typecheck avant commit. Garder les hooks activés. `pnpm check` couvre typage, lint, format, Knip, Vitest backend/unitaires, Vitest Browser Mode et build. Installer Chromium avec `pnpm exec playwright install chromium` avant le premier Browser Mode.

`pnpm test:e2e:local` construit et teste son propre serveur sur un port libre ; `pnpm test:e2e:local organizations` et `pnpm test:e2e:local modules` vérifient les modes facultatifs en restaurant leurs variables. Ne pas réutiliser une application inconnue sur le port 3000. Les fournisseurs externes exigent une vérification avec leur propre configuration avant activation dans un produit.

## Choisir les vérifications

Dans la boucle de travail, exécuter le contrôle qui possède le comportement modifié. Avant de livrer un changement de code/configuration, exécuter `pnpm check` et les parcours pertinents ci-dessous. Un changement purement documentaire demande formatage, liens/références et `git diff --check`, sans relancer tous les E2E.

| Changement | Vérification ciblée et preuve attendue |
| --- | --- |
| Texte ou documentation | `pnpm exec oxfmt --check <fichiers>` ; relire liens, chemins et commandes contre le code |
| Interface/formulaire | Test Browser Mode existant ou parcours concerné ; saisie, erreurs, focus et brouillon. Utiliser `pnpm test:e2e:local -- <fichier.spec.ts>` pour un parcours ciblé |
| Règles métier ou droits Convex | `pnpm test:ci tests/backend/<domaine>.test.ts` ; cas autorisé et refus significatif au point d’entrée réel, puis `pnpm backend:push` si le backend local doit être testé |
| Sessions, cookies, SSR, email ou passkeys | `pnpm test:e2e:local` sur le serveur construit ; les tests backend seuls ne prouvent pas le transport |
| Droits ou composants partagés personnel/organisation | Tests backend du domaine, `pnpm test:e2e:local` et `pnpm test:e2e:local organizations` |
| MFA, Magic Link ou support | Tests backend concernés et `pnpm test:e2e:local modules` |
| Scripts locaux | `pnpm test:ci tests/scripts/setup.test.ts` ; refus d’une cible distante/d’un autre checkout, puis commande locale réelle et `pnpm doctor` |
| Runner Playwright ou confidentialité des rapports | `pnpm test:ci tests/scripts/playwright-privacy.test.ts` ; échecs réels sans valeur de champ dans les sorties ou artefacts |
| Nettoyage, schéma ou sauvegarde | Tests backend du cycle de vie, `pnpm test:e2e:local -- tests/e2e/restore.spec.ts` ; vérifier les données du domaine après restauration. S3 exige un exercice sur la cible S3 |
| Observabilité | Tests concernés, puis `pnpm test:e2e:local observability` ou `pnpm test:e2e:local spotlight` selon le module |
| Runtime ou déploiement | Build, E2E de production et exercice du conteneur sur une cible isolée ; preuve distincte sur le proxy et les fournisseurs réellement utilisés |

Les E2E d’une même instance s’exécutent successivement ; laisser renouveler les quotas selon [development.md](development.md). Ne pas désactiver les protections pour accélérer les tests. Ajouter une régression seulement si une couverture existante ne possède pas déjà ce contrat et montrer son échec avant la correction d’un bug.

Exécuter les contrôles adaptés puis `git diff --check`. Commit/push seulement avec l’autorisation applicable ; rapporter les commandes et résultats réellement observés.

Lire [Comptes et formulaires](accounts.md) pour le bootstrap admin, la migration des pseudos, les preuves sensibles et les composants `DraftGuard`, `SaveActions`, `ListNavigation`. `requireRecentUser` reste réservé au support technique. Ne pas remplacer la confirmation dans le parcours par une limite sur l’âge de connexion.
