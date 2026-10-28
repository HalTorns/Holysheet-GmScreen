# Démarrer et structurer un nouveau produit

Ce guide s’adresse au développeur et aux agents de code. L’objectif est de transformer la demande en une première fonctionnalité complète, avec un contexte durable et les outils déjà intégrés. Pour créer le dépôt et son environnement isolé, suivre [new-project.md](new-project.md). Pour un produit existant, lire d’abord son brief et ses décisions, puis modifier uniquement le périmètre demandé.

## 1. Comprendre le produit et conserver les décisions

Lire `AGENTS.md`, `README.md`, [architecture.md](../architecture.md), [security.md](../security.md) et [la carte des outils](../agent-patterns.md#choisir-les-outils-du-socle). Examiner `package.json`, le lockfile, `shared/app-config.ts` et le parcours ressources avant de choisir une implémentation.

Compléter [docs/product.md](../product.md) dans le nouveau projet à partir de la demande : problème, utilisateurs, parcours principal, critère de réussite, MVP, hors périmètre et contraintes connues. Identifier les domaines par leur responsabilité métier, avec leurs données, invariants, droits et cycle de vie. Ne pas produire une architecture générique à partir du seul mot « SaaS ».

Réutiliser les informations déjà données. Poser une question ciblée si une inconnue change les droits, les données ou le premier résultat ; avancer sur les travaux indépendants. Pour les choix réversibles, retenir une hypothèse raisonnable et l’écrire. Cette étape ne demande pas une approbation systématique d’un document ou d’un plan.

## 2. Choisir la propriété des données

Formuler la recommandation ci-dessous et consigner sa décision avant de modéliser le premier domaine. Le socle démarre en **mode personnel**, avec `ORGANIZATIONS_ENABLED` absent ou `false` côté Convex. Le détail de cette décision appartient à `docs/decisions/access-model.md` ; le brief y renvoie.

## Décider à partir de la propriété des données

La question centrale : **les données appartiennent-elles à une personne ou à une équipe, même lorsque leur créateur quitte cette équipe ?**

| Besoin du produit | Recommandation | Motif |
| --- | --- | --- |
| Chaque utilisateur gère ses propres notes, tâches, factures ou fichiers | Personnel | Le propriétaire stable du compte suffit pour autoriser les accès. |
| SaaS avec abonnement individuel, sans données d’équipe | Personnel | La facturation ne nécessite pas à elle seule des organisations. |
| Entreprises ou équipes avec données communes, invitations et rôles par espace | Organisations | La propriété et les permissions appartiennent à un espace partagé. |
| Une personne peut participer à plusieurs équipes avec des droits différents | Organisations | Le rôle est propre à chaque organisation. |
| Données personnelles et espaces collaboratifs | Organisations avec les deux scopes | L’espace personnel coexiste avec les données communes. |
| Contenu public, échanges entre utilisateurs ou partage ponctuel d’un document | Étudier les droits du domaine | Plusieurs utilisateurs ne suffisent pas à justifier un espace d’équipe ; un partage ciblé peut demander une autre règle métier. |

Exemples : un outil de facturation pour indépendants démarre en personnel ; un outil de suivi de projets d’entreprise utilise les organisations ; un assistant personnel payant reste personnel tant qu’il ne propose pas d’espace d’équipe.

Lorsque le besoin est suffisamment défini, recommander le mode et poursuivre dans le périmètre demandé. Si la propriété collective est une information manquante qui change le modèle, poser une question ciblée et avancer sur les travaux indépendants. Une recommandation ne crée pas une étape systématique d’approbation. En l’absence de besoin partagé établi, conserver le mode personnel et noter l’hypothèse.

## Donner une recommandation exploitable

Utiliser cette forme dans la conversation de démarrage :

> Je recommande le mode [personnel / organisations], car [besoin concret]. Les données [domaines] appartiendront à [un utilisateur / un espace partagé] ; [domaines éventuels] resteront personnels. Les droits nécessaires sont [droits]. L’abonnement sera rattaché à [compte / organisation / décision ultérieure].

Avant de modéliser le premier domaine, consigner le choix dans `docs/decisions/access-model.md` du **nouveau projet**, en reprenant cette trame :

```md
# Modèle d’accès

- Contexte et recommandation :
- Mode retenu et raison : personnel / organisations
- Propriétaire de chaque domaine : compte / organisation / autre règle explicite
- Rôles et opérations autorisées :
- Export, départ d’un membre et suppression :
- Scope de facturation et quotas, si nécessaires :
- Activation par environnement :
- Hypothèses à reconsidérer et migration éventuelle :
- Preuves : cas autorisé, refus entre comptes/équipes, révocation
```

Ne pas créer une couche de permissions générique ou installer un module de paiement avant le premier parcours qui en a besoin. Les rôles du socle (`owner`, `admin`, `member`, `viewer`) concernent uniquement une organisation. Un administrateur de plateforme demande une autorisation distincte ; être propriétaire d’une équipe ne donne aucun droit global.

## Appliquer et faire évoluer le choix

Pour le personnel, conserver les données liées à l’ID stable du compte, avec index par propriétaire, export et nettoyage de compte. Pour les organisations, suivre [le guide du module](../organizations.md) : activation backend sur l’environnement choisi, index de tenant et contrôle de membership/permission pour chaque accès. Les permissions effectives restent dans Convex.

Pour une application existante, examiner sa décision, sa configuration et ses données avant de proposer un changement. Préserver son mode jusqu’à ce que la modification fasse partie du travail demandé. Activer le module ne transfère aucune donnée personnelle ; le désactiver ne supprime pas les données d’équipe et ne libère pas le dernier propriétaire. Un transfert de propriété demande une migration bornée, sauvegardée et vérifiée, ainsi qu’un choix explicite des droits et du devenir des données.

Les tests E2E ordinaires suivent les capacités réelles du backend. `pnpm test:e2e:organizations` force temporairement le mode partagé sur le backend local appartenant au checkout et restaure sa valeur précédente. Vérifier les deux modes lorsque le socle transversal évolue.

## 3. Choisir les outils et les modules nécessaires

Pour chaque besoin du MVP, choisir d’abord l’outil et l’exemple de [agent-patterns.md](../agent-patterns.md#choisir-les-outils-du-socle). Conserver Start pour les routes/SSR, Convex pour le métier et les droits, Query pour les données serveur, Form/Zod pour les formulaires et les composants shadcn sur Base UI pour l’interface. PostgreSQL est le moteur interne de Convex ; ne pas créer d’accès métier SQL parallèle.

Lire [modules.md](../modules.md), puis noter dans le brief les modules retenus, leur raison et ceux différés. Organisations, paiements, IA, stockage externe et observabilité répondent à des besoins explicites. Une dépendance présente peut rester désactivée ; ne pas supprimer son schéma d’auth ou ses données sans migration. Les origines, secrets et flags privés sont configurés par environnement, hors du brief et de `appConfig`.

Les versions installées et [leurs correctifs](../upgrades.md) guident les recherches Context7. Une recommandation trouvée dans les dernières docs ne déclenche pas une migration de stack.

## 4. Définir puis livrer une première fonctionnalité complète

Choisir le plus petit parcours qui donne un résultat utile à l’utilisateur. Écrire dans le brief un scénario accepté et un refus/échec significatif avec leurs résultats observables. Par exemple, pour un produit de suivi individuel : créer puis retrouver une tâche après reload, avec refus de lecture depuis un autre compte.

Décrire les tables/indexes, queries/mutations, interface, route et conséquences sur export/suppression/restauration. Utiliser l’organisation de [architecture.md](../architecture.md) : `convex/<domaine>.ts`, règles spécifiques dans `convex/lib/`, contraintes partagées dans `shared/`, interface dans `src/features/<domaine>/`, routes fines dans `src/routes/`. Ajouter des sous-dossiers ou abstractions lorsque le domaine les justifie.

Suivre [adopting.md](../adopting.md#ajouter-une-fonctionnalité-complète) pour l’implémentation et le retrait progressif de la démonstration. Garder les preuves transverses d’authentification, d’isolation et de cycle de vie. Choisir les contrôles dans [la matrice de validation](../agent-patterns.md#choisir-les-vérifications), puis rapporter les résultats réellement exécutés et les limites.

## 5. Permettre la reprise du projet

Après chaque fonctionnalité, mettre à jour le brief : état réellement livré, prochaine étape et hypothèses encore ouvertes. Consigner une décision séparée seulement lorsqu’un choix change une frontière durable. Les changements de rôle/données demandent d’actualiser la décision d’accès ; les règles techniques restent dans leurs guides et dans le code.

Un agent qui reprend le produit doit pouvoir retrouver son objectif, son périmètre, ses propriétaires de données, ses outils et sa prochaine fonctionnalité sans relire une conversation ni les anciens rapports de revue du template.
