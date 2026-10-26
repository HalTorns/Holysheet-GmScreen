# État de l’installation locale — 23 octobre 2026

## Avant redémarrage Windows

- Boilerplate cloné dans le dossier courant, révision initiale `6a750e1475f2f877dc5309af715909513f4f31c9`.
- Dépôt produit vérifié vide ; remote `origin` : `https://github.com/HalTorns/Holysheet-GmScreen.git` ; source conservée sous `boilerplate`.
- PRD fourni copié à la racine. Aucun code applicatif modifié, aucun commit ni push.
- Node 24.22.1 : compatible avec le dépôt.
- `pnpm install --frozen-lockfile` : réussi avec pnpm 11.25.0 fourni par le runtime Codex, sans modification du lockfile.
- pnpm 11.8.0 demandé par le dépôt : téléchargé et vérifié via `pnpm dlx pnpm@11.8.0 --version`. Utiliser cette version pour la suite ; le pnpm global du runtime n’a pas été remplacé.
- `pnpm exec playwright install chromium` : réussi. Lancement headless réel vérifié avec `chromium` importé depuis `@playwright/test`.
- Docker Desktop 4.96.3 installé via winget ; CLI Docker 29.9.2 et Compose 5.6.1 vérifiées dans `C:/Program Files/Docker/Docker/resources/bin/`.
- WSL 2.7.13 installé avec élévation Windows ; noyau 6.18.33.2-2.
- Activation du composant Windows demandée via `wsl --install --no-distribution --web-download` : Windows confirme un redémarrage requis. Aucun redémarrage lancé automatiquement.

## Après redémarrage

1. Vérifier `wsl --status` et démarrer Docker Desktop ; vérifier le moteur Linux avec `docker version` et `docker info`.
2. Choisir l’exécution WSL 2 recommandée par le prompt, en préservant ce checkout et son historique. Les wrappers du socle utilisent `spawnSync('pnpm', ...)` et les permissions POSIX : leur compatibilité Windows native n’est pas établie.
3. Préparer si nécessaire une distribution Linux et son environnement Node/pnpm 11.8.0 ; ne pas réutiliser les modules natifs Windows sous Linux.
4. Suivre `pnpm setup`, puis `pnpm doctor` dans l’environnement retenu. Aucun service, secret ou volume du projet n’a encore été initialisé.
5. Reprendre le cadrage technique et le premier parcours demandé : connexion email/mot de passe, projet, dossier, Screen et note persistée. Le socle dispose d’un flag credentials, mais les parcours inscription/récupération et la restriction des autres méthodes restent à adapter au PRD.

Le redémarrage a été effectué par l’utilisateur ; voir l’état actuel ci-dessous.

## État après redémarrage — 26 octobre 2026

- Ubuntu 24.04 installé et défini comme distribution par défaut ; intégration Docker activée dans Docker Desktop.
- Node Linux 26.11.0 installé depuis l’archive officielle avec vérification SHA-256 ; pnpm Linux 11.8.0 installé. Chromium et ses dépendances Linux installés.
- Modules Windows conservés dans `node_modules.windows/` ; modules Linux dans `node_modules/` et magasin virtuel externe. La configuration pnpm de l’utilisateur root de cette distribution dédiée fixe le magasin virtuel à `/opt/holysheet-tools/holysheet-dependencies` ; un lien de résolution vers les dépendances du checkout conserve les types des dépendances directes.
- `/etc/wsl.conf` active les métadonnées du montage Windows ; permissions `600` vérifiées pour les deux configurations privées après redémarrage de la distribution.
- `pnpm setup` et `pnpm doctor` réussis. PostgreSQL 18, Convex, dashboard et Mailpit sains. Identité Docker du checkout et secrets conservés.
- Le lanceur `scripts/wsl.ps1 doctor` a aussi été vérifié depuis Windows PowerShell.
- Le premier parcours est implémenté ; validation et limites à jour dans [le brief produit](product.md).
- `pnpm check` et les deux E2E Holysheet sur serveur construit passent, avec comparaison réelle des cinq collections après restauration sur une instance jetable. Les volumes jetables sont nettoyés ; les services source restent sains. Aucun commit, push ou déploiement distant effectué.
