# Comptes, administration et formulaires

## Administration applicative

`/app/users` fournit la liste des utilisateurs, la recherche par préfixe d’email ou de pseudo, un filtre de rôle et une pagination par curseurs. La fiche présente le statut, un aperçu des sessions actives, les confirmations de rôle/suspension/révocation et le journal des actions sur 30 jours, avec date et ID stable de l’acteur (ou attribution opérateur).

L’aperçu des sessions lit au plus 100 connexions non révoquées, de la plus récente à la plus ancienne, puis affiche au plus 20 sessions non expirées. Le filtrage de l’expiration intervient après cette limite effective de lecture. Si 100 connexions ont été inspectées ou si plus de 20 sessions actives ont été trouvées, l’interface signale que l’aperçu peut être incomplet ; elle ne déclare pas le compte sans session sur la seule base d’un aperçu vide. Le nettoyage quotidien des sessions expirées permet aux connexions plus anciennes de réapparaître. La fermeture concerne toujours toutes les sessions, indépendamment de l’aperçu.

Les rôles `user` et `admin` sont ceux du compte Better Auth existant. Une inscription reçoit `user` ; les endpoints génériques de gestion des rôles et de profil sont fermés pour ces champs. Chaque lecture et mutation privée relit la session, la suspension, le facteur MFA éventuellement enrôlé et le rôle courant. Un admin sans MFA peut administrer normalement ; un compte qui a activé la MFA doit la vérifier dans chaque nouvelle session. L’âge de la connexion n’est pas une condition d’administration quotidienne.

Les rôles d’organisation n’autorisent pas cette administration. Le support technique (`/app/admin`, `AUTH_ADMIN_ENABLED`, `ADMIN_USER_IDS`) reste séparé : allowlist d’IDs, MFA et session récente, impersonation en lecture seule limitée à cinq minutes et liée à la session d’origine.

La transaction qui rétrograde, suspend ou supprime un administrateur protège le dernier admin actif et vérifié, y compris face à une opération concurrente. Les écritures de rôle sont bornées à 100 comptes admin ; le bootstrap applique la même limite. La fiche utilise une version attendue (`adminVersion`, compteur dédié) pour refuser une modification concurrente. Une suspension ou une révocation inscrit immédiatement une coupure de sessions ; le nettoyage physique suit par lots de 100. Réactiver un compte ne ressuscite pas ses anciennes sessions.

## Attribuer le premier administrateur

1. Faire connecter le compte sur le site et relever son ID stable dans le dashboard local (table `user` du composant Better Auth).
2. Dans le checkout propriétaire des services, exécuter `pnpm admin:grant ID_COMPTE`.
3. Ouvrir `/app/users`. Le rôle est relu sans déconnexion et l’attribution opérateur est journalisée.

Ce script refuse les sélections distantes et contrôle la propriété Docker, comme le setup. Il ne change aucun flag de support et n’affiche pas de secret. Le bootstrap est une mutation **interne**, inaccessible aux clients ordinaires. Pour un déploiement de produit, appeler explicitement `userAdmin:grant` avec les moyens opérateur de cet environnement après vérification de sa cible ; ne pas réutiliser les secrets locaux.

## Pseudos et migration additive

Le pseudo utilise `user.name` ; `user.nameKey` est sa clé d’index, privée aux écritures serveur. Les droits et la propriété continuent d’utiliser l’ID du compte.

Variables **privées Convex**, vraies par défaut :

| Variable | Effet |
| --- | --- |
| `PROFILE_NAME_REQUIRED` | Afficher le choix du pseudo avant l’espace lors de la première connexion ou pour un ancien compte sans clé valide |
| `PROFILE_NAME_UNIQUE` | Refuser atomiquement une clé déjà possédée par un autre compte |

Mettre `false` explicitement pour un produit qui ne veut pas imposer le pseudo ou son unicité. Ces choix ne désactivent pas la validation d’un pseudo effectivement fourni. La capacité affichée par le frontend décrit la politique serveur et ne l’autorise pas.

Normalisation : Unicode **NFKC**, tout groupe d’espaces Unicode reconnu par `\s` ramené à un espace ASCII, espaces de début/fin retirés, puis validation de 2 à 32 points de code Unicode. Lettres, marques combinantes, nombres, espaces, `.` `_` `-` sont admis ; caractères de contrôle/invisibles et emojis sont refusés. La clé est ensuite convertie en minuscules avec `toLowerCase()` indépendant de la locale. Les accents restent significatifs ; aucun rapprochement des homoglyphes ni case folding linguistique supplémentaire. Le nom affiché conserve sa casse normalisée. La recherche pseudo utilise la même clé.

