# Holysheet GM Screen

## Référence et périmètre arrêté

Le [PRD](../PRD.md) est la référence fonctionnelle. Plateforme française de préparation et consultation de références pour MJ, bêta privée. La V1 complète comprend les douze catégories de widgets, le code personnalisé isolé, le temps réel, les profils numériques, la disposition papier indépendante, les exports et la communauté avec fonctions sociales/modération. Le premier jalon ne réduit pas ce périmètre.

Parcours : connexion → projet et dossiers → contenus et Screen → composition libre → consultation synchronisée → impression ou publication volontaire. Réussite : retrouver contenus et dispositions après réouverture, sans perte silencieuse de saisie ni fuite entre comptes.

Hors périmètre : VTT, IA intégrée, organisations, collaboration entre comptes, partage privé, mode hors ligne et synchronisation avec les sources importées. Extraction PDF/Word et OCR après V1 ; affichage PDF dès V1.

## Décisions opérationnelles

- Accès personnel via ID stable Better Auth ; voir [modèle d’accès](decisions/access-model.md).
- Bibliothèque de fiches/variables par projet. Séparer les contenus et leurs versions des positions dans les profils et l’impression. Références strictement internes au projet ; stocks des marchands séparés des objets partagés.
- Convex conserve données, droits et synchronisation. TanStack Start/Router, Query, Form, Zod via `@shared/zod`, composants locaux Base UI/Tailwind/Lucide ; versions conservées au lockfile.
- Premier jalon : connexion email/mot de passe → projet/dossier → Screen → note sauvegardée et réouverture. Inclure chargement/erreurs, refus tiers, conflits, export et nettoyage du compte. Une note simple initiale ne termine pas le widget texte riche.
- Ordre suivant : éditeur avancé et profils ; fiches/variables et douze widgets ; pop-ups/live ; préparation/recherche/impression ; robustesse sandbox ; communauté ; stabilisation. Anticiper sandbox et impression dès le socle des widgets.
- Modules organisations, paiements, IA et fournisseurs externes désactivés. Stockage Convex en première intention lors de l’ajout des fichiers.
- Domaine validé : `gmscreen.holysheet.fr`. Hypothèses réversibles à préciser : quotas, durée de corbeille, identité visuelle, limites custom et version des archives. Aucun quota provisoire ne représente une préférence utilisateur.

## État au 26 octobre 2026

- Prêt : environnement Ubuntu WSL 2, Node 26.11.0, pnpm 11.8.0, Chromium Linux, Docker et quatre services locaux ; setup et diagnostic passés.
- Implémenté : inscription/vérification/connexion et récupération email/mot de passe, projets, dossiers imbriqués, Screen 1920 × 1080 ou A4 paysage, note texte simple sauvegardée explicitement, réouverture, synchronisation de deux onglets et refus de conflits sans perte du brouillon.
- Cycle de vie : export du compte paginé sur les cinq nouvelles collections, nettoyage borné et fixture réelle de restauration intégrés. Les deux tests E2E Holysheet passent en développement, y compris restauration et récupération du mot de passe avec révocation de session.
- Validation : `pnpm check` passé (122 tests backend/unitaires, 4 tests navigateur de composants, types/lint/format/Knip/build). Les quatre E2E Holysheet passent sur le serveur construit : parcours métier avec restauration et récupération du mot de passe, refus passwordless, protections HTTP/origines et CSP avec refus d’un script injecté.
- Partiel : formats/profils stockés mais pas encore éditables, note simple sans richesse ni autosauvegarde ; le bouton lecture seule est local à la vue. La corbeille, l’archivage, la manipulation libre, l’historique, les imports/exports de Screens/projets, les autres widgets, le mobile et la communauté restent à réaliser.
- Auth : le setup active `AUTH_PASSWORD_ONLY=true`. Les codes servent à vérifier/récupérer le compte ; la connexion OTP/passkey/social est refusée côté serveur dans ce mode. Les garanties MFA existantes sont conservées.
- Context7 MCP indisponible dans cette session : consulter types/sources installés et documentation officielle compatible avant nouvel usage d’API, sans mise à niveau implicite.
- Prochaine tranche : éditeur libre avec positions/tailles persistées, profils configurables, autosauvegarde et historique ; garder l’impression indépendante.
- CI adaptée au produit : tous les tests backend restent exécutés ; le workflow cible les E2E Holysheet, incluant les contrôles HTTP/CSP. Les anciens fichiers E2E UI de ressources/passwordless/organisations sont conservés comme références. Une validation locale ne prouve pas une CI distante.
- Préparation Coolify : Compose et guide opérateur, service privé `operations`, relais SMTP Infomaniak configurable au runtime et expéditeur `admin@holysheet.fr`. Correctifs ciblés Zod/Happy DOM ; audit de production sans alerte high/critical, deux alertes modérées restantes.
- L’utilisateur autorise le commit et le push sur le dépôt GitHub produit et effectue lui-même le déploiement Coolify. Aucun effacement de données ni déploiement distant par l’agent n’est autorisé. La remise réelle des emails dépendra des paramètres du relais saisis dans Coolify.
