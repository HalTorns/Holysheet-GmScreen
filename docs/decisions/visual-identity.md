# Identité visuelle « Console » (chantier 3b)

## Décision

L'application adopte la piste **B · Console**, choisie par l'utilisateur sur la planche d'identité. Elle est **sombre uniquement** : il n'y a ni thème clair ni bascule. Le plan revu est [PLAN-UX3b](../PLAN-UX3b.md).

- **Jetons** : ils sont dans `:root` de `src/styles.css`. Leurs noms restent sémantiques (`--primary`, `--link`, `--warning`…), pour permettre un futur thème clair sans toucher aux composants.
- **Couleurs** :
  - braise `#f0a43a` pour l'action, avec un texte nuit ;
  - givre `#6cb6ff` pour les liens et le focus ;
  - fond `#0f1216`, panneaux `#171b21`.
  - `tests/unit/theme-contrast.test.ts` vérifie chaque paire texte/surface (4,5:1) et les repères de focus et de sélection (3:1).
- **Polices** :
  - IBM Plex Sans pour le texte, Inter Tight 650 pour les titres, JetBrains Mono pour les chiffres et les états ;
  - elles sont servies par l'application (`@fontsource-variable/*`), car la CSP impose `font-src 'self'` ;
  - Newsreader ne sert plus qu'à l'option « Avec empattements » des widgets.
- **Focus clavier** : un seul contour, givre, de 2 px, sur les boutons, les champs, les éléments de menu et tout élément focalisable. Il remplace l'anneau semi-transparent, peu visible sur fond sombre.
- **Logo** :
  - signe à trois volets en `currentColor` (`brand.tsx`), mot-symbole en minuscules ;
  - le favicon est simplifié en aplats, parce qu'un trait disparaît sous 32 px.
- **Notifications** : Sonner en `theme="dark"`.

## Anciens styles de widgets, sans migration

Avant 3b, `patchStyle` recopiait dans le placement la palette claire par défaut (`#ffffff`, `#202a24`, `#d6d9d4`) dès qu'un style était modifié. `resolveWidgetStyle` (`shared/gm.ts`) remplace cette palette **en bloc** par celle du thème sombre, au rendu, dans l'inspecteur et avant toute fusion de `patchStyle`. Une palette dont une seule couleur a été choisie est conservée entière : sinon, un texte sombre choisi se retrouverait sur le nouveau fond sombre (revue UX3B-01).

La conversion se fait côté client, sans écriture en base. Rien ne change dans Convex, et le premier enregistrement d'un style écrit simplement les nouvelles valeurs. L'en-tête d'un widget garde ses couleurs sémantiques, indépendamment de la couleur de texte du contenu (UX3B-02).

## Conséquences

- Un widget à palette claire personnalisée reste clair dans un Screen sombre. C'est voulu ; l'utilisateur peut le remettre au défaut.
- Les documents des widgets personnalisés, les intégrations tierces et les pages PDF gardent leur propre fond. Un widget personnalisé sans `color-scheme` est peint sur un fond clair opaque par le navigateur, ce qui préserve la lisibilité de son contenu.
- Les couleurs collées dans le texte riche, comme le surlignage venu du web, ne sont pas converties.
- Un thème clair (impression) demanderait de redéfinir les jetons sous un sélecteur et de dériver une variante du logo. Les composants n'ont pas à changer.
