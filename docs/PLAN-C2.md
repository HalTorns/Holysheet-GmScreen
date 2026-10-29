# Plan — Tranche C2 : retrait des surfaces du socle hors produit

Références : [AUDIT](AUDIT.md) AUD-10 à AUD-14 (recommandations acceptées par l'utilisateur au cadrage) · [PRD](../PRD.md) §16, qui classe hors périmètre les organisations, les invitations et l'IA intégrée · [PLAN-C1](PLAN-C1.md).

## Objectif

Réduire la surface d'attaque et la maintenance : ce que l'utilisateur ne peut plus voir ni appeler n'a plus à être protégé, testé ou mis à jour. **Aucune donnée n'est détruite et aucune table n'est supprimée** : les tables et le schéma auth restent lisibles, exportables et nettoyables. Leur retrait physique serait une migration à part, éprouvée et autorisée.

## Périmètre

1. **Organisations (AUD-10)**, retrait de l'interface seulement (revue C2-01, C2-02).
   - On retire les routes `src/routes/_authenticated/app/organizations/`, `src/features/organizations/`, l'entrée de navigation et la capacité `organizations`.
   - Le serveur refuse toute **création** d'organisation, par la fonction publique comme par l'endpoint Better Auth natif, ainsi que toute nouvelle invitation. Aucune nouvelle donnée partagée ne s'accumule.
   - On **garde** les fonctions de gestion, d'export, de transfert de propriété et de suppression (`convex/organizations.ts`, `convex/betterAuth/organizations.ts`). Ainsi, les ressources partagées existantes restent exportables, et un compte resté dernier propriétaire peut toujours supprimer son organisation, puis son compte. Leur retrait viendra avec une migration des données existantes, qui fera l'objet d'une tranche à part.
   - Plugin Better Auth, schéma, champs `organizationId` et événements `organization.*` : inchangés.
   - La spec `tests/e2e/organizations.spec.ts` est réduite aux contrats conservés (refus de création, export, suppression), avec des fixtures insérées directement.
2. **Ressources de démonstration (AUD-11).**
   - On retire l'interface `src/features/resources/` et ses routes, ainsi que les fonctions publiques de `convex/resources.ts`.
   - La table `resources` reste dans le schéma, l'export de compte et le nettoyage, sans changement de données. Les fixtures et tests qui s'appuyaient sur les ressources (restauration, export, quotas, droits) passent sur des données GM (projet, fiche, widget) ou sont retirés s'ils ne protégeaient que la démo.
3. **Impersonation (AUD-12).**
   - On retire l'action d'impersonation du panneau support, et le serveur refuse la **création** d'impersonation, même par appel direct à l'API. Le test utilise un opérateur autorisé avec MFA vérifiée, pour que le refus vienne bien de la nouvelle règle et non d'un 403 antérieur (revue C2-03).
   - Le serveur refuse aussi les **sessions d'impersonation existantes** : toute session portant `impersonatedBy` est refusée dans la validation commune des accès (`convex/betterAuth/access.ts`, `convex/lib/sessionAccess.ts`), par cookie comme par JWT. On le teste avec une session historique insérée directement.
   - On garde rôles, bootstrap et protection du dernier administrateur. Schéma et tables d'impersonation : inchangés.
4. **Spotlight (AUD-13)** : déjà réservé au développement (`import.meta.env.DEV`) et hors de la CI standard. On ne le change pas, et on le consigne dans l'audit. Le dashboard reste un outil privé.
5. **PostHog (AUD-14).**
   - On retire `posthog-js`, `@posthog/react`, `src/features/observability/posthog-provider.tsx`, le chargement analytics et ses tests.
   - On retire aussi les hôtes PostHog de la CSP et les variables `VITE_POSTHOG_*` du schéma d'environnement. Une variable encore définie dans Coolify ne doit pas faire échouer le démarrage : on ignore les variables inconnues, et on le vérifie.
   - Sentry (erreurs expurgées) reste.
   - **Arcjet reste**, inerte sans clé : c'est une protection de sécurité, la retirer demande une décision d'exploitation. On le consigne.

## Hors périmètre

Suppression de tables ou de champs, retrait de l'API de gestion des organisations existantes, changement du schéma Better Auth, retrait du dashboard, retrait de Sentry ou d'Arcjet, refonte de l'administration.

## Critères d'acceptation

1. `pnpm check` vert, `knip` sans export ni dépendance orpheline, `pnpm audit:convex` à 0 avec l'inventaire de `docs/AUDIT.md` mis à jour : les fonctions publiques retirées disparaissent de l'inventaire.
2. Tests :
   - refus de l'impersonation par appel direct ;
   - routes `/app/organizations` et ressources : 404 ou redirection, sans contenu ;
   - démarrage avec une variable `VITE_POSTHOG_KEY` encore définie ;
   - export et nettoyage d'un compte qui possède encore d'anciennes lignes `resources`, avec une fixture insérée directement.
3. E2E CI verte, avec des preuves réellement exécutées (revue C2-04-R2) :
   - `restore.spec.ts` est ajouté à la commande E2E de la CI ;
   - `auth-modules.spec.ts` passe par son lanceur protégé `scripts/test-auth-modules.mjs` (préparation MFA, support, secret proxy, puis restauration des variables) dans une étape CI dédiée. Le parcours support y est adapté : plus d'impersonation réussie, refus de création et de session historique prouvés ;
   - `organizations.spec.ts` est réduite aux contrats conservés (refus de création, export, suppression), sans dépendre de la capacité retirée, avec des fixtures directes, et lancée par son propre lanceur s'il en faut un ;
   - aucune de ces preuves ne peut être ignorée (`skip`) : le builder vérifie dans le log CI que les cas ont bien été exécutés, avec leur nombre de tests. On garde ces étapes en CI si elles sont stables ; sinon, l'écart est consigné. Le rapport de restauration couvre toujours les tables conservées, avec des fixtures directes pour les tables qu'on ne peut plus alimenter publiquement.
4. Statut des constats AUD-10 à AUD-14 mis à jour dans `docs/AUDIT.md` ; journal et `docs/product.md` à jour.

## Commandes de preuve

`pnpm check` · `pnpm audit:convex` · `pnpm audit --prod --audit-level=high` · CI sur la branche, puis avance rapide de `main`.
