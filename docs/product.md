# Holysheet GM Screen

## Référence et périmètre arrêté

Le [PRD](../PRD.md) est la référence fonctionnelle. Plateforme française de préparation et consultation de références pour MJ, bêta privée. La V1 complète comprend les douze catégories de widgets, le code personnalisé isolé, le temps réel, les profils numériques, la disposition papier indépendante, les exports et la communauté avec fonctions sociales/modération. Le premier jalon ne réduit pas ce périmètre.

Parcours : connexion → projet et dossiers → contenus et Screen → composition libre → consultation synchronisée → impression ou publication volontaire. Réussite : retrouver contenus et dispositions après réouverture, sans perte silencieuse de saisie ni fuite entre comptes.

Hors périmètre : VTT, IA intégrée, organisations, collaboration entre comptes, partage privé, mode hors ligne et synchronisation avec les sources importées. Extraction PDF/Word et OCR après V1 ; affichage PDF dès V1.

## État consolidé — 28 octobre 2026

- **En production (`main`)** : inscription, vérification et récupération par email et mot de passe (`AUTH_PASSWORD_ONLY`) ; projets et dossiers imbriqués ; Screens numériques ou A4 paysage ; notes texte simples ; éditeur de disposition (déplacement, redimensionnement, zoom, grille, calques, verrouillage, profils, autosauvegarde, historique) ; outils de notes (duplication, copier-coller, corbeille restaurable, groupes, alignement, styles) ; export, nettoyage et restauration du compte.
- **Reprise V2 en mode Claudex** : cadrage dans [BRIEF](BRIEF.md). Le chantier 1 (audit) est clos, avec [l’audit](AUDIT.md), l’exception better-auth encadrée ([upgrades](upgrades.md)) et le correctif d’export AUD-02. La consolidation C1 couvre les tests de refus, les délais mesurés, les dépendances, l’image Node 26.11.1 et l’[ADR des migrations](decisions/migrations.md).
- **Chantier 2 en cours** : tranches livrées sur `main` — F1, la bibliothèque de fiches par projet ([PLAN-F1](PLAN-F1.md)), F2, les variables typées et formules avec refus des cycles ([PLAN-F2](PLAN-F2.md)), F3a, le socle de widgets typés et la migration des notes, prête mais non lancée ([PLAN-F3](PLAN-F3.md), [ADR](decisions/widgets.md)), F3b, les widgets checklist, compteur (local ou lié à une variable) et dés, et F4a, le widget fiche lié à la bibliothèque ([PLAN-F4](PLAN-F4.md)). F5a ajoute les widgets tableau (collage HTML/TSV), horloge (chronomètre, minuteur, cases, temps serveur) et initiative ([PLAN-F5a](PLAN-F5a.md)) ; les images (F5b) sont regroupées avec le stockage de fichiers de F6. F3c (contraction) attend la migration de la prod ; F4b (texte riche) est construit sur sa branche, avec activation Markdown explicite sans migration ; preuves locales et limites dans [F4b-validation](F4b-validation.md), inspection du coordinateur en attente.
- **Reste de la V1 (PRD)** : douze catégories de widgets, texte riche, pop-ups et multi-fenêtres, recherche et palette, impression et PDF, import et export de projet, communauté. C’est le chantier 2. La nouvelle identité visuelle et la refonte de l’UX de l’éditeur forment le chantier 3.
- **Dette planifiée (tranche C2)** : retrait des surfaces du socle hors produit (organisations, ressources de démo, impersonation, Spotlight, PostHog et Arcjet), voir AUD-10 à AUD-14.
- **Poste de développement** : Linux sans Docker ([development](development.md)). Les preuves des services et les E2E passent par la CI GitHub.

Les sections suivantes sont l’historique daté des jalons.

## Décisions opérationnelles

