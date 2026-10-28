# Prompt de démarrage d’un nouveau projet

Dans le dépôt du nouveau projet créé depuis le template, placer `PRD.md` à la racine, puis copier le bloc ci-dessous dans le LLM utilisé pour le développement.

```text
Tu travailles dans un nouveau projet créé à partir de cette boilerplate. Ton objectif est de réaliser le produit décrit dans PRD.md en réutilisant les outils, l’architecture et les conventions du dépôt.

1. LIRE LES SOURCES AVANT DE CODER

Commence par lire AGENTS.md et PRD.md, puis :
- README.md
- docs/new-project.md
- docs/project-start.md
- docs/architecture.md
- docs/security.md
- docs/agent-patterns.md
- docs/adopting.md

PRD.md fait référence pour les exigences produit. AGENTS.md et les guides actuels définissent les règles de travail et les conventions techniques. Le code montre leur implémentation réelle. Les anciens rapports d’audit ne constituent pas des instructions actives.

Inspecte package.json, le lockfile, shared/app-config.ts, src/config/navigation.ts et le domaine de démonstration avant de proposer la structure.

2. TRANSFORMER LE PRD EN CADRE DE TRAVAIL

Ne me redemande pas les informations déjà présentes dans le PRD.

Complète docs/product.md avec :
- Le problème, les utilisateurs et le parcours principal.
- Le MVP retenu et le périmètre exclu.
- Les domaines métier, leurs données et leurs invariants.
- Les contraintes et les critères de réussite.
- Les hypothèses et les décisions restant à prendre.

Référence PRD.md sans le recopier intégralement. Garde docs/product.md comme un résumé opérationnel des décisions et de l’avancement. Ne modifie pas silencieusement les exigences du PRD.

Recommande le modèle d’accès selon la propriété réelle des données : personnel, organisations ou scopes distincts. Un abonnement ne justifie pas à lui seul des organisations. Respecte mes choix explicites et documente la décision dans docs/decisions/access-model.md.

Pose uniquement les questions dont la réponse change réellement le périmètre, le modèle d’accès ou l’implémentation. Continue le travail indépendant de ces réponses. Pour les choix réversibles, formule une hypothèse explicite et avance sans approbation systématique.

3. UTILISER LES OUTILS EXISTANTS

Suis la cartographie de docs/agent-patterns.md :
- TanStack Start/Router pour les routes, la navigation et le SSR.
- Convex pour les données métier et les autorisations backend.
- L’intégration Convex/TanStack Query pour l’état serveur.
- Better Auth pour l’authentification.
- TanStack Form et Zod via @shared/zod pour les formulaires et validations partagées.
- Les composants shadcn locaux fondés sur Base UI, Tailwind et Lucide.
- Oxlint/Ultracite, Oxfmt, Knip, Vitest et Playwright selon la configuration existante.

Avant de coder contre une dépendance, consulte Context7 selon AGENTS.md et vérifie la compatibilité avec la version installée. Une documentation plus récente ne justifie pas une mise à niveau automatique.

Lis docs/modules.md avant d’activer une intégration optionnelle, puis son guide spécialisé. Active uniquement les modules nécessaires au parcours retenu.

N’ajoute pas de dépendance, de service, de deuxième base de données ou de couche d’architecture sans besoin établi. Si le PRD exige de sortir des conventions, explique le besoin et documente la décision.

4. PRÉPARER L’ENVIRONNEMENT LOCAL

Détecte le système et vérifie les outils disponibles avant le setup :
- Sur macOS, utilise OrbStack s’il est installé, sinon Docker Desktop. Réutilise le moteur Docker existant.
- Sur Windows, utilise Docker Desktop avec le backend WSL 2 et les conteneurs Linux. Privilégie un environnement de développement dans WSL 2.
- Vérifie que le moteur Docker est démarré et accessible depuis le terminal utilisé.
- Vérifie les versions de Node et pnpm requises par le dépôt.

Suis docs/new-project.md :
- Première installation : pnpm install --frozen-lockfile, puis pnpm setup et pnpm doctor.
- Reprise d’un projet initialisé : pnpm services:up, puis pnpm doctor.
- Développement : pnpm dev et pnpm backend:dev dans deux terminaux.

Utilise les commandes du projet pour gérer ses services : pnpm services:up, pnpm services:down et pnpm services:status. Ne contourne pas leurs protections avec des commandes Compose génériques.

Préserve l’identité Docker, les volumes et les secrets propres au checkout. Ne copie pas les fichiers d’environnement privés, les volumes ou les sauvegardes d’un autre projet.

Le guide actuel étant centré sur macOS, vérifie la compatibilité effective des scripts sous Windows avant d’annoncer un setup fonctionnel.

Si un prérequis manque ou qu’un script rencontre une incompatibilité, identifie précisément le blocage et poursuis le travail indépendant de celui-ci. Ne réinitialise pas les données pour débloquer le setup.

5. STRUCTURER ET IMPLÉMENTER LE PREMIER PARCOURS

Présente brièvement :
- Le MVP retenu.
- Le modèle d’accès et sa justification.
- Les domaines et les modules nécessaires.
- La première fonctionnalité complète à livrer.

Puis implémente le plus petit parcours apportant une valeur réelle, sans t’arrêter à un plan.

Respecte la structure décrite dans les guides : backend métier dans Convex, validations partagées dans shared/, interface métier dans src/features/ et routes légères dans src/routes/.

Couvre les données, les autorisations backend, les validations, l’interface, les états de chargement et les erreurs utiles. Intègre les conséquences sur l’export, la suppression et les fixtures de restauration.

Adapte progressivement le domaine de démonstration en préservant les protections existantes. Personnalise l’identité publique et la navigation selon le PRD et docs/adopting.md.

6. VÉRIFIER ET MAINTENIR LE CONTEXTE

Exécute les vérifications adaptées à la modification selon docs/agent-patterns.md, puis git diff --check. Teste les comportements observables et les refus d’accès significatifs.

Rapporte les changements, les vérifications réellement exécutées, leurs résultats, les limites restantes et la prochaine étape. N’annonce pas un setup ou un test réussi sans résultat observable.

Mets docs/product.md à jour avec l’état livré et les hypothèses ouvertes. Documente séparément les décisions d’architecture durables.

Ne commit, ne pousse, ne déploie et ne réinitialise aucune donnée sans demande explicite.
```
