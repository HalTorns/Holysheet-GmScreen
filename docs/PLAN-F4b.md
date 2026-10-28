# Plan — Chantier 2, tranche F4b : texte riche des notes

Références : [PRD §6, §9.1, §10–11](../PRD.md) · [F3 et arbitrage F3c](PLAN-F3.md) · [F4a](PLAN-F4.md) · [ADR texte riche](decisions/rich-text.md) · [widgets](decisions/widgets.md) · [migrations](decisions/migrations.md).

Proposition du 28 octobre 2026 pour revue/arbitrage Claude Code, depuis `main 51ea3ef`, branche `codex/f4b-rich-text`. Un seul work order de construction après arbitrage ; aucune autorisation de déploiement.

## Périmètre

Enrichir uniquement les widgets `note` : titres, listes, gras/italique, liens sûrs, code littéral et blocs repliables, édition dans le Screen et les pop-ups. Recommandation : textarea Markdown avec barre d'outils, aperçu et collage riche borné ; contrat détaillé dans l'ADR.

Hors périmètre : corps des fiches F4a, nouveau kind, widgets de code du §10, éditeur WYSIWYG, tableaux/images riches, moteur PDF, publication/import de projet, refonte de `useEditorDraft` et contraction F3c. Le verrouillage de disposition autorise toujours l'édition du contenu ; la lecture seule ne permet aucune écriture.

## Modèle et API

- Ajouter `bodyFormat?: 'plain' | 'markdown-v1'` à `gmWidgetContents` et aux snapshots de note V1/V2 acceptés. Absence = texte brut ; `config: {}` et `state: {}` restent identiques. Pas de table, index, migration, changement de `formatVersion` ni nouvelle version de contenu.
- Étendre `gmFormats` pour lire une valeur normalisée `{ body, bodyFormat }` sans perdre le format dans `convertNote`, `writeContent` ou `normalizeSnapshot`. Les V1 donnent `plain` ; conserver les adaptateurs et le runner F3 existants.
- `gmWidgets.getNoteContent` retourne `{ body, bodyFormat, version }`, format normalisé obligatoire. `gm.updateNote` et la branche note de `gmWidgets.updateWidget` acceptent `bodyFormat?` ; omission **préserve le format courant** pour les anciens appelants. Champ explicitement invalide refusé, autre kind refusé. Les nouveaux clients envoient toujours corps et format.
- `saveNote` compare le couple normalisé : aucun changement = aucune version ; changement du format seul = snapshot du couple précédent et incrément unique. Corps/format écrits atomiquement avec `expectedVersion`, session/droits, limites et erreurs existantes. Aucun parsing/HTML dérivé stocké côté Convex.
- Adapter schémas partagés via `@shared/zod`, validateurs Convex de données/arguments/retours, historique/restauration, création, duplication et copie de widgets/Screens. Ne jamais restaurer une révision riche comme du texte brut ou conserver le format courant d'une ancienne révision.
- Export de compte, `gmDocument`, nettoyage et fixtures de restauration : même collection, nouveau champ optionnel accepté et conservé. Aucun changement des quotas, permissions ou routes publiques. Mettre à jour l'inventaire d'audit pour les signatures touchées.
- Déploiement compatible : backend additif avant frontend ; recharger les anciennes vues avant usage riche. Le paramètre omis évite d'effacer le format mais un ancien client ne fournit pas le rendu riche. Aucun lancement de migration F3 ni commande distante dans ce work order.

## Interface et rendu

1. **Texte brut existant** : textarea et comportement actuels ; « Activer le texte riche » prépare un brouillon échappé qui conserve l'affichage littéral. Pas d'enregistrement au montage. Si l'échappement dépasse les bornes, refuser l'activation et conserver le contenu intact.
2. **Édition riche** : textarea nommée « Contenu de la note », aide de syntaxe courte, actions sur la sélection, puis retour du focus et du curseur. Aperçu du brouillon dans une région nommée, sans sauvegarde implicite. Sélecteur Éditer/Aperçu accessible dans le widget ; consultation seule = rendu statique, sans toolbar. Les raccourcis et clics internes ne déclenchent ni déplacement, suppression ni copie du widget.

| Action de barre d'outils | Insertion / raccourci local à l'éditeur |
| --- | --- |
| Gras, italique | `**texte**`, `*texte*` ; Ctrl/Cmd+B, Ctrl/Cmd+I |
| Lien | Dialogue libellé + URL validée ; Ctrl/Cmd+K, Échap ferme et restitue le focus |
| Titre | Choix niveau 1–3, préfixe de ligne ; accès clavier par bouton et menu |
| Liste à puces, numérotée | Préfixes des lignes sélectionnées ; accès clavier par boutons |
| Code littéral | En ligne ou bloc selon sélection ; accès clavier par bouton |
| Bloc repliable | Résumé obligatoire + sélection encadrée par `:::details` ; accès clavier par dialogue |
| Aperçu, collage en texte brut | Boutons nommés accessibles au clavier, sans raccourci global ajouté |

