# Plan — Chantier 3b : identité visuelle « Console »

Suite de [PLAN-UX3a](PLAN-UX3a.md) et [PLAN-UX3a2](PLAN-UX3a2.md). L'utilisateur a retenu la piste **B · Console**, en **sombre uniquement**, sur la planche « Holysheet — pistes d'identité 3b » (artefact privé, planches « B · Console », « B · États (sombre) », « B · Logo »). Ce plan applique cette identité au code, sans changer le comportement ni l'interaction définis en 3a.

## Constat

- **Thème** : les couleurs passent presque toutes par les variables de `:root` dans `src/styles.css`, reprises par `@theme inline` pour Tailwind. Il s'agit de la palette claire actuelle : crème, vert `#214738`, Manrope et Newsreader.
- **Couleurs en dur** :
  - 41 valeurs hexadécimales dans `src/styles.css`, surtout sur la page d'accueil (`.foundation-*`, `.stack-strip`, `.status-dot`, `::selection`) ;
  - `border-amber-500` dans `layout-editor.tsx:502` ;
  - la grille pointillée `#a1a1aa` dans `layout-editor.tsx:576`.
- **Styles des widgets enregistrés en base** :
  - `shared/gm.ts` fixe `defaultWidgetStyle` en clair (`#ffffff`, `#202a24`, `#d6d9d4`) ;
  - dès qu'un style est modifié une fois, `patchStyle` recopie ces valeurs dans le placement (`widget-tools.tsx:130`). Des Screens existants contiennent donc ces trois couleurs claires écrites en dur ;
  - le validateur Convex et le schéma Zod imposent `#rrggbb`.
- **Logo** : `src/components/brand.tsx` dessine trois barres (`.brand-mark`) ; `public/favicon.svg` les reprend.
- **Contraintes** :
  - la CSP a `font-src 'self'` : les polices doivent être servies par l'application (paquets `@fontsource`), pas par Google Fonts ;
  - les documents du bac à sable ont leur propre CSP (`font-src data:`) ; ils ne sont pas concernés.

## Décisions

1. **Thème unique, sombre.**
   - `:root` reçoit les jetons de la Console, avec `color-scheme: dark`.
   - Pas de thème clair ni de bascule : l'utilisateur a choisi le sombre. Un thème clair, pour l'impression par exemple, reste une évolution possible ; les noms de jetons restent sémantiques pour la permettre.
2. **Jetons** (valeurs de la planche, contrastes vérifiés) :

   | Jeton | Valeur | Usage |
   | --- | --- | --- |
   | `--background` | `#0F1216` | fond de page |
   | `--card`, `--popover` | `#171B21`, `#1D222A` | panneaux, widgets ; menus et dialogues |
   | `--foreground` | `#E8EAED` | texte (14,4:1 sur card) |
   | `--muted` | `#20252D` | boutons secondaires, survol |
   | `--muted-foreground` | `#9AA3AE` | texte secondaire (6,8:1 sur card) |
   | `--primary` / `--primary-foreground` | `#F0A43A` / `#0F1216` | action principale, braise (9:1) |
   | `--primary-hover`, `--primary-active` | `#F5B75C`, `#D88E26` | survol, appui |
   | `--link`, `--ring` | `#6CB6FF` | liens et focus, givre (8:1) |
   | `--border` | `#2C333D` | traits ; `--border-strong` `#3A424D` au survol |
   | `--input` | `#3A424D` | bord des champs |
   | `--destructive` | `#FF8F87` | danger (7,8:1 sur card) ; bouton plein : texte `#0F1216` |
   | `--success` | `#6FD49A` | « enregistré » |
   | `--warning`, `--warning-surface` | `#F7C77E`, `#3A2C14` | conflit, ligne d'initiative active |
   | `--selection` | `#F0A43A` | bord du widget sélectionné |

   `--secondary` et `--accent` (shadcn) pointent vers `--muted`. Le rayon de base passe à `0.5rem` (8 px, comme sur la planche).

3. **Typographie** :
   - **IBM Plex Sans** pour le texte (`--font-sans`) ;
   - **Inter Tight** 650 pour les titres (`--font-display`). Il remplace `--font-serif` dans les classes de l'interface : `page-heading`, `hero`, `section-heading`, `status-page`, `resource-card`, `layer-number`, etc. ;
   - **JetBrains Mono** pour les chiffres, identifiants et libellés techniques (`--font-mono`) ;
   - paquets `@fontsource-variable/inter-tight`, `@fontsource-variable/ibm-plex-sans` et `@fontsource-variable/jetbrains-mono`, versions épinglées. Si l'un n'existe pas en variable, on prend `@fontsource/<famille>` avec les seuls poids utilisés (400, 600, 650 ou 700) ;
   - Manrope est retiré. Newsreader est **conservé uniquement** pour l'option « Avec empattements » des widgets : c'est un choix de contenu de l'utilisateur, il doit continuer à s'afficher pareil.
