# Revue du module organisations — 13 octobre 2026

> **Historique, non prescriptif.** Ce rapport conserve les constats et preuves de la revue du 13 octobre 2026. Les consignes actuelles sont dans [AGENTS.md](../../AGENTS.md), [organisations](../organizations.md) et [le démarrage produit](project-start.md). Ses résultats ne certifient pas une modification ultérieure.

## Périmètre et méthode

Revue de l’API Convex publique, du composant Better Auth Local Install, des indexes, des quatre rôles, des scopes personnel/partagé, des invitations, des exports, de la suppression de compte/organisation, des interfaces, des tests et du lanceur local. Le besoin de référence est celui du starter : organisations optionnelles, personnel par défaut, isolation et permissions dans les deux modes, puis recommandation du modèle adapté au démarrage d’un nouveau projet.

Trois revues indépendantes ont croisé les standards du dépôt, les exigences du produit et les domaines backend/sécurité. Les correctifs ont ensuite été relus sur les axes standards et sécurité. Les tests backend portent les autorisations métier ; les E2E portent les cookies, JWT, HTTP, SSR et parcours réels. Les reviewers ont fait une revue statique ; les résultats d’exécution ci-dessous proviennent de la validation locale principale.

## Standards du dépôt

| Priorité avant correction | Problème confirmé | Correction |
| --- | --- | --- |
| Bloquant | Le lanceur organisations vérifiait les sélecteurs cloud mais pouvait utiliser les fichiers locaux copiés d’un autre checkout pour modifier son backend. Cela contrevenait au contrôle de propriété Docker demandé par `AGENTS.md`. | Identité Docker établie obligatoire, vérification du dossier propriétaire et des ports avant tout appel Convex. Test au vrai processus dans un checkout jetable. |
| Bloquant | `pnpm test:e2e` sélectionnait le scénario personnel via une variable de test, même lorsque le backend du projet était correctement activé en organisations. La commande documentée échouait alors sur ce mode supporté. | Sélection d’après `capabilities.get`, autorité backend. Le lanceur d’activation temporaire exige toujours que l’activation ait effectivement réussi et restaure la valeur précédente. |

Fichiers : `scripts/test-organizations.mjs`, `tests/scripts/setup.test.ts`, `tests/e2e/organizations.spec.ts`.

## Exigences du starter

L’exigence « faire en sorte que Codex (ou autre) puisse proposer […] d’utiliser les organisations ou pas quand on va débuter un projet » n’était pas couverte par une consigne au démarrage : le guide intervenait seulement avant un domaine déjà décidé comme partagé.

Le [guide de démarrage](project-start.md) définit maintenant une recommandation selon la propriété individuelle ou collective des données, avec cas SaaS individuel, équipes et besoins mixtes. `AGENTS.md` demande cette recommandation avant le premier domaine ; `CLAUDE.md` renvoie à la source commune. Le choix, les droits, exports, suppressions et preuves sont consignés dans le nouveau projet. Le mode personnel reste le défaut. Les choix explicites de l’utilisateur et la configuration d’un projet existant sont préservés ; aucune étape systématique d’approbation n’est ajoutée.

## Backend et sécurité

| Priorité avant correction | Scénario reproductible | Correction |
| --- | --- | --- |
| Critique | Un membre déjà présent pouvait recevoir une invitation d’administrateur, être rétrogradé, quitter l’organisation puis accepter cette invitation pour récupérer les droits retirés. Une ancienne invitation permettait aussi de revenir après un retrait explicite. | Refus `ALREADY_MEMBER` à l’émission. Révocation transactionnelle des anciennes invitations reçues lors d’un changement de rôle, départ, retrait ou fermeture du compte. Les lignes présentes dans un ancien déploiement sont prises en compte. |
| Critique | Les invitations émises par un gestionnaire devenu lecteur restaient en attente. Leur acceptation était temporairement refusée, mais elles redevenaient utilisables si l’émetteur récupérait ses droits. | Suppression atomique des invitations correspondant à une délégation perdue. Propriétaire → administrateur supprime les invitations d’administrateur, conserve celles de membre/lecteur et ne touche pas les autres organisations. Un retour au rôle précédent exige une nouvelle invitation. |
| Critique | Des lectures anonymes du JWKS public consommaient le budget partagé et produisaient HTTP 429. Convex ne pouvait ensuite plus vérifier des JWT valides, ce qui bloquait les utilisateurs dans les deux modes. | Exception exacte pour `/convex/jwks`, qui ne sert que les clés publiques. Les limites des sessions, tokens, OTP et passkeys restent actives. Aucun endpoint de clé privée n’est exempté. Le test HTTP vérifie la disponibilité après 125 lectures et l’absence de paramètres privés. |

