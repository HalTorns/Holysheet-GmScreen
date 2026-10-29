# Sécurité

## Garanties du socle

Les ressources personnelles appartiennent à un utilisateur authentifié. Chaque fonction privée contrôle une session Better Auth active, puis le propriétaire ou la membership et le rôle courants de l’espace partagé. Le module organisations est fermé par défaut côté backend. Le JWT Convex seul ne valide pas la présence actuelle d’une session : les fonctions privées utilisent le helper de session du projet. Aucun rôle, tenant ou propriétaire transmis par le client ne fait autorité.

Le navigateur reçoit le JWT Convex de courte durée nécessaire à ses appels authentifiés ; le SSR peut le transmettre au provider via `initialToken` pour cet utilisateur. Les réponses sont privées et non mises en cache. Les clés de déploiement/admin, cookies de session Better Auth et OTP ne sont jamais sérialisés vers les composants. Ne pas placer ce bearer dans une URL, un log ou un stockage persistant.

L’authentification initiale utilise un code envoyé à l’adresse email, qui vérifie le contrôle de cette adresse. Le compte peut ensuite enregistrer plusieurs passkeys. Le code email reste un moyen de récupération : la sécurité de la boîte email conditionne donc celle du compte. Les OTP et tokens ne doivent apparaître ni dans les logs ni dans les captures de tests.

