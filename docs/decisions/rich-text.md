# Texte riche des notes

Décision du 28 octobre 2026 (chantier 2, F4b), rédigée par Codex et arbitrée par Claude Code (voir le plan F4b). Références : [PRD §6, §9.1, §10–11](../../PRD.md), [plan F4b](../PLAN-F4b.md), décisions [widgets](widgets.md) et [migrations](migrations.md).

## Contexte

Les notes stockent aujourd'hui une chaîne `body`, sans langage déclaré. F3 extrait ce corps dans `gmWidgetContents` et conserve une lecture V1/V2 ; la contraction F3c attend la vérification opérateur. Les snapshots contiennent le texte historique, et `use-editor-draft.ts` gère sauvegarde différée, versions et conflits. F4b doit enrichir les notes sans interpréter rétroactivement leurs `#`, astérisques ou balises.

Le PRD demande édition directe et collage depuis des documents existants. Les widgets de code du §10 constituent une autre frontière : une note ne peut fournir ni HTML exécutable, ni CSS, ni script.

## Décision proposée

**Conserver `body: string`, ajouter un format optionnel et proposer une textarea Markdown avec barre d'outils et aperçu.** Aucun WYSIWYG en F4b. L'édition reste dans le widget, également en pop-up ; la syntaxe reste visible pendant la saisie. Ce compromis d'ergonomie est soumis au coordinateur.

| Option | Bénéfice | Coût et risque |
| --- | --- | --- |
| **Sous-ensemble Markdown, textarea + aperçu** | Corps lisible, contrôle natif accessible, réutilisation du brouillon, rendu statique commun | Syntaxe visible ; conversion du collage à borner ; extension nécessaire pour le repli |
| Document JSON + Tiptap/ProseMirror ou Lexical | Mise en forme visuelle, schéma de blocs, meilleure base pour le collage riche | Éditeur, extensions et adaptateur React supplémentaires ; sélection, IME, accessibilité et historique à intégrer ; format/versionnement propres. Bundle et CSP à mesurer sur la configuration retenue, sans présumer d'une incompatibilité |
| HTML assaini stocké | Échange direct avec le presse-papiers | Canonicalisation et assainissement à chaque frontière, dérive des attributs/styles, édition et historique plus fragiles ; le HTML ne résout pas le choix d'éditeur |

Le JSON reste une option si l'édition visuelle devient prioritaire. [Tiptap documente sa persistance JSON/HTML](https://tiptap.dev/docs/editor/core-concepts/persistence) ; cette possibilité ne justifie pas son installation pour cette tranche. Aucun chiffre comparatif de bundle n'est supposé mesuré.

## Format et compatibilité

- `gmWidgetContents.bodyFormat?: 'plain' | 'markdown-v1'`. Absence = `plain`, y compris notes V1 et anciennes révisions. Ce champ est distinct de `formatVersion: 2` (structure F3) et de `version` (concurrence).
- Les snapshots de note portent le même champ optionnel. Corps et format constituent **une seule valeur éditée**, une seule version et une seule révision. Une modification de format seule est une modification réelle.
- Les notes existantes restent en texte littéral avec retours à la ligne conservés. L'action « Activer le texte riche » échappe la syntaxe Markdown et préserve les sauts de ligne avant de changer le format ; elle ne devine jamais que l'ancien texte était du Markdown. Un collage de Markdown dans une note riche permet son interprétation explicite.
- Les nouvelles notes restent `plain` jusqu'à activation. Pas de retour automatique en texte brut ni de conversion inverse avec perte en F4b ; l'historique permet de retrouver l'état précédent.
- **Aucune migration de données ni runner supplémentaire.** Extension additive des validateurs, lectures absentes normalisées, écritures compatibles avec l'expansion F3. La première édition d'une V1 utilise toujours la conversion atomique existante. Aucun retrait des lecteurs V1, aucune anticipation de F3c.

Sous-ensemble `markdown-v1` : paragraphes et sauts de ligne visibles, titres de niveaux 1–3, gras, italique, listes ordonnées/non ordonnées, liens, code littéral en ligne/bloc et blocs repliables. Pas de tableaux, images, tâches interactives, HTML, MDX, iframe ou extensions arbitraires. Les syntaxes non prises en charge restent du texte autant que possible ; aucune réécriture du corps lors du rendu.

Blocs repliables : directive `:::details[Résumé]`, corps Markdown, puis `:::` sur sa propre ligne. Résumé textuel obligatoire de 1 à 120 unités UTF-16 ; pas d'attributs ni de replis imbriqués. Directive inconnue, invalide ou non fermée : afficher la source littéralement. Rendu natif `details`/`summary`, fermé initialement ; son ouverture est locale, sans écriture, version ou historique. Export statique : résumé et corps toujours développés.

## Rendu et collage