Fichiers : `convex/betterAuth/organizationAccess.ts`, `convex/betterAuth/organizations.ts`, les indexes applicatifs dans `convex/betterAuth/schema.ts`, `convex/authOptions.ts`, `src/features/auth/errors.ts` et tests backend/HTTP. Le schéma d’auth généré n’a pas été modifié à la main.

Le parcours navigateur a également reproduit une perte de brouillon pendant la confirmation d’un nouveau token : le layout remplaçait temporairement son `Outlet` par un état de chargement ou d’expiration lorsque la query utilisateur retournait brièvement `null`. `src/routes/_authenticated.tsx` garde désormais la page montée pendant cette confirmation et la lie à l’ID validé par le loader. Une session confirmée invalide ou un utilisateur absent après confirmation ferme l’interface ; les appels backend restent contrôlés. Si le compte courant change, l’ancien espace est masqué puis un nouveau document recrée les caches. Le parcours E2E original a échoué avant correction puis réussi après. Le nouveau test de changement de compte vérifie également que le second compte reste utilisable : ce contrôle positif échouait sans le rechargement, même lorsque le brouillon avait disparu dans un état d’erreur. Les diagnostics temporaires ne contenaient que des statuts HTTP et booléens de cycle de vie, puis ont été retirés.

Les contrôles revus et conservés :

- Session active et email vérifié avant l’accès privé ; membership et rôle courants, sans rôle de session faisant autorité.
- Ressources personnelles filtrées par propriétaire et scope absent ; ressources communes filtrées par organisation autorisée. L’auteur d’une ressource commune ne contourne pas une rétrogradation.
- Rôle de propriétaire/administrateur limité à son organisation ; aucune autorité globale. Les administrateurs ne peuvent pas attribuer ou modifier les rôles propriétaire/administrateur.
- Routes natives Better Auth Organization fermées dans les deux modes ; opérations applicatives atomiques dans le composant.
- Dernier propriétaire protégé sous concurrence, à la sortie et à la suppression du compte, même lorsque le module est désactivé.
- Export personnel sans ressources communes ; export d’organisation réservé aux gestionnaires ; emails des autres membres masqués aux membres/lecteurs.
- Suppression du compte conservant les ressources communes et anonymisant leur auteur ; suppression d’organisation fermant immédiatement les accès et poursuivant un nettoyage borné.

## Preuves et limites

Quatre régressions backend (invitation à un membre existant, réadhésion après rétrogradation/retrait, retour de délégation) et une régression du lanceur copié ont échoué avant correction puis réussi après. Le test HTTP JWKS a également reçu 429 avant réparation puis réussi après. Les ajouts ne créent aucun endpoint, export ni flag de production destiné uniquement aux tests.

La matrice backend supplémentaire utilise deux organisations et des comptes ayant des rôles différents : refus entre tenants aux lectures, écritures, gestion et exports, auteur rétrogradé malgré sa propriété ailleurs, séparation des données personnelles et confidentialité des emails. Le mode désactivé refuse chaque opération publique du module et les accès partagés sans perdre les données ni supprimer la protection du dernier propriétaire.

Les [résultats de vérification](verification.md) consignent les commandes effectivement exécutées, les E2E des deux modes et la restauration. La seconde revue ne relève plus de problème actionnable dans les correctifs. Verdict sur ce périmètre : **approuvé après correction**.

La revue ne certifie pas une infrastructure de production ou des domaines futurs. Chaque nouveau domaine partagé doit ajouter ses indexes de tenant, contrôles d’accès, export/nettoyage et preuves de refus. Les rôles de plateforme, la facturation d’équipe et les notifications d’invitation restent des choix produit distincts. La distribution et la protection réseau des clés publiques doivent être définies sur l’infrastructure cible ; cette correction n’ajoute aucun cache de session.