Pas de raccourci dédié imposé pour chaque bouton : Tab puis Entrée/Espace suffisent. Préserver Ctrl/Cmd+Z natif dans la textarea, les boutons Annuler/Refaire du brouillon et les raccourcis de composition IME. Étiquettes visibles ou nom accessible, aide des raccourcis et `aria-keyshortcuts` pour les trois raccourcis interceptés ; focus visible. Une barre annoncée `toolbar` doit implémenter la navigation par flèches, sinon employer un groupe de boutons nommé.

3. **Collage Word/Docs** : conversion inerte et bornée HTML → sous-ensemble Markdown de l'ADR, sans styles ni ressources ; texte brut en repli explicite. Préserver la sélection, refuser l'insertion entière au-delà de 50 000 unités et annoncer simplifications/erreurs. Ne pas intercepter le collage d'un widget lorsque le focus est hors de l'éditeur.
4. **Brouillon** : passer une valeur stable `{ body, bodyFormat }` à `useEditorDraft` ; aucune seconde copie locale du contenu. Toolbar, collage et activation appellent son `edit`. Sauvegarde, conflit, historique et `onDirtyChange` utilisent le couple complet. L'aperçu est dérivé ; il ne remplace pas le brouillon pendant une mise à jour distante.
5. **Rendu commun** : composants/parser et politique URL uniques pour aperçu, lecture seule et sortie statique. `details` natif accessible ; sortie statique développée, sans contrôles d'édition ni contenu caché. Livrer une variante statique testable, sans simuler un moteur d'impression existant. Les corps des fiches restent en texte brut.

## Construction et budgets

Installer uniquement les dépendances de rendu proposées dans l'ADR après vérification de leurs versions/pairs et documentation selon `AGENTS.md` ; `package.json`, lockfile et correctifs relus avant intégration. Pas de bibliothèque d'éditeur supplémentaire, de `rehype-raw` ou de convertisseur généraliste sans nouvel arbitrage. Séparer conversion du collage, politique URL et rendu ; pas de parseur Markdown réinventé.

Conserver les bornes serveur F3 (50 000 unités UTF-16, 200 Kio contenu/snapshot, vingt révisions). Appliquer les limites AST/collage et le repli intégral de l'ADR. Mesurer le delta bundle (≤ 80 Kio gzip / 250 Kio minifiés), une note maximale et cent notes, sur le build de production ; ne pas reparcourir les cent contenus pour chaque frappe. Pas de modification de CSP : vérifier aussi le chemin collage, pas seulement la page initiale.

## Critères d'acceptation et tests

Chaque ajout cible une régression du nouveau format ; conserver les tests actuels propriétaires des droits, de F3 et du hook de brouillon.

1. **Unitaires, parser et politique d'assainissement** : sous-ensemble autorisé, sauts de ligne, échappement d'activation, plain avec `#`, `**` et balises inchangé ; directives valides/invalides, inconnues, attributs, imbrication et limites ; source entière en repli. Passer par le vrai pipeline de rendu vers HTML statique, pas seulement tester une regex. Cas XSS : `<script>`, handlers, SVG/MathML, iframe, images, CSS, `javascript:`, `data:`, `vbscript:`, contrôles/entités, protocole relatif, échappements Markdown et directives malveillantes. Seuls HTTP/HTTPS/mailto restent cliquables, attributs et `rel` conformes ; aucun HTML actif. Tester aussi la variante statique : tous les résumés et corps visibles, sans contrôle d’édition ni contenu replié. Les tests actuels de texte brut ne couvrent pas cette interprétation.
2. **Backend, points d'entrée publics réels** : V1/V2 sans format lisibles à l'identique ; changement de format seul historisé ; omission préserve le format ; validation, 50 000/50 001 unités, multioctets et enveloppe de 200 Kio ; refus autre compte/kind et version obsolète sur les deux voies d'écriture. Restaurer une révision ancienne puis riche, dupliquer/coller, corbeille, exporter et purger : couple conservé, zéro payload orphelin. Compléter fixtures et vérification de restauration existantes avec une note riche et une révision brute, sans conversion rétroactive. Conserver la preuve F3 du runner idempotent sur V1 réelles.
3. **Navigateur, vrais composants** : toolbar/sélection/focus, raccourcis limités au champ, IME, activation et insertion trop longue ; aperçu sans dirty, sauvegarde du couple, historique et conflit sans perte. Collage via `ClipboardEvent` avec fixtures synthétiques Word/Docs, HTML hostile, listes sémantiques, styles seuls, tableaux/images simplifiés et limites. Observer le DOM et l'absence de requêtes, pas seulement la chaîne convertie. Les tests génériques de `useEditorDraft` ne couvrent ni le collage ni cette intégration.
4. **E2E sur serveur construit, CI** : ajouter `tests/e2e/rich-text.spec.ts` à la commande du job `application` existant. Identité synthétique via helpers ; activer une note brute contenant du Markdown littéral, enrichir via boutons/collage, sauvegarder/recharger, consulter en lecture seule, ouvrir un repli au clavier, puis synchronisation/conflit entre deux vues et restauration d'une révision brute. Vérifier refus XSS/liens et aucune violation CSP imputable au rendu/collage. Un événement de presse-papiers synthétique prouve le chemin applicatif, pas l'intégration native de Word sur tous les OS : inspection manuelle Word/Docs à rapporter séparément. Les E2E Holysheet et budgets restent exécutés ; traces/vidéos/captures auth restent désactivées.
5. **Livraison** : commandes ci-dessous réussies, delta bundle/mesures rapportés, CI observable et inspection neuve par Claude avant approbation. Aucun contenu riche écrasé par une vieille révision, aucune migration destructive, aucun nouveau script/style autorisé par CSP.

