# Holysheet GM Screen v2 — Brief

## Présentation (verbatim)

> Je veux reprendre tout le projet avec cette nouvelle méthode de travail pour avoir un meilleur résultat
> Je veux donc que dans ce projet on ré analyse, on vérifie que c'est carré, et on améliore l'interface et les fonctionnalités
> Je veux réutilisé le repo https://github.com/HalTorns/Holysheet-GmScreen car comme ça je n'ai pas a re compléter mes variable d'env dans coolify

## Objectif et critère de succès

Reprendre la V1 existante (repo `HalTorns/Holysheet-GmScreen`, branche `main`, déployée sur Coolify à `gmscreen.holysheet.fr`) en mode Claudex : Claude cadre, planifie et inspecte, Codex relit le plan et code. Trois chantiers, dans cet ordre :

1. **Audit** : vérifier que l'existant est carré (sécurité et droits Convex, intégrité des données, migrations, tests, dette, surface héritée du boilerplate inutile au produit).
2. **Fonctionnalités** : rattraper le retard sur le PRD (avancement jugé trop lent), en commençant par la bibliothèque de fiches et variables, puis les widgets.
3. **UI** : nouvelle identité visuelle et refonte de l'UX de l'éditeur (irritant principal).

C'est réussi quand :
- l'audit est rendu, ses corrections bloquantes sont livrées et `pnpm check` passe ;
- chaque tranche du PRD arrive sur `main` avec CI verte et sans perte de données en prod ;
- l'éditeur refondu est jugé plus intuitif par l'utilisateur, avec la nouvelle identité visuelle appliquée partout.

## Utilisateurs

Maîtres du jeu (MJ) francophones, en petite bêta privée. Chaque compte est personnel : pas d'organisation ni de collaboration entre comptes (voir le PRD, §2).

## Périmètre MVP

Le [PRD](../PRD.md) V1 **reste la référence de périmètre, tel quel**. L'audit peut y signaler des points flous ou trop ambitieux, mais c'est l'utilisateur qui tranche. L'état d'avancement est suivi dans [docs/product.md](product.md).

Déjà livré dans la V1 : authentification email et mot de passe, projets et dossiers, Screens (numériques ou A4), notes simples, éditeur (déplacement, redimensionnement, zoom, grille, calques, verrouillage, autosauvegarde, historique, profils), puis outils de notes (duplication, copier-coller, corbeille, groupes, alignement, styles).

Reste à faire :
- fiches et variables du projet ;
- les 12 catégories de widgets ;
- texte riche ;
- pop-ups, multi-fenêtres et ensembles de fenêtres ;
- recherche globale et palette de commandes ;
- impression et export PDF ;
- export et import de projet ;
- communauté (publication, import, modération) ;
- CSS personnalisé contrôlé, guides, menus contextuels et raccourcis.

## Hors périmètre

Ce qui était hors périmètre en V1 le reste :
- VTT ;
- IA intégrée ;
- organisations et collaboration entre comptes ;
- partage privé ;
- mode hors ligne ;
- extraction PDF ou Word et OCR (après la V1).

## Stack et architecture

On conserve la stack V1, issue de `NathanDigiDev/boilerplate-v2` :
- TanStack Start et Router (SSR), avec Query, Form et Zod ;
- Convex pour les données, les droits et le temps réel (PostgreSQL comme persistance interne) ;
- Better Auth Local Install ;
- Base UI, Tailwind 4 et Lucide ;
- outillage : oxlint, oxfmt, Knip, Vitest (unitaires et navigateur), Playwright ;
- Node 24.5 à 26, pnpm 11.8.

Organisation du code :
- `src/features/` : interface métier ;
- `src/routes/` : routes ;
- `convex/` : backend ;
- `shared/` : validations partagées.

Les règles détaillées sont dans `AGENTS.md`, `docs/architecture.md` et `docs/security.md`.

## Données, intégrations, secrets

- **Données de prod à conserver** : tout changement de schéma Convex vient avec sa migration, un test de migration et une vérification d'export et de restauration.
- **Secrets** : ils sont déjà configurés dans Coolify (raison de la réutilisation du repo). Aucun nouveau secret sans accord ; on documente dans `.env.example`.
- **Intégrations actives** : relais SMTP Infomaniak. Sentry, PostHog et Arcjet sont présents dans les dépendances, leur activation reste à vérifier pendant l'audit.

## Contraintes (délai, qualité, déploiement)

- **Branches** : commits directs sur `main`, choix de l'utilisateur. Conséquence : chaque push doit passer `pnpm check` localement avant de partir, puis la CI GitHub (`.github/workflows/ci.yml`).
- **Déploiement** : Coolify, déclenché manuellement par l'utilisateur. La publication des fonctions Convex de prod se fait aussi par l'utilisateur ou via le guide `docs/coolify-holysheet.md`.
- **Qualité** : on garde le niveau de la V1, c'est-à-dire les types, le lint, le formatage, Knip, les tests unitaires, backend et navigateur, le build et les E2E Holysheet.
- **Claudex** : 3 rounds de review Codex par plan, Codex comme builder et Claude comme inspecteur.
- **Langue** : interface en français.

## Critères d'acceptation (observables, vérifiables par commande)

- `pnpm check` passe : ts, lint:ci, format:check, knip, test:ci, test:browser:ci et build.
- `pnpm test:e2e:local -- tests/e2e/holysheet.spec.ts` passe sur le serveur construit.
- La CI GitHub est verte sur chaque commit poussé sur `main`.
- Chaque migration est couverte par un test qui applique la migration à des données V1 et vérifie leur relecture.
- L'audit est livré dans `docs/AUDIT.md`. Chaque constat a une gravité, une preuve (fichier, ligne ou commande) et une décision : corrigé, planifié ou accepté.

## Hypothèses (déduites, non confirmées)

- Le dossier local `/config/Projects/holysheet-gm-screen-v2` est un clone du repo V1 avec son historique. Le nom « v2 » ne sert qu'en local ; le repo garde son nom.
- Le développement se fait sur cet hôte Linux, sans WSL. Les scripts `setup`, `services:up` et `doctor` doivent fonctionner ici avec Docker : l'audit commencera par le vérifier.
- La branche `codex/editor-tools` est identique à `main` (même commit `bebbe36`), donc les outils de notes sont déjà sur `main`. Le déploiement de cette tranche en prod reste à confirmer.
- Les PR Dependabot ouvertes seront triées pendant l'audit.
- La nouvelle identité visuelle se cadrera au moment du chantier UI, avec des références fournies par l'utilisateur.

## Questions ouvertes

- Quotas, durée de la corbeille, limites du code personnalisé et version des archives : ces points étaient laissés ouverts dans la V1.
- Références visuelles pour la nouvelle identité, à fournir avant le chantier UI.
- Irritants précis de l'éditeur, à recueillir avant la refonte UX : on peut les lister au fil de l'eau.
- La version de prod actuelle correspond-elle à `main` (`bebbe36`) ?