- Accès personnel via ID stable Better Auth ; voir [modèle d’accès](decisions/access-model.md).
- Bibliothèque de fiches/variables par projet. Séparer les contenus et leurs versions des positions dans les profils et l’impression. Références strictement internes au projet ; stocks des marchands séparés des objets partagés.
- Convex conserve données, droits et synchronisation. TanStack Start/Router, Query, Form, Zod via `@shared/zod`, composants locaux Base UI/Tailwind/Lucide ; versions conservées au lockfile.
- Premier jalon : connexion email/mot de passe → projet/dossier → Screen → note sauvegardée et réouverture. Inclure chargement/erreurs, refus tiers, conflits, export et nettoyage du compte. Une note simple initiale ne termine pas le widget texte riche.
- Ordre suivant : éditeur avancé et profils ; fiches/variables et douze widgets ; pop-ups/live ; préparation/recherche/impression ; robustesse sandbox ; communauté ; stabilisation. Anticiper sandbox et impression dès le socle des widgets.
- Modules organisations, paiements, IA et fournisseurs externes désactivés. Stockage Convex en première intention lors de l’ajout des fichiers.
- Domaine validé : `gmscreen.holysheet.fr`. Hypothèses réversibles à préciser : quotas, durée de corbeille, identité visuelle, limites custom et version des archives. Aucun quota provisoire ne représente une préférence utilisateur.

## État du premier jalon

- Prêt : environnement Ubuntu WSL 2, Node 26.11.0, pnpm 11.8.0, Chromium Linux, Docker et quatre services locaux ; setup et diagnostic passés.
- Implémenté : inscription/vérification/connexion et récupération email/mot de passe, projets, dossiers imbriqués, Screen 1920 × 1080 ou A4 paysage, note texte simple sauvegardée explicitement, réouverture, synchronisation de deux onglets et refus de conflits sans perte du brouillon.
- Cycle de vie : export du compte paginé sur les cinq nouvelles collections, nettoyage borné et fixture réelle de restauration intégrés. Les deux tests E2E Holysheet passent en développement, y compris restauration et récupération du mot de passe avec révocation de session.
- Validation : `pnpm check` passé (122 tests backend/unitaires, 4 tests navigateur de composants, types/lint/format/Knip/build). Les quatre E2E Holysheet passent sur le serveur construit : parcours métier avec restauration et récupération du mot de passe, refus passwordless, protections HTTP/origines et CSP avec refus d’un script injecté.
- Partiel : formats/profils stockés mais pas encore éditables, note simple sans richesse ni autosauvegarde ; le bouton lecture seule est local à la vue. La corbeille, l’archivage, la manipulation libre, l’historique, les imports/exports de Screens/projets, les autres widgets, le mobile et la communauté restent à réaliser.
- Auth : le setup active `AUTH_PASSWORD_ONLY=true`. Les codes servent à vérifier/récupérer le compte ; la connexion OTP/passkey/social est refusée côté serveur dans ce mode. Les garanties MFA existantes sont conservées.
- Context7 MCP indisponible dans cette session : consulter types/sources installés et documentation officielle compatible avant nouvel usage d’API, sans mise à niveau implicite.
- Prochaine tranche : éditeur libre avec positions/tailles persistées, profils configurables, autosauvegarde et historique ; garder l’impression indépendante.
- CI adaptée au produit : tous les tests backend restent exécutés ; le workflow cible les E2E Holysheet, incluant les contrôles HTTP/CSP. Les suites conservées utilisent GM ou des fixtures historiques directes ; C2 retire les parcours de démonstration obsolètes. Une validation locale ne prouve pas une CI distante.
- Préparation Coolify : Compose et guide opérateur, service privé `operations`, relais SMTP Infomaniak configurable au runtime et expéditeur `admin@holysheet.fr`. Correctifs ciblés Zod/Happy DOM ; audit de production sans alerte high/critical, deux alertes modérées restantes.
- Le premier jalon est initialisé sur Coolify le 27 octobre 2026 : configuration privée et fonctions publiées après autorisation explicite de l’utilisateur. La page de connexion et les endpoints publics répondent en HTTP 200 ; l’utilisateur confirme ensuite que les parcours fonctionnent. Aucun effacement ni réinitialisation n’a été réalisé.

## Tranche éditeur — développement au 27 octobre 2026

Tranche développée sur `codex/screen-editor`, puis intégrée à `main` au commit `a669c54` après autorisation de publication. Voir [la décision éditeur](decisions/screen-editor.md) pour les comportements, limites et stratégie de conservation des données. Le développement et les tests utilisent les services locaux et Mailpit.