## Commandes de preuve

Sur services locaux appartenant au checkout, Chromium installé ; `backend:push` ne reçoit aucun argument :

```sh
pnpm backend:push
pnpm check
pnpm audit:convex
pnpm audit --prod
pnpm test:e2e:local -- tests/e2e/holysheet.spec.ts tests/e2e/widget-budgets.spec.ts tests/e2e/rich-text.spec.ts
git diff --check
```

`pnpm check` comprend tests unitaires/backend, navigateur et build. L'audit Convex doit terminer à 0 avec inventaire cohérent. Rapporter les avis/code de `pnpm audit --prod` ; conserver les seules exceptions existantes de `docs/upgrades.md`, sans élargissement. La CI garde aussi `pnpm audit --prod --audit-level=high` et exécute le nouveau spec sur le serveur construit. Les mesures bundle/temps accompagnent les sorties, sans annoncer une CI ou un essai Word/Docs non exécuté.

## Risques et arbitrages

| Risque | Réponse / condition |
| --- | --- |
| Syntaxe visible moins directe qu'un WYSIWYG | Toolbar et aperçu dans le widget ; choix à accepter par Claude avant construction |
| Collage Word/Docs imparfait, §11 plus large | Préserver le sous-ensemble, repli textuel explicite ; tableaux/images reportés avec accord du coordinateur |
| Perte du format dans un chemin secondaire | Couple atomique dans snapshot, restauration, copie et export ; tests d'entrée réels |
| XSS ou attribut introduit par une directive | Aucune copie d'attributs, assainissement final fermé, double contrôle URL et tests hostiles sous CSP |
| Coût bundle/parser ou conversion surdimensionnée | Mesures et limites ADR ; dépassement soumis à arbitrage, sans troncature ni régression des notes brutes |
| Confusion avec F3c ou retour à un backend ancien | Extension additive seulement ; lecteurs V1 maintenus ; rollback sur code comprenant le champ |

Écarts proposés par rapport à l'attente implicite de « texte riche » : édition en syntaxe Markdown et collage limité au sous-ensemble. Aucune décision finale n'est attribuée au coordinateur. Le builder livre code, preuves et limites en un work order ; aucun commit, push ou déploiement sans demande applicable.

## Arbitrage du coordinateur (Claude Code, 28 octobre 2026)

- **Accepté** : édition Markdown explicite (zone de texte, barre d'outils, aperçu), avec un `bodyFormat` optionnel et **sans migration de données**. Les anciennes notes restent en texte littéral tant que « Activer le texte riche » n'est pas déclenché.
- **Accepté** : les limites de collage du §11. Tableaux et images seront repris dans leurs tranches, et un collage visuellement fidèle relèvera du chantier 3, qui pourra réévaluer un éditeur WYSIWYG.
- **Accepté** : `react-markdown`, `remark-directive` et `rehype-sanitize`, sous le budget de bundle et la politique de liens stricte (`http:`, `https:`, `mailto:`) de l'ADR. Aucun `rehype-raw` ni `dangerouslySetInnerHTML`.
- Rôles : Codex a rédigé ce plan et Claude l'arbitre. Codex construit dans une session neuve, Claude inspecte.