Les clés privées WebAuthn sont détenues par les authentificateurs et peuvent être synchronisées par leur gestionnaire ; Convex conserve les clés publiques et les métadonnées. L’auto-hébergement ne garantit pas une clé privée liée à un seul appareil. Le domaine et le RP ID doivent être stables. [Documentation passkey 1.6](https://better-auth.com/docs/1.6/plugins/passkey).

Le socle exige un PIN ou une vérification biométrique pour les passkeys. Better Auth 1.6.22 accepte par défaut une preuve de présence sans imposer la vérification utilisateur côté serveur. Les hooks officiels `registration.afterVerification` et `authentication.afterVerification` contrôlent donc le flag UV issu de la vérification cryptographique, avant l’enregistrement de la clé ou la création de session. Une clé de sécurité sans cette capacité est refusée ; le code email reste le parcours de récupération. Ne pas remplacer ce contrôle par une option du navigateur ou un booléen envoyé par le client.

Le hook HTTP impose aussi `userVerification: 'required'` dans les options de connexion envoyées au navigateur. Le plugin 1.6.22 utilise sinon `preferred` pour la connexion, indépendamment de l’option d’enregistrement : un gestionnaire comme Dashlane peut alors fournir une assertion sans vérification utilisateur que le serveur refuse. La modification conserve le challenge et son cookie signé ; les contrôles cryptographiques restent obligatoires côté serveur.

Les actions sensibles consomment une preuve de confirmation d’identité à usage unique, liée à la session et à l’opération, obtenue dans le dialogue en conservant le formulaire, et la dernière passkey ne peut pas être retirée accidentellement. Les écrans de sécurité permettent de gérer les passkeys et fermer les autres sessions. La suppression du compte invalide l’utilisateur avant de poursuivre le nettoyage borné des ressources.

Les changements de rôles, départs et suppressions de comptes protègent le dernier propriétaire en transaction. Une révocation de membership ferme l’accès sans attendre l’expiration du JWT. Les invitations expirent, se lient à l’email vérifié et revalident la délégation de l’invitant. La suppression d’un compte conserve les ressources communes et anonymise leur auteur ; la suppression explicite de l’organisation les nettoie par lots. Les routes natives Better Auth Organization sont fermées pour empêcher une deuxième voie de modification des rôles. Voir [le module et sa matrice de droits](organizations.md).

## Configuration à conserver

Le dashboard Docker est un outil admin local, séparé du navigateur de l’application. Sa clé n’est pas injectée dans son HTML ou sa configuration publique ; le développeur la saisit et l’image officielle épinglée la conserve uniquement dans la session de l’onglet. `pnpm dashboard` la transmet au presse-papiers macOS sans l’afficher, après validation du checkout et du backend. Se déconnecter et remplacer le presse-papiers après usage. Cette clé contourne les droits métier : le dashboard ne sert pas à prouver les permissions utilisateur. Tous les services restent liés à loopback. Voir [la procédure dashboard](archive/new-project.md#utiliser-le-dashboard).

- Secrets du backend dans Convex. `.env.local` n’est pas versionné. `VITE_*` contient uniquement des URLs, flags et DSN Sentry publics ; aucun secret admin, OAuth ou serveur.
- HTTPS en production ; cookies `HttpOnly`, `Secure` et `SameSite=Lax` adaptés au même domaine.
- Base URL et origines explicites. Protections CSRF et validation des redirections actives.
- Pas de cache supplémentaire de session sans analyse du délai de révocation.
- Rate limiting durable sur les opérations métier et envois email, avec limites de taille, longueur et pagination.
- Pas de partage des secrets, boîtes email ou données de production avec les previews.
- Pas de logs de payload complet, cookies ou en-têtes d’autorisation ; messages d’erreur publics sobres.

La CSP de production utilise un nonce distinct par réponse et conserve les scripts sans `unsafe-inline` ni `unsafe-eval`. Les polices sont servies depuis la même origine. Les schémas applicatifs importent `z` depuis `@shared/zod` : sa configuration `jitless` évite le probe `Function` et la compilation dynamique de Zod. Ne pas appeler `z.compile()` côté navigateur. [CSP et compilation Zod 4.6.5](https://github.com/colinhacks/zod/blob/v4.6.5/packages/docs/content/compile.mdx).

[Sécurité Better Auth 1.6](https://better-auth.com/docs/1.6/reference/security), [Validation de session Convex](https://labs.convex.dev/better-auth/basic-usage/authorization).

## Menaces à traiter pour chaque application

| Frontière | Règle à ajouter avec la fonctionnalité |
| --- | --- |
| Organisation | Vérifier l’appartenance active et le rôle à chaque accès ; index incluant le tenant |
| Upload | Quota, taille, type réellement inspecté, droit sur l’objet et téléchargement contrôlé |
| Webhook | Signature sur le corps brut, durée admise, identifiant traité une seule fois |
| URL distante | Hôtes et schémas autorisés, blocage des adresses internes, délai et taille de réponse |
| Contenu utilisateur | Échappement par défaut ; assainissement explicite du HTML riche |
| Email et récupération | Quotas d’envoi/essai, réponses limitant l’énumération et alertes adaptées |
| IA | Budgets par utilisateur/tenant, droits revalidés pour les outils, secrets hors prompts |

Les gardes UI améliorent la navigation ; les tests directs d’API prouvent les règles de sécurité. Ajouter le cas interdit lors de chaque nouvelle règle d’accès.

## Production et incidents

Le socle ignore tous les en-têtes d’IP clients. Les quotas persistants sont appliqués après validation du cookie, avec partitions distinctes pour les comptes et les visiteurs, et budgets séparés pour la lecture de session et l’émission de tokens. Les token buckets se renouvellent pendant une utilisation continue. Les quotas email/OTP et MFA sont conservés ; la confirmation sensible possède un budget authentifié distinct. Voir [les limites exactes et les parcours](accounts.md#connexion-continue-et-sessions).

Les erreurs réseau, serveur et quota ne prouvent pas une déconnexion : SSR propose de réessayer ; le navigateur maintient le renouvellement en attente sans supprimer le cookie ou demander un nouveau code de connexion. Une session réellement absente, révoquée, suspendue ou expirée ferme l’accès. Aucun cache de session ne retarde ces contrôles. JWKS publie seulement les clés publiques et reste exempt de quota de session pour préserver la validation des JWT.

L’administration applicative relit `user.role` à chaque accès, sans MFA imposée ni reconnexion quotidienne. Elle respecte les facteurs déjà enrôlés. La protection transactionnelle du dernier admin actif couvre rôle, suspension et suppression. Les rôles d’organisation et l’allowlist du support n’attribuent pas ce rôle. [Procédure de bootstrap et migration](accounts.md).

Le rate limiter en mémoire de Better Auth n’est pas une protection distribuée. Son stockage database ne règle pas à lui seul la transmission d’IP et les contentions : des [signalements sur l’adaptateur SSR](https://github.com/get-convex/better-auth/issues/247) et [les conflits concurrents](https://github.com/get-convex/better-auth/issues/432) existent. Valider la version et le déploiement effectivement utilisés.

Définir le responsable d’incident, les alertes d’échecs auth/email et les seuils de quota. En cas de fuite, révoquer la clé concernée, fermer les sessions affectées, corriger la source et rechercher les usages ; supprimer le secret d’un fichier ne le retire pas des clones ou historiques.

La CI recherche les secrets avec Gitleaks et propose les mises à jour avec Dependabot. Elle n’effectue pas un audit de sécurité complet, ne configure pas les protections du fournisseur et ne remplace pas un exercice de restauration.
