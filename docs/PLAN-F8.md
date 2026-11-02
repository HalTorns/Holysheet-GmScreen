# Plan — Tranche F8 : widgets personnalisés en code isolé

Références : [PRD](../PRD.md) §5, catégorie 12, et §10 (sécurité du code utilisateur) · [ADR widgets](decisions/widgets.md) · [PLAN-F7b](PLAN-F7b.md) (cadres) · ADR de sécurité à créer : `decisions/custom-widgets.md`.

## Objectif

Le MJ écrit, dans l'application, un widget en HTML, CSS et JavaScript ou TypeScript. Il le place sur ses Screens, et chaque instance garde sa configuration et son état.

Le code s'exécute dans un environnement isolé. Il n'a accès ni au DOM de l'application, ni aux cookies, ni aux secrets, ni aux API Convex, ni aux autres widgets, ni aux variables partagées. Il n'a pas de réseau par défaut, et il n'est jamais évalué sur le serveur.

Ce plan couvre les widgets de l'utilisateur lui-même. L'installation de widgets communautaires, avec consentement, viendra avec la tranche communauté.

## Modèle

1. **Table `gmCustomWidgets`** (définitions, bibliothèque du projet) :
   - champs : `ownerId`, `projectId`, `name`, `html`, `css`, `source` (JS ou TS), `language: 'js' | 'ts'`, `compiled` (JS), `version`, `deletedAt` ;
   - index : par propriétaire, par projet vivant ;
   - limites : 64 Kio par champ source, 256 Kio au total par définition, 100 définitions par projet. Hypothèses documentées.
2. **Kind `custom`** (instance), selon le contrat F3 :
   - `config { definitionId, settings }` : `settings` est un JSON borné à 4 Kio, à plat, avec des valeurs scalaires ou des tableaux de scalaires ;
   - `state` : JSON borné à 8 Kio, validé côté serveur par la taille et la profondeur, sans interprétation.

   Une instance dont la définition est absente, en corbeille ou d'un autre projet affiche « Widget indisponible ».

3. **TypeScript** : la compilation se fait dans le navigateur à l'enregistrement, avec `sucrase`, qui retire seulement les types, chargé à la demande. Le serveur stocke la source et le JS compilé, vérifie les tailles, et n'exécute jamais rien. Une erreur de compilation est affichée à l'utilisateur et bloque l'enregistrement.

## Isolation (cœur de l'ADR de sécurité)

1. **Deux documents servis sans React ni authentification** (revue F8-SEC-03). Ce sont des gestionnaires serveur bruts (`server.handlers`, comme les routes existantes) qui renvoient un HTML statique, versionné et immuable. Ils n'ont ni la racine React, ni jeton, ni charge d'hydratation, ni donnée utilisateur. Le choix final des en-têtes se fait dans `src/server.ts`, **uniquement pour la réponse réussie de ces deux chemins exacts**. Les erreurs et toutes les autres routes gardent les protections de l'application.
   - **Relais `/sandbox/host`**, de même origine que l'application, non sandboxé et sans code utilisateur :
     - CSP : `default-src 'none'; script-src 'sha256-<relais>'; frame-src <origine>/sandbox/runner; frame-ancestors 'self'; base-uri 'none'; form-action 'none'` ;
     - son `frame-src` limité au chemin du runner **interdit toute navigation du cadre runner** vers une autre destination (revue F8-SEC-01) : `location`, liens, `meta refresh`, redirections et `data:` ;
     - les cadres F7b gardent `frame-src https:` sur la page de l'application, qui n'embarque le runner que via ce relais.
   - **Runner `/sandbox/runner`** :
     - CSP : `default-src 'none'; script-src 'sha256-<bootstrap>' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; webrtc 'block'` ;
     - **pas de `'self'` dans `script-src`** (revue F8-SEC-04) : seul le bootstrap, autorisé par son empreinte, s'exécute ; une balise `<script src>` injectée vers l'hôte ou vers l'extérieur est refusée sans requête. Le `'unsafe-eval'` n'existe que dans cette réponse ;
     - `Permissions-Policy` tout à `()` ;
     - **WebRTC** (revue F8-SEC-06) :
       - la CSP porte `webrtc 'block'` ;
       - en défense en profondeur, le bootstrap supprime `RTCPeerConnection`, `webkitRTCPeerConnection`, `RTCDataChannel` et `RTCIceTransport` avant d'exécuter le code utilisateur. Les documents `about:blank` créés par le code héritent de la CSP du runner ;
       - **navigateurs pris en charge** : la garantie « pas de réseau » est prouvée sur Chromium (CI). Sur un navigateur qui ne connaît pas la directive `webrtc`, il resterait une sortie résiduelle par ICE et STUN si un constructeur restait atteignable. Cette limite est consignée dans l'ADR, au lieu de promettre une isolation absolue.
   - En développement, la CSP de l'application autorise l'origine locale du relais.