La tranche couvre les notes existantes : géométrie persistée au pointeur/clavier, zoom et grille, empilement, profils numériques nommés et dimensions, verrouillage synchronisé distinct de la lecture seule, autosauvegarde, annuler/refaire de la vue et historique privé durable. Les contenus restent partagés entre profils et la mise en page papier indépendante. Les autres catégories, texte enrichi, styles/groupes/guides, corbeille, pop-ups, impression/export et communauté restent à réaliser.

Validation locale passée : `pnpm backend:push`, `pnpm check` (130 tests backend/unitaires, 7 tests navigateur de composants, types/lint/format/Knip/build) et les quatre E2E Holysheet sur le serveur construit. Le parcours métier vérifie déplacement, redimensionnement sous zoom, synchronisation entre fenêtres, profils indépendants, verrouillage, autosauvegarde, historique, petit écran et restauration réelle des six collections GM, puis récupération du compte. La saisie pendant une requête et les conflits sont aussi couverts par les tests React. La CI GitHub de cette révision a réussi (run 40519391165). Coolify a reconstruit les images ; configuration et fonctions Convex ont été publiées depuis `operations`. Le Screen existant et l’historique ont été ouverts avec succès dans le navigateur de production.

## Outils de notes — tranche suivante

Branche `codex/editor-tools` : duplication indépendante, copier-coller éphémère dans la vue, corbeille et restauration des placements dans chaque profil, effacement définitif confirmé, groupes mobiles ensemble, alignement/distribution et styles contrôlés. Les données existantes restent compatibles ; aucun changement des secrets ni de l’authentification. [Décision et limites](decisions/widget-tools.md).

Validation locale : `pnpm backend:push` et `pnpm check` passés (138 tests backend/unitaires et 7 tests de composants, types/lint/format/Knip/build), puis les trois tests de géométrie après ajout d’un cas de restauration, soit 139 comportements backend/unitaires distincts couverts. Les trois E2E de sécurité passent ; le parcours métier étendu passe dans un lancement ciblé, avec copie indépendante, mouvement groupé, rendu des styles, corbeille et restauration réelle. Deux essais précédents avaient échoué sur le chargement après connexion/rechargement, avant les nouveaux outils ; aucun correctif d’authentification ni relâchement de protection n’a été appliqué. La recherche de secrets sur les changements ne signale aucune fuite.

La tranche suivante du domaine sera la bibliothèque de fiches et variables du projet, puis leurs widgets liés. CSS libre, guides visuels, menus contextuels et raccourcis étendus de l’éditeur restent à compléter ; les pop-ups, imports/exports et la communauté restent dans le PRD.

## C2 — surfaces du socle retirées

Organisations et invitations ne sont plus proposées dans le produit ; création et nouvelles invitations sont refusées côté serveur, y compris les endpoints natifs Better Auth. Les API de gestion, transfert, export et suppression des organisations existantes sont conservées. La démonstration ressources perd son UI et son API CRUD ; sa table reste exportable et nettoyable. Aucune table ni schéma auth n’est modifié et aucune donnée n’est détruite par cette tranche.

L’impersonation est retirée de l’interface et sa création refusée ; les sessions historiques impersonées sont refusées par cookie et JWT. Rôles, bootstrap et protection du dernier administrateur restent en place. PostHog est retiré, y compris dépendances, CSP et variables déclarées ; les anciennes variables sont ignorées au démarrage. Sentry, Arcjet, dashboard privé et Spotlight en développement restent conservés.

La CI prévoit restauration, contrats des organisations historiques et modules auth via leurs lanceurs protégés. Les preuves E2E et CI restent à exécuter : aucun Docker disponible dans l’environnement de construction C2. Voir le rapport de livraison pour les vérifications locales réellement exécutées.

Preuves locales C2 : `pnpm check` réussi (246 tests backend/unitaires et 19 tests navigateur, build inclus), audits Convex et production high à 0, `git diff --check` sans erreur. Les trois exceptions Better Auth approuvées en T0 restent inchangées.
