# Revue du socle — 12 octobre 2026

> **Historique, non prescriptif.** Ce rapport décrit la version revue le 12 octobre 2026. Ses outils, règles d’authentification, limites et résultats ne décrivent pas nécessairement le code actuel. Pour travailler sur le socle, suivre [AGENTS.md](../../AGENTS.md), [les patterns](../agent-patterns.md), [les comptes](../accounts.md) et [la sécurité](../security.md). Les actions sensibles actuelles utilisent une preuve ponctuelle liée à la session et à l’opération ; la session récente reste réservée au support.

La revue porte sur l’ensemble du socle local : architecture SSR et cache, auth et autorisations Convex, formulaires, accessibilité, tests, dépendances, setup Docker, CI et restauration. Trois revues indépendantes ont examiné les standards/opérations, les exigences d’adaptation et le frontend/tests ; la revue principale a vérifié les frontières de sécurité et les corrections.

L’exigence de référence est une base cohérente et sécurisée, « facile à faire changer en fonction des projets futurs ». Les problèmes ci-dessous ont été corrigés. Les services locaux existants et leurs secrets ont été conservés.

## Standards et opérations

| Priorité | Problème confirmé avant correction | Correction |
| --- | --- | --- |
| Bloquant | Le setup héritait des sélecteurs Convex du shell. Une clé cloud pouvait prendre priorité sur la cible locale et provoquer un déploiement distant. | Refus des sélecteurs distants dans le processus, `.env` et `.env.local` avant toute mutation ; environnement local explicite et fichier CLI désigné. |
| Bloquant | Le nom Compose fixe permettait à deux clones de réutiliser les mêmes conteneurs et le même volume. | Identité persistante propre au checkout, contrôle du dossier propriétaire et des ports ; refus d’une configuration copiée. Adoption du volume historique seulement après vérification de son propriétaire. |
| Important | Réexécuter le setup supprimait les variables personnalisées de `.env.local`. | Conservation des lignes non modifiées, commentaires, chemins et valeurs multilignes ; écriture privée atomique des changements gérés. |
| Important | Un E2E déclaré en production pouvait réutiliser Vite déjà démarré et donner une preuve trompeuse. | Le mode production démarre son propre serveur construit et refuse un port déjà occupé. |
| Préventif | Les scripts opérationnels et la règle d’import Zod/CSP n’étaient pas contrôlés par le lint. La CLI auth manquait dans le groupe de mises à jour. | Lint des scripts, import Zod central imposé dans le frontend/shared et CLI auth groupée avec ses paquets compatibles. |

Code concerné : `scripts/local-config.mjs`, `scripts/setup-local.mjs`, `scripts/services.mjs`, `docker-compose.yml`, `playwright.config.ts`, `eslint.config.mjs` et `.github/`.

`pnpm doctor` vérifie l’environnement local en lecture seule : versions, sélection Convex, fichiers privés ignorés par Git, URLs, propriété des services, état de santé et disponibilité API. Ses sorties n’affichent aucune valeur de secret. Il ne certifie pas une infrastructure de production.

## Exigences et adaptation

| Priorité | Problème confirmé avant correction | Correction |
| --- | --- | --- |
| Important | Le vérificateur de restauration exigeait la table de démonstration `resources`, alors que sa comparaison des archives est générique. | Suppression de ce couplage ; inventaire et comparaison exacte de toutes les tables et des fichiers réellement exportés. |
| Important | Ajouter un domaine n’explicitait pas sa participation à l’export et au nettoyage du compte. | Guide d’adoption avec les fichiers à modifier, règles de propriété, pagination, nettoyage par lots, migration et preuves de restauration. |
| Amélioration | UI « Socle », noms de passkeys/emails « Boilerplate », métadonnées et formats dispersés. | `shared/app-config.ts` public et typé, partagé par UI/backend ; navigation vérifiée dans `src/config/navigation.ts`. |

Le [guide d’adoption](../adopting.md) décrit comment renommer le produit, remplacer la démonstration et ajouter un premier domaine complet. Le nom de présentation des passkeys est séparé du domaine/RP ID stable. Les formats et la langue déclarée ne constituent pas une traduction des écrans.

