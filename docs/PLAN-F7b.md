# Plan — Tranche F7b : widget lien web et contenu intégré

Références : [PRD](../PRD.md) §5, catégorie 10 (« liens et contenus autorisés intégrables dans un cadre contrôlé ; prévoir refus gracieux quand un site interdit l'intégration ») · [ADR widgets](decisions/widgets.md) · [PLAN-F5a](PLAN-F5a.md).

## Objectif

Un widget `embed` affiche un lien web cliquable, ou intègre la page dans un cadre isolé. Une page qui refuse l'intégration ne casse ni le widget ni le Screen : le lien direct reste toujours disponible.

## Décisions (hypothèses réversibles, à consigner dans l'ADR widgets)

1. **Kind `embed`** : `config { url, title, mode: 'link' | 'frame' }`, `state {}`. Il suit le contrat F3 : une branche validée dans `convex/lib/gmValidators.ts` et `shared/gm.ts`, un rendu numérique et un rendu statique. Le mode par défaut est `link`.
   - **État « non configuré »** (revue F7b-04) : `url: ''` est accepté uniquement comme état initial. La création par le menu existant produit ce widget vide, qui n'affiche jamais ni lien ni cadre, seulement « Configurer le lien ». Toute URL non vide doit passer la validation.
2. **Validation de l'URL** (revue F7b-01) : une fonction partagée de `shared/`, identique côté client et serveur.
   - **Analyse WHATWG d'abord** (`new URL`) ; les contrôles portent ensuite sur les champs analysés, jamais sur le texte brut.
   - `protocol === 'https:'` ; `username` et `password` vides ; 2 048 caractères au plus pour l'URL sérialisée.
   - Le nom d'hôte canonique est celui produit par le parseur, en Punycode pour les IDN, sans point final : les noms qui se terminent par un point sont normalisés avant comparaison.
   - Refus :
     - `localhost` et ses sous-domaines, les noms en `.local`, `.internal`, `.localhost` et `.test` ;
     - les IPv4 privées, de boucle locale, link-local, `0.0.0.0/8` et CGNAT, sous toutes les formes, y compris abrégées, décimales ou octales, que le parseur normalise ;
     - les IPv6 de boucle locale, ULA, link-local et non spécifiée, ainsi que les IPv6 qui encapsulent une IPv4 interdite (`::ffff:…`, sous leur forme normalisée `[::ffff:7f00:1]`).
   - Refus des **origines de l'application**, comparées sous leur forme canonique : site, Convex cloud et Convex site. Sans cette règle, `allow-scripts` et `allow-same-origin` réunis permettraient au cadre de sortir de son bac à sable.
   - Le rendu utilise **l'URL sérialisée validée**, jamais la saisie brute.
   - Limite assumée et documentée : un nom DNS public qui pointe vers une adresse privée n'est pas détecté. Le cadre est chargé par le navigateur de l'utilisateur, jamais par le serveur.
   - **Toutes les voies d'écriture** appliquent la règle et renvoient `INVALID_URL` (revue F7b-03) : création, mise à jour, duplication, restauration depuis la corbeille et restauration de révision. L'export reste sans perte. Une URL stockée devenue invalide, par exemple après un changement de règle ou d'origine, s'affiche en texte non cliquable, et elle ne peut être ni dupliquée ni restaurée telle quelle.
3. **Cadre** :
   - `<iframe>` avec `sandbox="allow-scripts allow-same-origin allow-forms"`, `referrerpolicy="no-referrer"`, `allow=""` (aucune permission matérielle), `loading="lazy"`, `credentialless` là où le navigateur le prend en charge ;
   - **ni `allow-popups` ni `allow-popups-to-escape-sandbox`** (revue F7b-02) : le contenu intégré ne peut pas ouvrir de fenêtre hors du bac à sable, et la navigation externe passe par le lien de repli, qui appartient à l'application ;
   - jamais de `allow-top-navigation` ;
   - le **nom d'hôte canonique** est affiché à côté du cadre, pour que l'origine du contenu reste visible (anti-hameçonnage) ;
   - le cadre est une origine tierce, et il ne peut atteindre ni le DOM de l'application ni ses cookies.
4. **CSP** : on ajoute `frame-src https:` dans tous les environnements (revue F7b-05), développement compris, puisque `default-src 'self'` bloquerait sinon les cadres. C'est une ouverture volontaire, limitée aux cadres : `script-src`, `connect-src` et `img-src` ne changent pas. On garde `frame-ancestors 'none'` pour l'application elle-même. Une preuve E2E vérifie l'en-tête.
5. **Refus gracieux** : le navigateur ne signale pas de façon fiable un refus d'intégration (`X-Frame-Options` ou `frame-ancestors`), puisque l'événement `load` se déclenche aussi sur la page d'erreur. Le widget en mode cadre affiche donc **en permanence** un bandeau « Ouvrir dans un nouvel onglet », avec `rel="noopener noreferrer"`, et un texte d'aide : « Si rien ne s'affiche, ce site refuse l'intégration. »
   - **Aucune vérification côté serveur** de l'URL, comme un `fetch` depuis une action Convex : elle exposerait le réseau interne du serveur (SSRF, homelab).
6. **Rendu statique et impression** : titre, URL en texte, et mention « contenu intégré non imprimable ».
7. **Édition** : titre, URL et choix du mode, avec la validation en direct et le même brouillon et conflit de version que les autres widgets typés. La création passe par le menu d'ajout de widgets existant.

## Hors périmètre

Liste blanche de domaines par utilisateur, aperçu (titre, image) récupéré côté serveur, détection automatique du refus d'intégration, sites authentifiés, widgets personnalisés (F8).

## Critères d'acceptation

1. Unitaires et backend :
   - validation des URL : acceptées (https publiques, IDN) ; refusées (http, schémas dangereux, identifiants, origines de l'application, `localhost.`, `x.local.`, `127.1`, `2130706433`, `0177.0.0.1`, `[::ffff:127.0.0.1]`, IPv6 ULA et link-local, hôtes encodés, longueur) ;
   - écriture refusée avec `INVALID_URL` sur chacune des cinq voies d'écriture ;
   - une URL stockée qui devient interdite ne peut plus être dupliquée ni restaurée ;
   - duplication, restauration et export du kind.
2. Navigateur (Vitest) :
   - mode lien : `target="_blank"`, `rel` et texte ;
   - mode cadre : attributs `sandbox` exacts, sans popups ni `allow-top-navigation`, avec `referrerpolicy`, le nom d'hôte affiché et le bandeau de repli toujours présent ;
   - widget non configuré : ni lien ni cadre ;
   - URL stockée invalide affichée en texte ;
   - rendu statique.
3. E2E CI (revue F7b-05) :
   - les pages intégrées sont servies de façon déterministe par **l'interception réseau Playwright** (`page.route`) sur des URL HTTPS distinctes, servies uniquement par le test. Le domaine doit passer la validation de production, qui n'est pas affaiblie pour les tests : par exemple un sous-domaine d'`example.com`, intercepté avant tout accès réseau ;
   - une page renvoie du HTML et doit s'afficher dans le cadre ;
   - l'autre renvoie `X-Frame-Options: DENY` : son contenu ne doit pas s'afficher, le Screen reste utilisable, et le lien de repli comme le nom d'hôte sont présents ;
   - parcours réel : création par le menu, widget non configuré, saisie de l'URL, puis rechargement ;
   - l'en-tête CSP contient `frame-src https:`.
4. `pnpm check` vert, `pnpm audit:convex` à 0. ADR widgets, `docs/product.md` et le journal sont à jour.

## Commandes de preuve

`pnpm check` · `pnpm audit:convex` · CI de branche (E2E), puis avance rapide de `main`.