2. **Cadres** :
   - l'application embarque `<iframe src="/sandbox/host">`, sans sandbox, puisque c'est notre page statique de même origine ;
   - le relais embarque `<iframe src="/sandbox/runner" sandbox="allow-scripts">`, **sans `allow-same-origin`**, donc d'**origine opaque** : aucun cookie, aucun stockage, aucun accès aux DOM parents, pas de formulaires, de popups ni de navigation du haut ;
   - `allow=""`, `referrerpolicy="no-referrer"`.
3. **Exécution** : le runner injecte HTML et CSS dans son propre document, puis exécute le JS compilé avec `new Function`. Le CSS reste confiné au document du cadre.
4. **Canal authentifié** (revue F8-SEC-02), avec des schémas zod partagés (`shared/custom-widget-protocol.ts`) :
   - le relais crée un `MessageChannel` par génération de cadre et transmet le port au runner dans un unique message `init` (`postMessage(…, '*', [port])`, la cible opaque l'exige) ;
   - le runner n'accepte `init` **qu'une fois**, seulement si `event.source === parent` et si `event.origin` est l'origine de l'application ;
   - **tous les messages suivants, dans les deux sens, passent par ce port**, qu'aucun autre cadre ne détient. Un widget voisin ou un cadre F7b qui atteint le runner via `parent.frames` ne peut ni réinitialiser ni modifier son état ;
   - entre l'application et le relais : `postMessage` avec une origine cible explicite, et contrôle de `event.source` et `event.origin` des deux côtés ;
   - le rechargement ou le démontage ferme le port et crée une nouvelle génération ;
   - messages : `init { html, css, js, settings, state, mode: 'live' | 'static' | 'preview', theme }` et `update { settings, state }` vers le runner ; `ready`, `setState { state }`, `resize { height }`, `error { message }` (tronqué, affiché en texte) depuis le runner ;
   - API offerte au code utilisateur : `widget.settings`, `widget.state`, `widget.setState(next)`, `widget.onUpdate(callback)`, `widget.mode`. Rien d'autre.
5. **Budgets et persistance** (revue F8-SEC-05) :
   - un budget **par type de message**, côté relais et côté hôte : `setState` 10/s, `resize` 5/s, `error` 5/s, total 30/s. Au-delà, le widget est **suspendu** (« Widget suspendu, recharger ») ;
   - les états acceptés s'appliquent tout de suite en local ; leur **persistance est regroupée** (une sauvegarde au plus par seconde et par instance, toujours le dernier état) et **sérialisée** avec `expectedVersion` ;
   - la persistance passe par une mutation dédiée `customWidgets.saveState`, **sans historique** et avec sa **propre limite** `customWidgetWrite` (30/min par compte, partitionnée), pour ne jamais consommer `gmEditorWrite` : l'édition ordinaire garde toute sa capacité ;
   - en aperçu, en statique ou en lecture seule, le code de l'hôte, qui est de confiance, ignore toute persistance ;
   - un chien de garde (`ping`/`pong` sur le port toutes les 2 s) suspend le widget s'il ne répond plus pendant 5 s.
   - **Limite assumée** : une boucle infinie peut figer l'onglet si le navigateur ne place pas le cadre opaque dans un processus séparé (Chrome isole les iframes sandboxées par défaut sur ordinateur). C'est consigné dans l'ADR ; une origine de sandbox sur un site distinct reste une option de déploiement pour plus tard.
6. **Rendu statique et impression** : le runner tourne avec `mode: 'static'`. Le code peut adapter son rendu, et sans JS l'HTML et le CSS seuls s'affichent. L'impression capture le contenu du cadre. Une définition qui ne gère pas le mode statique affiche son HTML de base.

## Interface

- Une section « Widgets personnalisés » dans la page projet : liste, création, édition, corbeille, restauration et purge.
- L'éditeur a trois zones de texte à police fixe (HTML, CSS, JS/TS, avec choix du langage) et un aperçu en direct dans le runner, qui se recharge à l'enregistrement. On ne fait pas d'IDE élaboré (PRD §10).
- Sur un Screen, on ajoute un widget personnalisé en choisissant une définition du projet. Les réglages se saisissent comme une liste de paires clé/valeur.
- Purge d'une définition : refusée si des instances vivantes l'utilisent, sinon autorisée depuis la corbeille. Les instances restantes affichent « Widget indisponible ».

## Cycle de vie

Export du compte, nettoyage (`cleanupJobs`), `snapshots.mjs` et `verify-restore.mjs` avec les relations instance → définition (même projet et même propriétaire), fixture de restauration non vide. La duplication d'une instance partage la définition.

## Hors périmètre

Widgets communautaires et consentement d'installation, accès réseau sur liste blanche, accès d'un widget aux variables du projet ou à d'autres widgets, bibliothèques externes (CDN), éditeur avec coloration et autocomplétion, origine de sandbox sur un domaine distinct.

## Critères d'acceptation

1. Backend : tailles et limites, isolation entre comptes, relations, purge et corbeille, validation de `state` et de `settings`, export, nettoyage.
2. Navigateur (Vitest), pour le protocole :
   - messages forgés ignorés (mauvaise source, mauvaise origine, schéma invalide, `init` répété, message hors port) ;
   - `setState` trop gros ou trop fréquent refusé ;
   - erreur affichée en texte ;
   - chien de garde.
3. E2E CI, contre le serveur construit :
   - créer une définition TS (compteur interne), la placer, interagir, recharger : l'état persiste ;
   - **tests d'évasion depuis le code utilisateur**, tous refusés, avec l'interception réseau de Playwright pour vérifier **qu'aucune requête interdite ne part** :
     - lecture de `document.cookie` (vide), `parent.document` et `localStorage` (exception) ;
     - `fetch` vers l'application et vers l'extérieur ;
     - `<script src>` vers l'hôte et vers l'extérieur ;
     - `top.location =` et `window.open` ;
     - **navigation du cadre** par `location.href`, lien cliqué, `meta refresh` et URL `data:` ;
     - **WebRTC** : un serveur STUN UDP local, lancé par le test sur `127.0.0.1`, observe côté serveur qu'**aucun paquet** n'arrive après une tentative de `RTCPeerConnection`, constructeur récupéré par tous les moyens connus (global, `about:blank`) ; l'interception HTTP seule ne suffit pas ;
   - **attaque entre cadres** : un widget personnalisé voisin et un cadre F7b tentent d'envoyer `init` et `update` au runner victime : sans effet ;
   - **en-têtes HTTP finaux** du relais et du runner (CSP exactes, `frame-ancestors`), et absence de jeton ou de charge d'hydratation dans leur HTML, même pour un utilisateur connecté ;
   - **flood** : un widget qui envoie `setState` en continu est suspendu, tandis qu'une sauvegarde normale de note reste acceptée ;
   - boucle infinie : le Screen reste utilisable ou le widget passe à « suspendu », selon ce que le navigateur de CI isole ; on consigne le résultat ;
   - impression ou mode statique.
4. `pnpm check` vert, `pnpm audit:convex` à 0, `pnpm audit --prod` sans nouvelle vulnérabilité (`sucrase`). ADR `decisions/custom-widgets.md`, `docs/product.md` et le journal sont à jour.

## Commandes de preuve

`pnpm check` · `pnpm audit:convex` · `pnpm audit --prod --audit-level=high` · CI de branche (E2E), puis avance rapide de `main`.
