# Brief produit

Statut : trame à renseigner dans le **nouveau projet** selon [le parcours de démarrage](project-start.md). Ce fichier ne décrit pas un produit déjà décidé pour le template. Remplacer les indications par les décisions du produit, sans inventer de besoins.

## Problème et utilisateurs

- Problème concret et résultat attendu : à définir.
- Utilisateur principal et contexte d’usage : à définir.
- Parcours principal, du déclencheur au résultat : à définir.
- Critère observable de réussite : à définir.

## MVP

- Fonctionnalités nécessaires au premier résultat : à définir.
- Hors périmètre et améliorations différées : à définir.
- Contraintes réelles : appareils, langues, volume, délai, budget et données sensibles, si connus.

## Domaines et données

| Domaine | Données et invariants | Propriétaire | Droits et refus | Export, conservation et suppression |
| --- | --- | --- | --- | --- |
| À définir | À définir | Compte / organisation / autre règle motivée | À définir | À définir |

Décision d’accès : consigner le choix dans `docs/decisions/access-model.md` selon la trame de [project-start.md](project-start.md#donner-une-recommandation-exploitable). Une table dans ce brief ne remplace pas les contrôles Convex.

## Outils et modules retenus

Utiliser [la carte des outils](agent-patterns.md#choisir-les-outils-du-socle). Les versions viennent de `package.json` et du lockfile.

| Besoin établi | Outil ou module | Motif, configuration et limites |
| --- | --- | --- |
| À définir | Outil déjà présent en priorité | À définir |

Conserver la liste des modules différés avec leur raison. Les secrets restent hors de ce document. Une nouvelle dépendance ou frontière d’architecture demande un besoin établi et une décision courte dans `docs/decisions/`.

## Première fonctionnalité complète

- Acteur, déclencheur et résultat visible : à définir.
- Scénario accepté : à définir.
- Refus ou erreur significatif : à définir.
- Données, droits, interface et cycle de vie concernés : à définir.
- Preuves attendues et commandes choisies dans [la matrice de validation](agent-patterns.md#choisir-les-vérifications) : à définir.

## Hypothèses et état courant

- Hypothèses prises pour avancer et événements qui les invalideraient : à définir.
- Questions ouvertes qui changent la solution : à définir.
- Fonctionnalités réellement livrées et prochaine étape : à actualiser après chaque tranche.

Conserver les décisions utiles à la reprise du projet ; supprimer les indications devenues inutiles. Ce brief n’est ni un journal de conversation, ni une copie des guides techniques.