## Sécurité et interface

| Priorité | Problème ou durcissement | Correction et preuve |
| --- | --- | --- |
| Important | Better Auth 1.6.22 accepte par défaut une assertion passkey sans imposer la vérification utilisateur côté serveur. Ce défaut de politique ne répondait pas au niveau de protection retenu pour ce socle. | Hooks officiels contrôlant le flag UV issu de la vérification cryptographique avant persistance de clé ou création de session. PIN/biométrie requis. Le test a reçu HTTP 200 avant correction avec une assertion signée sans UV ; le refus et le parcours autorisé sont vérifiés après correction. |
| Important | Le dialogue de ressource se fermait pendant une sauvegarde. Son ancienne promesse pouvait ensuite fermer une nouvelle édition et perdre le brouillon. | Fermeture et saisie verrouillées pendant la mutation, puis fermeture après succès. Le test a échoué avant correction après Escape ; il attend une vraie mutation temporairement retenue puis vérifie sa persistance. |
| Accessibilité | La frontière des champs avait un contraste de 1,34:1. Des indices décoratifs étaient annoncés aux lecteurs d’écran. | Contraste porté à 3,04:1, focus conservé et indices décoratifs masqués à l’arbre accessible. |

Les autorisations métier restent dans Convex. Les contrôles existants ont été conservés : session active appartenant au sujet, email vérifié, propriété par ID stable, pagination bornée, quotas, authentification récente pour les opérations sensibles, protection atomique de la dernière passkey et fermeture immédiate des accès à la suppression du compte.

Les nouvelles preuves OTP utilisent le transport réel et Mailpit : code incorrect refusé, ancien code refusé après renvoi, un seul succès pour deux consommateurs concurrents et rejeu refusé. Le parcours CSP vérifie également l’absence de `unsafe-eval`. Les assertions et diagnostics ne publient ni OTP, ni cookies, ni bearer.

## Validation

La revue ultérieure du module optionnel est détaillée dans [Organisations : isolation et permissions](organizations-review.md), avec ses correctifs d’invitations, de lanceur local, de disponibilité JWT et de consignes au démarrage d’un nouveau produit.

Le [bilan de vérification](verification.md) consigne les résultats des contrôles exécutés sur la version corrigée, notamment les 20 tests backend/scripts, les parcours du serveur construit, l’audit et la restauration. Sept tests opérationnels ont échoué sur l’ancien setup puis réussi après correction. La source installée de Better Auth a été revue indépendamment pour confirmer que les hooks UV interviennent avant les effets sensibles.

## Limites et prochains choix

- Les ports locaux restent fixes : un projet actif à la fois. L’isolation du stockage n’implique pas une configuration de ports simultanés.
- L’infrastructure publique doit encore définir ses origines HTTPS, fournisseur email, supervision, sauvegardes hors serveur et frontière réseau de confiance. Le quota auth partagé limite le débit global ; un quota par IP exige une entrée impossible à contourner.
- La première CI distante, la restauration de fichiers non vides et la reconnexion effective après restauration restent à vérifier sur leurs surfaces réelles.
- Nitro est verrouillé sur une version bêta. Le correctif de types du provider Convex/Better Auth et le nettoyage upstream détaché des quotas sont documentés dans [Mises à jour](../upgrades.md).
- Une query dépendant de l’heure ne réévalue pas son abonnement uniquement parce que le temps passe. L’UI peut conserver une donnée déjà reçue ; une minuterie client ne constitue jamais une autorisation. Les mutations sensibles revalident la session côté serveur. Examiner ce contrat avant d’introduire des permissions à expiration ou des abonnements de données sensibles.
- L’export actuel assemble ses pages en mémoire dans le navigateur. Pour un volume métier important, prévoir une tâche bornée et un téléchargement privé.

Les ajouts prioritaires dépendent du premier produit : organisations et permissions pour une application partagée ; supervision et sauvegardes durables pour une ouverture publique. Paiements, fichiers, IA et traduction complète s’ajoutent avec un parcours réel et les règles du [guide des modules](../modules.md).
