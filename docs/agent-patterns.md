# Conventions pour les agents

Lire d’abord `AGENTS.md`, `README.md`, `docs/architecture.md` et `docs/security.md`. Les ponts `CLAUDE.md` et `.cursorrules` renvoient à cette source commune. Context7 fournit les API actuelles ; ne pas appliquer une convention Next.js à TanStack Start.

## Un nouveau produit

Lire `docs/project-start.md`, recommander personnel / organisations / scopes mixtes selon la propriété des données, puis consigner le choix dans `docs/decisions/access-model.md`. Un SaaS individuel conserve le mode personnel. Lire `docs/adopting.md` avant de remplacer le domaine ressources ; lire `docs/modules.md` pour choisir les modules sans installer tous les fournisseurs.

## TanStack Start

Les routes sont dans `src/routes`, l’arbre généré n’est jamais modifié manuellement. Définir le `loader`, le `head` et les handlers serveur dans `createFileRoute`. Utiliser `Link` et les imports `@/`, `@convex/`, `@shared/` ; les alias sont partagés par Vite, Vitest et TypeScript.

Une Server Function utilise `createServerFn({ method: 'GET' | 'POST' })`, `.inputValidator(schema)` si elle accepte une entrée, puis `.handler(async ({ data }) => …)`. Importer `z` depuis `@shared/zod`. GET reste sans mutation, POST conserve le middleware CSRF global. Ne retourner que des données publiques nécessaires au parcours. Le fichier `src/routes/_authenticated/app/admin.tsx` montre une lecture SSR privée via `fetchAuthQuery` ; `src/lib/public-capabilities.ts` montre une lecture publique. Convex conserve les permissions métier, même pour un appel SSR. Aucun client ou cache d’utilisateur global sur le serveur.

Les clients Convex et QueryClient sont créés par requête dans `src/router.tsx`. Les données réactives viennent de Convex/TanStack Query ; React gère les brouillons, dialogues et états de soumission. Utiliser les helpers SEO de `src/lib/seo.ts` et ajouter uniquement les pages publiques à `src/config/seo.ts`.

## Convex

Définir `query`, `mutation` ou `action` avec `args` et `returns`. Une fonction privée commence par `requireUser(ctx)` pour les opérations courantes ou `requireConfirmedUser(ctx, operation)` pour une mutation sensible depuis `convex/lib/auth.ts`, puis vérifie la propriété et les permissions de la ressource. Ces helpers imposent session vivante, MFA et restrictions du support. `ownerId` vient du serveur ; un identifiant client ne fait jamais autorité.

Une lecture personnelle utilise l’index propriétaire + scope personnel ; une lecture collective vérifie une membership puis l’index organisation. Voir `convex/resources.ts` et `convex/lib/resources.ts`. Les mutations atomiques restent dans Convex. Limiter les listes/opérations et appliquer les quotas durables ; utiliser `internal*` pour les opérations non publiques. La pagination native reste dans l’application ; le composant local utilise un curseur indexé pour l’audit.

Toute table personnelle doit entrer dans l’export, le nettoyage par lots et une fixture de restauration réelle. Les données communes survivent à la suppression du compte de leur auteur. Les tests backend possèdent les règles métier ; les E2E possèdent cookies, SSR, email, WebAuthn et livraison des preuves MFA.

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

Exécuter les contrôles adaptés puis `git diff --check`. Commit/push seulement avec l’autorisation applicable ; rapporter les commandes et résultats réellement observés.

Lire [Comptes et formulaires](accounts.md) pour le bootstrap admin, la migration des pseudos, les preuves sensibles et les composants `DraftGuard`, `SaveActions`, `ListNavigation`. `requireRecentUser` reste réservé au support technique. Ne pas remplacer la confirmation dans le parcours par une limite sur l’âge de connexion.
