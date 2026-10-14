# SEO, protection et observabilité

Chaque intégration reste à sa frontière, désactivée en l’absence de sa configuration. Les données métier, sessions et quotas durables restent dans Convex.

## SEO

`pageMetadata` gère title, description, Open Graph, Twitter, canonical et robots. `shared/seo.ts` échappe le JSON-LD pour empêcher la fermeture d’un script ; TanStack applique le nonce de la réponse SSR. `src/config/seo.ts` déclare les pages publiques du sitemap. Les pages privées sont `noindex` et ne figurent jamais dans `sitemap.xml`. `robots.txt` interdit toute indexation en local et les chemins privés en production. Définir `VITE_SITE_URL` sur le domaine canonique du produit ; ajouter ses images OG réelles et pages publiques au registre.

## Sentry et Spotlight

Dans `.env.local` / environnement du frontend SSR : `SENTRY_DSN` pour le serveur, `VITE_SENTRY_DSN` pour le navigateur. Un DSN Sentry est public ; aucune clé d’upload source maps ne doit être publique. Les SDK sont importés dynamiquement lorsqu’une cible est configurée ; un échec d’initialisation conserve l’application utilisable. Le serveur encapsule le handler Start et les Server Functions ; le client s’initialise avant l’hydratation. Les erreurs prises en charge dans l’interface doivent être capturées explicitement si le produit veut les signaler.

La collecte des corps HTTP, cookies, headers, variables, contextes et utilisateurs est fermée. Une allowlist reconstruit les événements : message générique et emplacement de pile sans query/hash. Les breadcrumbs, logs, replays et transactions sont supprimés ou désactivés. Ce choix limite volontairement le diagnostic aux piles ; enrichir avec des codes d’erreur non sensibles selon les besoins du produit. Les erreurs internes Convex restent dans ses logs/dashboard ; le SDK web ne constitue pas une instrumentation du runtime Convex.

Pour le développement local :

```sh
pnpm services:up --spotlight
pnpm dev
```

Le wrapper active le profil Docker `observability`, les flags privés/publics locaux et vérifie la propriété du port 8969. Spotlight se consulte sur `http://localhost:8969`. Les services restent liés au checkout ; `pnpm services:down` conserve les données Convex. Les flags Spotlight sont ignorés dans un build de production. `pnpm test:e2e:local spotlight` vérifie la livraison réelle vers le sidecar depuis le SDK en développement, sans DSN Sentry. Pour couper la collecte locale, mettre `VITE_SPOTLIGHT_ENABLED=false` et `SPOTLIGHT_ENABLED=false` dans `.env.local`, puis relancer Vite. Sans DSN ni flag Spotlight, aucun SDK n’est initialisé.

Les source maps de production et leur upload ne sont pas configurés automatiquement : définir la politique de publication et un jeton d’upload secret dans la CI du produit avant de les ajouter. Le SDK TanStack Start Sentry est actuellement beta ; une mise à jour doit vérifier cookies, CSP et middleware.

## PostHog

Configurer `VITE_POSTHOG_KEY` avec la clé publique du projet et `VITE_POSTHOG_HOST` (défaut région EU). L’absence de clé évite le chargement du SDK/provider React. Le provider est chargé uniquement dans le navigateur, autour de son collecteur de navigation ; il ne remplace ni ne suspend les composants applicatifs pendant le chargement. Ajouter les futurs événements dans cet adaptateur et sa validation explicite. Autocapture, replays, exceptions, web vitals, feature flags et chargement de scripts externes sont fermés ; la persistance reste en mémoire. Les seuls événements de base sont `page_viewed` avec la clé publique du projet requise par le protocole, une catégorie statique (`home`, `sign-in`, `application`, `mfa`, `other`) et un identifiant aléatoire ; l’allowlist retire les URL, referrers, IDs privés et propriétés SDK automatiques. Aucun email ni ID de compte n’est associé.

Pour enrichir l’analytics du produit, définir les événements et le consentement applicables avant d’ajouter une identification, une persistance ou des propriétés. Retirer la clé coupe le module ; le fournisseur reçoit nécessairement la connexion réseau du navigateur. La CSP ajoute uniquement les origines configurées pour les modules actifs.

## Arcjet : périmètre attesté

Le module `src/lib/security/arcjet.ts` protège `/api/auth/*` avec Shield, détection de bots et token bucket. JWKS demeure public. Les erreurs de protection ferment le parcours avec 503 ; un refus de quota retourne 429. Les limites email/MFA de Convex continuent de s’appliquer.

Un `Request` Fetch ne contient pas de peer TCP fiable. Activer Arcjet exige un reverse proxy de confiance qui **écrase** `x-starter-client-ip` avec l’adresse réelle et `x-starter-proxy-key` avec un secret partagé. Ne pas transmettre les valeurs fournies par le client. Le serveur compare ce secret en temps constant, valide une IP unique et ne transmet à Arcjet ni cookie, corps, query ni identité. `X-Forwarded-For` seul n’est jamais une preuve.

Variables serveur privées : `ARCJET_ENABLED=true`, `ARCJET_KEY`, `ARCJET_PROXY_SECRET` (32 caractères minimum), `AUTH_PROXY_SECRET` (un second secret distinct, 32 minimum). Variables Convex : `AUTH_PROXY_REQUIRED=true` et le même `AUTH_PROXY_SECRET`. Le proxy Start retire les attestations clientes et ajoute son secret backend, y compris pour les lectures SSR du token. Le hook Convex refuse les appels auth directs sans ce secret, hormis JWKS. Une activation partielle laisserait l’endpoint Convex contournable : configurer les deux côtés avant l’ouverture publique et vérifier le chemin direct.

Le défaut local est désactivé : aucune IP fictive et aucun appel Arcjet distant dans les tests courants. L’intégration du reverse proxy dépend de l’hébergement du produit et sera traitée avec son déploiement, notamment Coolify. Sans périmètre attesté, garder le flag fermé et les protections Convex actives.

## Variables

`src/env.ts`, `src/env.server.ts`, `convex/lib/environment.ts`, `convex/lib/authModules.ts` et le provider email valident les variables avec env-core + Zod jitless. Une configuration activée incomplète échoue sans afficher les entrées rejetées. Les variables administratives des scripts locaux restent validées par leurs gardes de déploiement/Docker ; elles ne sont jamais des variables applicatives publiques.

`pnpm test:e2e:local observability` construit les modules actifs avec des clés publiques fictives et des transports SaaS interceptés, puis vérifie leur livraison sous la CSP de production. Le lanceur neutralise les clés/flags de télémétrie hérités pour ses processus de test ; `spotlight` force seulement le sidecar local, sans DSN. Les autres parcours locaux ferment ces transports. Les fichiers de configuration du projet restent conservés, et le build original est restauré. Ces tests ne contactent aucun projet Sentry/PostHog/Arcjet distant.