Rendu recommandé : `react-markdown`, `remark-directive` et `rehype-sanitize`, avec une transformation locale limitée à `details`. [react-markdown](https://github.com/remarkjs/react-markdown/blob/10.1.0/readme.md) produit des éléments React ; sa politique d'URL par défaut est plus large que celle voulue ici. [remark-directive](https://github.com/remarkjs/remark-directive) fournit la syntaxe, pas son comportement. [rehype-sanitize](https://github.com/rehypejs/rehype-sanitize/blob/6.0.0/readme.md) filtre l'arbre après transformation.

- Aucun `dangerouslySetInnerHTML`, `rehype-raw`, HTML monté dans le DOM hôte ou compilation dynamique. HTML brut ignoré dans le rendu riche, conservé dans la source ; texte brut toujours échappé par React.
- Liste fermée de balises : paragraphes, sauts, titres rendus aux niveaux adaptés au widget, listes, emphase, code, liens et `details`/`summary`. Schéma d'assainissement explicite ; aucun attribut utilisateur `style`, `class`, `id`, `on*`, `data-*` ou `open`. Le plugin ne recopie aucun attribut de directive. Aucun plugin après l'assainissement susceptible d'ajouter du HTML libre.
- Liens : URL absolue de schéma `http:`, `https:` ou `mailto:` seulement ; rejeter contrôles, formes relatives, `//`, schémas obfusqués et tout autre protocole. Vérifier la valeur décodée par le parseur, puis de nouveau dans le composant de lien partagé. Lien refusé = libellé textuel. Liens HTTP(S) ouverts dans un nouvel onglet avec `rel="noopener noreferrer"` ; `mailto` sans nouvel onglet. Aucun chargement distant automatique.
- En mode riche, lire le `ClipboardEvent` local : `text/html` converti dans un arbre inerte, jamais attaché au document, puis en Markdown échappé selon la liste autorisée. Conserver titres, `strong`/`b`, `em`/`i`, listes sémantiques, paragraphes, sauts et liens sûrs ; ignorer styles, classes Office, scripts et contenu actif. Ne pas tenter de reconstituer les styles Word `mso-*`.
- HTML absent/non convertible : coller `text/plain` ; les listes Word représentées uniquement par styles restent du texte. Tableaux : texte des cellules dans l'ordre, séparateurs lisibles ; images : texte alternatif si présent, sans téléchargement. Annoncer la simplification. Le collage en texte brut reste accessible par une action explicite ; aucun accès global au presse-papiers. En mode `plain`, collage textuel existant.

Cette livraison satisfait le collage des formats retenus, **pas tout le §11** : conservation des tableaux et images à reprendre dans leurs tranches. Le coordinateur doit accepter cette limite avant construction ; une exigence de collage visuellement fidèle ferait réexaminer le choix d'éditeur.

La CSP reste celle de `src/server.ts` : scripts de production avec nonce/`strict-dynamic`, sans `unsafe-inline` ni `unsafe-eval` ; styles actuellement `self` + `unsafe-inline`. Aucune modification de ces directives, aucune dépendance CDN. Compatibilité à prouver sur le serveur construit, y compris collage sans requête réseau.

## Budgets et cycle de vie

- Bornes F3 inchangées : source ≤ **50 000 unités UTF-16**, enveloppes contenu/snapshot ≤ **200 Kio**, vingt révisions. Le format compte dans l'enveloppe ; une conversion ou insertion trop longue est refusée en entier, brouillon conservé, jamais tronquée silencieusement.
- Rendu : profondeur ≤ 32 et ≤ 5 000 nœuds ; au dépassement, afficher toute la source échappée avec un statut explicatif. Collage HTML ≤ 200 000 unités UTF-16, profondeur ≤ 32 et ≤ 5 000 nœuds ; sinon proposer le texte brut sans perdre la sélection. Parcours bornés, aucun parseur Markdown maison.
- Budget proposé pour les nouveaux modules client atteignables depuis le Screen : **≤ 80 Kio gzip et ≤ 250 Kio minifiés**, dépendances transitives comprises, delta par rapport au build de base. Charger hors des routes publiques ; mesurer sans compter deux fois les chunks partagés. Dépassement : arbitrage, pas changement silencieux de bibliothèque.
- Mesurer une note maximale et un Screen de cent notes sur Chromium CI : pas de boucle de rendu, ni reparsage des notes inchangées ; cible de rendu d'une note maximale ≤ 100 ms après chargement des modules. Rapporter médiane de cinq essais et environnement, sans assertion temporelle fragile.
- Autosauvegarde à 1 500 ms, sauvegarde manuelle, garde de sortie, saisie pendant requête, conflits sans fusion, undo/redo et rétention restent ceux de F3. Repli/aperçu ne salissent jamais le brouillon. Duplication, copie, corbeille, restauration, export de compte et fixtures transportent corps **et** format.
- Un rendu partagé couvre consultation, aperçu et sortie statique. F4b livre ce rendu et ses tests, sans créer le moteur d'export PDF/impression des Screens encore absent. Export de compte : source et format, sans HTML dérivé persistant. Retour arrière : conserver une version de code comprenant le champ optionnel ; l'ancien backend strict ne constitue pas un rollback compatible après des écritures riches.

## Dépendances et arbitrage

`package.json` et `pnpm-lock.yaml` ne déclarent aucun éditeur aujourd'hui ; conserver React 19.3.0 et les correctifs de `docs/upgrades.md`. Context7 MCP est indisponible dans cette session de rédaction ; les sources officielles ci-dessus étayent le choix, sans valider une intégration installée. Le builder devra résoudre puis interroger Context7 sur rendu sûr/directives aux versions retenues ; à défaut, vérifier sources/types et documentation versionnée, et consigner l'écart. Épingler les versions compatibles et le lockfile, sans mise à jour des dépendances existantes.

Arbitrage demandé : accepter l'édition Markdown explicite, l'ajout optionnel sans migration et la limite de collage du §11. Aucun arbitrage ni résultat d'implémentation n'est revendiqué par cet ADR.