Pour un checkout existant :

```sh
pnpm auth:generate
pnpm backend:push
pnpm profiles:migrate
```

La génération ne doit modifier que le schéma prévu (`nameKey`, `profileVersion` et `adminVersion` optionnels). La migration interne parcourt des lots de 100 avec curseur création/ID ; elle est additive et rejouable. Elle conserve les noms affichés, ajoute les clés valides disponibles et normalise les rôles absents vers `user`. Les versions absentes valent zéro ; elles progressent par domaine, indépendamment des timestamps écrits par les plugins d’authentification. Les noms invalides ou en collision restent à choisir par leur propriétaire ; le rapport contient uniquement des compteurs. Exécuter jusqu’à la fin avant de rouvrir la modification des profils sur un produit existant, notamment lors du passage d’unicité désactivée à activée. Aucun volume ni compte n’est réinitialisé.

L’export personnel inclut le pseudo, le rôle, la suspension et la date de coupure des sessions, ainsi que les métadonnées des actions comme acteur/cible sans identité d’un tiers. Les preuves de confirmation, codes, facteurs secrets et jetons ne sont jamais exportés. Suppression et expiration nettoient les nouvelles tables par lots. La restauration compare toutes les tables du snapshot ; la fixture réelle couvre profil, audit, coupure de sessions et confirmation en attente.

La fermeture du compte enregistre atomiquement une demande de nettoyage `cleanupJobs`, contenant l’ID et l’email nécessaires aux lots. Le cron reprend les demandes inachevées après restauration ou échec d’une tâche ; le dernier lot efface la demande et ses métadonnées. Les anciennes archives sans cette table demandent une réconciliation opérateur. Voir [sauvegarde/restauration](backup-restore.md).

## Confirmation d’identité dans le parcours

Les lectures et exports personnels, le pseudo, la gestion courante des sessions et des organisations, et l’administration n’imposent aucune reconnexion après cinq minutes. Une session conserve son expiration normale et reste révocable immédiatement.

La suppression du compte ou d’une organisation, l’ajout/retrait d’une passkey et la gestion des facteurs exigent une confirmation d’identité depuis leur dialogue. Le serveur envoie un code email au compte vérifié et conserve un HMAC lié à l’utilisateur, à sa session et à **l’opération exacte** (avec l’ID de la passkey à retirer ou de l’organisation à supprimer). Le code expire après cinq minutes, admet trois essais et produit une preuve à usage unique. Le serveur consomme cette preuve dans la mutation sensible ; un échec transactionnel conserve la preuve pour une nouvelle tentative. Les endpoints Better Auth consomment leur preuve avant l’appel : un échec de cérémonie nécessite une nouvelle confirmation.

Le dialogue garde le formulaire monté, permet d’annuler, d’afficher l’erreur ou de redemander un code, puis reprend l’action après succès. Il utilise le moyen email existant sans créer ni remplacer de session. Les assurances MFA des comptes enrôlés restent obligatoires et liées au facteur exact. La confirmation ne contourne pas une MFA manquante, une suspension ou une session révoquée. L’expiration porte sur la preuve demandée dans ce parcours, pas sur l’âge de la connexion.

## Connexion continue et sessions

Les lectures `/get-session` et `/convex/token` possèdent chacune un token bucket de 120 requêtes, renouvelé à 120/minute. Le hook valide le cookie et l’accès courant avant de choisir la clé `user:ID` ; les visiteurs anonymes ont une partition distincte. Les entrées de connexion/OTP ont un budget de 60/minute, les autres endpoints 120/minute, également séparés entre identité authentifiée et anonyme. JWKS reste public sans quota de session. Aucun header IP client ne définit une identité. La lecture préalable au quota utilise le point d’entrée de session sans refresh et laisse remonter les erreurs de stockage ; le helper qui transforme ces erreurs en session absente est volontairement évité. Une session révoquée ne peut donc pas renouveler son échéance avant le refus.

Les limites d’envoi de connexion restent 3 codes/destinataire/5 minutes, 3 essais par OTP, et 100 emails/minute pour l’instance. La nouvelle confirmation sensible possède ses propres budgets authentifiés de 5 envois et 5 vérifications par compte/5 minutes, avec le plafond global email partagé. Les limites MFA existantes restent indépendantes. Tous ces budgets sont persistants et renouvelables ; aucun cache de session n’est ajouté.

