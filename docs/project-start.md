# Choisir le modèle d’accès au démarrage

Ce guide s’adresse au développeur et aux agents de code (Codex, Claude, Cursor ou autres). Avant le premier domaine d’un nouveau produit, formuler une recommandation courte à partir du besoin réel. Le socle démarre en **mode personnel**, avec `ORGANIZATIONS_ENABLED` absent ou `false` côté Convex.

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

Pour le personnel, conserver les données liées à l’ID stable du compte, avec index par propriétaire, export et nettoyage de compte. Pour les organisations, suivre [le guide du module](organizations.md) : activation backend sur l’environnement choisi, index de tenant et contrôle de membership/permission pour chaque accès. Les permissions effectives restent dans Convex.

Pour une application existante, examiner sa décision, sa configuration et ses données avant de proposer un changement. Préserver son mode jusqu’à ce que la modification fasse partie du travail demandé. Activer le module ne transfère aucune donnée personnelle ; le désactiver ne supprime pas les données d’équipe et ne libère pas le dernier propriétaire. Un transfert de propriété demande une migration bornée, sauvegardée et vérifiée, ainsi qu’un choix explicite des droits et du devenir des données.

Les tests E2E ordinaires suivent les capacités réelles du backend. `pnpm test:e2e:organizations` force temporairement le mode partagé sur le backend local appartenant au checkout et restaure sa valeur précédente. Vérifier les deux modes lorsque le socle transversal évolue.