4. **Styles des widgets, sans migration** :
   - `defaultWidgetStyle` devient `background #171B21`, `color #E8EAED`, `borderColor #2C333D` ;
   - nouvelle fonction pure `resolveWidgetStyle(style)` dans `shared/gm.ts`. Elle convertit la palette **en bloc** : si les trois couleurs (fond, texte, bordure) sont exactement les anciens défauts clairs (comparaison insensible à la casse), elle les remplace toutes les trois par les nouveaux défauts. Si une seule couleur a été personnalisée, la palette entière est conservée telle quelle, pour ne jamais marier un ancien choix à un nouveau défaut (revue UX3B-01) ;
   - elle s'applique :
     - au rendu (`layout-editor.tsx:871`) ;
     - à l'affichage dans `StyleControls` (`layout-editor.tsx:747`) ;
     - à la base de fusion de `patchStyle` (`widget-tools.tsx:130`), pour qu'une modification ne réécrive pas l'ancien blanc ;
   - aucun changement Convex ni du schéma, donc **pas de `backend:deploy`** pour 3b ;
   - la police par défaut des widgets reste `sans` : elle suit désormais IBM Plex Sans.
5. **Composants** (`src/components/ui/*`, `src/styles.css`), d'après la planche « États » :
   - **bouton `default`** : braise, texte nuit ; survol `--primary-hover` ; appui `--primary-active` ;
   - **bouton `outline`/`secondary`** : fond `--muted`, bord `--border`, survol `--border-strong` ;
   - **bouton `destructive`** : bord `#5A2A28` et texte `--destructive` ; au survol, aplat `--destructive` avec texte nuit ;
   - **`ghost` et `link`** : `link` utilise `--link` ;
   - **désactivé** : fond `--border`, texte `#6F7883`, au lieu de `opacity-50` (lisible sur fond sombre) ;
   - **focus clavier commun** : anneau givre de 2 px, décalé de 2 px (`outline: 2px solid var(--ring); outline-offset: 2px`). Il remplace `ring-3 ring-ring/50` sur les boutons, champs, éléments de menu, onglets et liens ;
   - **champs** : fond `--background`, bord `--input` ; focus avec bord givre de 2 px ; erreur avec bord et message `--destructive` ; désactivé en bord pointillé ;
   - **menus** : fond `--popover`, bord `--border-strong`, ombre profonde ; élément survolé ou actif sur fond `--border` ; ✓ coché en braise ; raccourcis en `--font-mono` atténué. Les éléments destructifs sont en `--destructive` : il reste à vérifier qu'ils sont bien en dernier dans chaque menu, sinon on ne réordonne que là où l'ordre 3a le permet ;
   - **widgets** :
     - sélectionné : bord braise de 2 px (remplace la couleur actuelle) ;
     - survol en Édition : contour pointillé givre ;
     - verrouillé : 🔒 dans l'en-tête, sans changement de couleur ;
     - en-tête : type en `--font-mono`, minuscules. L'en-tête (titre, ⚙, ⋯, poignée) a ses propres couleurs sémantiques (`--foreground` sur `--muted`) et n'hérite plus de `widgetStyle.color`, réservé au contenu du widget (revue UX3B-02) ;
   - **indicateurs d'enregistrement** (`SaveControl`, conflits) :
     - « enregistré » : point `--success` ;
     - en cours : `--muted-foreground` ;
     - échec : `--destructive` ;
     - conflit : encadré `--warning` sur `--warning-surface` ;
   - **divers** :
     - grille du Screen : points `#2C333D` ;
     - `::selection` : fond `#3A2C14`, texte `#F7C77E` ;
     - `border-amber-500` → `border-[--warning]`.
6. **Logo** :
   - `brand.tsx` affiche le signe à trois volets (SVG inline, volet central plein, volets latéraux en trait, `currentColor` piloté par `--primary`) et le mot-symbole « holysheet » en minuscules, Inter Tight 650 ;
   - le nom accessible reste « Holysheet » ;
   - `public/favicon.svg` prend la version simplifiée en aplats (fond nuit, volets latéraux `#8A5E22`) ;
   - ajouts : `<meta name="theme-color" content="#0F1216">` et `color-scheme` dans `__root.tsx` ;
   - le `Toaster` de Sonner (`__root.tsx`) reçoit `theme="dark"` : sinon ses notifications `richColors` restent claires (revue UX3B-03).