La suppression d’un compte efface aussi ses dix quotas liés à l’ID (`ID` et `user:ID`) dans un nombre fixe d’opérations. Les quotas globaux, anonymes et par destinataire haché restent indépendants afin qu’une recréation de compte ne contourne pas la protection d’envoi.

La surface HTTP Better Auth utilise exclusivement les cookies signés : les headers `Authorization` y sont refusés avant les hooks des plugins, à l’exception du JWKS public. Les JWT Convex continuent d’authentifier les appels métier directs à Convex. Ce refus évite qu’un plugin transforme tardivement un bearer en session après les contrôles de preuve, de MFA et de révocation.

Après validation vivante et quota, une lecture navigateur de `/convex/token` renouvelle normalement une session arrivée à son `updateAge` et transmet le cookie prolongé. Le SSR demande `disableRefresh=true` : cette lecture de token ne peut pas modifier l’échéance en base sans transmettre le cookie au navigateur. Une session révoquée est refusée avant tout renouvellement.

SSR et navigateur distinguent refus réel (401/403, session absente/révoquée) et panne réseau/serveur/quota. Une panne propose Réessayer et conserve le cookie. Un renouvellement de token temporairement indisponible reste en attente avec reprise progressive et bouton de reprise ; il ne renvoie pas un faux résultat anonyme à Convex. Chaque fonction métier conserve sa validation de session vivante. Le provider peut réutiliser son JWT SSR ou le dernier JWT en mémoire lorsque Convex ne demande pas de renouvellement ; `forceRefreshToken` impose une nouvelle lecture serveur. Les contrôles d’écriture attendent la confirmation initiale de Convex, tandis que le renouvellement courant conserve les formulaires montés.

Après une connexion email/credentials/passkey/lien/OAuth réussie, le hook remplace seulement l’ancienne session **présentée par ce navigateur**, si les deux sessions appartiennent au même compte. Les autres appareils, les autres comptes et les tentatives refusées conservent leurs sessions. L’assurance MFA de l’ancienne session n’est jamais transférée ; pour un compte enrôlé, le remplacement effectif attend la vérification indépendante du facteur dans la nouvelle session.

Si une nouvelle connexion attend la MFA, un cookie HttpOnly signé, valable au plus cinq minutes et lié à l’ID de cette tentative, conserve la possession de la session précédente. « Annuler cette tentative de connexion » peut la rétablir uniquement si elle est toujours valide, appartient au même compte, conserve son assurance MFA actuelle et correspond au lien de remplacement enregistré côté serveur. Le bearer de la session en attente ne suffit jamais à retrouver cette assurance. Une réussite MFA supprime ce cookie et révoque la session remplacée ; un abandon sans preuve valide ferme seulement la tentative. Le jeton de la session précédente reste dans ce cookie HttpOnly : le parcours d’annulation ne le renvoie jamais dans son JSON, une URL ou un stockage JavaScript.

## Modèles pour les futurs domaines

- `DraftGuard` protège une navigation et `beforeunload`. Les dialogues ressources confirment aussi leur fermeture lorsqu’ils sont modifiés.
- `SaveActions` fournit un enregistrement accessible sur mobile et bloqué pendant la soumission ; les formulaires gardent leurs erreurs au champ et leur saisie.
- Les ressources utilisent une version attendue et un timestamp strictement croissant. Un conflit affiche la version serveur et conserve le brouillon ; la reprise sur cette version est une décision explicite de l’utilisateur.
- `useDebouncedSearch` temporise la recherche. Les ressources réinitialisent leur pagination Convex lorsque recherche/filtre changent ; l’administration recrée sa pile de curseurs. `ListNavigation` annonce la page et utilise des boutons natifs accessibles au clavier.
- Les brouillons restent en mémoire, sans persistance navigateur. Le layout compare l’identité Better Auth et Convex avec l’ID validé par le loader ; un changement réel de compte masque l’ancien espace puis recrée le document et ses caches.

Les tests backend possèdent autorisations, transactions, versions et cycle de vie. Les E2E possèdent cookies, Mailpit, preuves HTTP, passkeys, formulaires et erreurs temporaires. L’E2E d’administration conserve volontairement un compte local synthétique `boilerplate-admin-e2e@example.test` : la protection du dernier administrateur interdit sa suppression ordinaire. Aucun endpoint de production réservé aux tests n’est ajouté.

Pour le mode credentials optionnel, la gestion MFA ajoute le mot de passe actuel à la confirmation d’identité. `getAccessState` expose seulement `hasPassword` ; voir [les modules d’auth](auth-modules.md#email-et-mot-de-passe-optionnels).
