# Holysheet GM Screen

Une plateforme française pour préparer et consulter les références d’une partie de jeu de rôle : projets de campagne, dossiers, Screens personnalisables et contenus interactifs. Le [PRD](PRD.md) définit la V1 complète ; [le brief opérationnel](docs/product.md) suit sa réalisation.

## Démarrage sur ce poste Windows

Docker Desktop doit être démarré avec son moteur Linux et l’intégration Ubuntu 24.04. Node 26.11.0 et pnpm 11.8.0 sont installés dans WSL 2. Le code reste dans le dossier Windows du projet ; les commandes s’exécutent dans Ubuntu.

Depuis PowerShell dans le projet :

```powershell
powershell -File scripts/wsl.ps1 doctor
powershell -File scripts/wsl.ps1 dev
```

Dans un second terminal pendant les changements backend :

```powershell
powershell -File scripts/wsl.ps1 backend:dev
```

Application : [localhost:3000](http://localhost:3000). Emails locaux : [Mailpit](http://localhost:8025). Dashboard technique Convex : [localhost:6791](http://localhost:6791), avec accès administrateur distinct de l’application.

L’inscription utilise email et mot de passe. Vérifier l’adresse avec le code reçu dans Mailpit, puis se connecter avec le mot de passe. La récupération par code modifie le mot de passe et invalide les anciennes sessions. Les codes et messages restent dans l’environnement local ; aucun fournisseur d’email externe n’est nécessaire.

Pour une première initialisation : `powershell -File scripts/wsl.ps1 setup`. Pour reprendre des services arrêtés : `services:up`, puis `doctor`. Pour les arrêter en conservant leurs données : `services:down`. Le [guide Windows/WSL](docs/windows-wsl.md) précise les dépendances natives et le montage des fichiers privés.

## Premier parcours

Le premier jalon couvre un espace personnel : projet → dossiers → Screen numérique ou A4 paysage → note texte simple → sauvegarde et réouverture. Les versions de notes refusent un écrasement concurrent et les autres vues reçoivent les données via Convex. L’export du compte et son nettoyage incluent les nouvelles collections.

La tranche suivante ajoute un éditeur de notes déplaçables et redimensionnables, des profils numériques configurables, le zoom, la grille, les calques, le verrouillage, l’autosauvegarde et l’historique. Elle est validée localement sur `codex/screen-editor`, sans déploiement en production. Voir [les comportements de l’éditeur](docs/decisions/screen-editor.md).

Les autres catégories de widgets, le texte enrichi, les groupes/styles, l’impression/export de Screens et la communauté restent dans le périmètre de la V1 à construire. L’état et les preuves de livraison se trouvent dans [docs/product.md](docs/product.md).

## Architecture et vérification

TanStack Start/Router pour le SSR et la navigation, Convex pour les données/droits/temps réel, Better Auth Local Install pour les comptes. PostgreSQL est la persistance interne de Convex. Interface métier dans `src/features/`, routes légères dans `src/routes/`, règles backend dans `convex/`, validations partagées dans `shared/`.

Depuis Ubuntu dans ce checkout :

```sh
pnpm backend:push
pnpm check
pnpm test:e2e:local -- tests/e2e/holysheet.spec.ts
git diff --check
```

Le test Holysheet utilise des identités synthétiques, vérifie inscription, session, sauvegarde/réouverture, synchronisation, conflits, export, restauration et récupération du mot de passe. Traces, vidéos et captures automatiques d’authentification restent désactivées. Les suites historiques du socle conservent leurs contrats backend ; leurs anciens parcours UI de ressources/passwordless demandent une adaptation au produit.

Ne pas copier les `.env*` privés ou les volumes entre projets. Les wrappers vérifient la cible locale et la propriété des services. Aucune commande de publication distante n’appartient au setup local.

## Documents utiles

- [Déploiement Coolify et configuration du relais SMTP Infomaniak](docs/coolify-holysheet.md).

- [Instructions agents](AGENTS.md), [conventions](docs/agent-patterns.md), [architecture](docs/architecture.md), [sécurité](docs/security.md).
- [Modèle d’accès personnel](docs/decisions/access-model.md), [contenus et dispositions](docs/decisions/screen-data.md).
- [Comptes](docs/accounts.md), [modules d’auth du socle](docs/auth-modules.md), [versions et correctifs](docs/upgrades.md).
- [Développement](docs/development.md), [sauvegarde/restauration](docs/backup-restore.md), [déploiement](docs/deployment.md).

Le dépôt source reste accessible via le remote `boilerplate`. `origin` désigne le dépôt produit Holysheet GM Screen. L’utilisateur effectue le déploiement Coolify depuis ce dépôt ; suivre le guide ci-dessus pour le premier démarrage et la publication des fonctions Convex.