7. **Page d'accueil et pages hors Screen** : toutes les couleurs en dur de `styles.css` passent par des jetons. L'illustration `.foundation-*` est recolorée en sombre ; le bloc `.foundation-layer-dark` devient la couche mise en avant, en braise.
8. **Bac à sable et contenu** :
   - les documents `sandbox/host` et `sandbox/runner` ainsi que le contenu des widgets personnalisés restent sous le contrôle de l'auteur du widget ;
   - l'iframe hôte reçoit seulement `color-scheme: dark` et un fond transparent, pour éviter un flash blanc, si c'est faisable sans toucher à la CSP ; sinon, on le note comme dette ;
   - les pages PDF et les intégrations tierces restent telles quelles.
9. **ADR** : `docs/decisions/visual-identity.md`. Il reprend la palette, les polices, le choix du sombre seul et la résolution des anciens styles sans migration.

## Hors périmètre

- thème clair, bascule de thème, styles d'impression ;
- refonte de mise en page ou d'interaction : la grammaire 3a est inchangée et les noms accessibles ne bougent pas ;
- migration des styles de widgets en base ;
- icônes d'application PWA et manifeste (il n'y en a pas aujourd'hui) ;
- illustrations et pages marketing nouvelles.

## Critères d'acceptation

1. Aucune couleur hexadécimale ni classe de palette Tailwind (`amber-`, `zinc-`, etc.) dans `src/**/*.tsx`, hors `shared/gm.ts`, `brand.tsx` et le favicon. Dans `styles.css`, les hexadécimaux ne figurent que dans `:root`.
2. Test unitaire `tests/unit/theme-contrast.test.ts` :
   - il lit le bloc `:root` de `src/styles.css` ;
   - il vérifie au moins 4,5:1 pour chaque paire texte/fond (foreground, muted-foreground, link, destructive, success et warning sur `--background`, `--card` et `--popover` ; primary-foreground sur primary, primary-hover et primary-active) ;
   - il vérifie au moins 3:1 pour `--ring` et `--selection` sur `--background` et `--card`.
3. Test unitaire de `resolveWidgetStyle` :
   - la palette des anciens défauts, en majuscules ou minuscules, devient la nouvelle ;
   - deux palettes mixtes (fond `#ffffff` et texte `#222222` ; fond `#faf7f0` avec texte et bordure aux anciens défauts) sont conservées à l'identique ;
   - la fusion de `patchStyle` qui modifie un champ non coloré (`fontSize`) sur une palette mixte la conserve aussi ;
   - les champs non colorés passent inchangés.
4. Test navigateur (`tests/browser`) : un widget dont le style enregistré porte l'ancien blanc s'affiche avec le fond `#171B21` ; un widget à fond personnalisé `#ff0000` garde ce fond.
5. Test navigateur : un widget dont le texte enregistré est `#202a24` (palette mixte) garde un titre d'en-tête de couleur `--foreground`, et non `#202a24`.
6. Une notification Sonner `richColors` s'affiche sur fond sombre : son fond calculé a une luminance relative inférieure à 0,1.
7. Le focus clavier sur un bouton, un champ et un élément de menu montre un contour de 2 px `rgb(108, 182, 255)` (test navigateur, `getComputedStyle`).
8. Les polices sont servies depuis l'origine : aucune requête vers fonts.googleapis.com. `body` calcule `font-family` commençant par IBM Plex Sans, `h1` de `page-heading` par Inter Tight.
9. Toutes les suites existantes passent sans modifier les sélecteurs accessibles : `pnpm check`, tests navigateur, E2E en CI.
10. `knip` ne signale ni Manrope (retiré) ni paquet inutilisé.

## Vérification

- En local : `pnpm check` (lint, format, types, knip), `pnpm test` (unitaires et navigateur).
- En CI : E2E complets sur une branche `codex/ux3b`, puis avance rapide de `main`. Les poussées sont groupées, pour limiter les mails d'échec.
- **Visuel, manuel** : après le redéploiement Coolify, l'utilisateur compare l'éditeur (Édition, Jeu, Lecture), un menu ⋯ ouvert, l'inspecteur, la page projet, la connexion et l'accueil à la planche. La CI ne publie pas de captures (choix existant).
- Pas de `pnpm backend:deploy` nécessaire : aucun changement Convex.

## Répartition

Claude construit, pour ménager le quota hebdomadaire de Codex. Codex relit ce plan (un tour, deux au plus), puis inspecte le diff final dans une session neuve.

## Risques

- **Widgets aux palettes personnalisées claires** : conservés tels quels, ils apparaissent clairs au milieu d'un Screen sombre. C'est voulu (le contenu reste lisible) ; l'utilisateur peut les remettre au défaut. Un bouton « Couleurs par défaut » dans l'onglet Style serait un ajout léger, laissé hors périmètre.
- **Rendu des polices variables** : si Inter Tight 650 n'existe pas en variable, on prend 600 ou 700, au plus près de la planche.
- **Contenu en dur dans le texte riche** (surlignage, couleurs collées depuis le web) : il reste tel quel ; à vérifier sur un Screen réel.
