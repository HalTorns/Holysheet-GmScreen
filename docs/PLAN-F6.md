# Plan — Tranche F6 (avec F5b) : fichiers du projet, widgets image et PDF

Références : [PRD](../PRD.md) §2 (fichiers personnels), §5 (image et PDF parmi les douze catégories), §7 (coller ou importer des images), §14 (limites et quotas, contrôle serveur), §16 (V1 : affichage PDF, sans extraction) · [ADR widgets](decisions/widgets.md) · [ADR stockage](decisions/storage.md) · [PLAN-F5a](PLAN-F5a.md).

## Objectif

Le MJ importe des images et des PDF dans un projet, puis les affiche sur un Screen :

- un widget **image**, avec zoom et déplacement simples ;
- un widget **PDF**, avec navigation par page.

Coller ou déposer une image sur un Screen crée directement un widget image. Les fichiers sont privés, comptés dans un quota, et suivent le cycle de vie existant : corbeille, purge, export, suppression de compte.

## Décisions (hypothèses réversibles, à consigner dans un ADR `decisions/files.md`)

1. **Stockage** : stockage de fichiers Convex (`ctx.storage`), donc volume local ou S3/Garage selon le déploiement, sans code spécifique. Aucun service tiers.
2. **Table `gmFiles`**, une par fichier importé :
   - champs : `ownerId`, `projectId`, `storageId`, `name`, `mimeType`, `size`, `createdAt`, `deletedAt` ;
   - index : par propriétaire, par projet vivant, par `storageId` ;
   - un widget référence un `gmFiles` et jamais un `storageId` directement ;
   - dupliquer un widget ou un Screen partage la référence et ne copie pas le fichier.
3. **Types acceptés** : PNG, JPEG, WebP, GIF et PDF.
   - **SVG refusé** : c'est un document actif, avec risque de XSS.
   - Le type déclaré par le client n'est jamais utilisé. Le serveur lit la signature (magic bytes), et **le blob est stocké avec le type canonique détecté** : le type MIME servi est donc toujours dans la liste autorisée (revue F6-03).
   - Un PDF importé depuis une action « image » est enregistré comme PDF, sans erreur ; le kind du widget créé suit le type détecté.
   - Les fichiers ne sont jamais ouverts par navigation : images en `<img>`, PDF lu en octets par PDF.js.
4. **Limites** (constantes de `shared/`, documentées comme hypothèses) :
   - 10 Mio par image et 16 Mio par PDF, sous la limite de 20 Mo du corps de requête des actions HTTP Convex ;
   - quota de 500 Mio par utilisateur, compté sur les fichiers vivants et en corbeille ;
   - 200 fichiers par projet.

   Chaque dépassement est refusé avec un code explicite (`FILE_TOO_LARGE`, `FILE_TYPE`, `STORAGE_QUOTA`, `PROJECT_FILE_LIMIT`). Aucune donnée existante n'est touchée.

5. **Flux d'import : une seule route HTTP authentifiée** `POST /files/upload` (revue F6-01, F6-02). Il n'y a **pas d'URL d'envoi directe** (`generateUploadUrl`), ce qui supprime les blobs non rattachés et les dépassements d'octets hors quota.
   - **Authentification** : jeton Convex `Authorization: Bearer`, celui que le client obtient déjà via `fetchAccessToken`. La garde complète `requireUser` (session vivante, email vérifié, MFA, restrictions support) s'applique **avant toute lecture du corps**, via une query interne qui reçoit le contexte authentifié, puis **à nouveau dans la mutation finale** (revue F6-06). Le propriétaire est toujours dérivé de cet utilisateur, jamais d'un argument. Le projet cible est en paramètre ; sa propriété est vérifiée aux deux étapes. CORS restreint à l'origine du site, préflight compris.
   - **Ordre des contrôles** : rate limiter d'abord. Puis refus anticipé si `Content-Length` est absent ou dépasse la limite du type maximal, ou si le quota est déjà atteint. Ensuite, lecture du corps avec un plafond d'octets (arrêt au dépassement, avant tout stockage), détection de la signature, et enfin `ctx.storage.store(new Blob([octets], { type: canonique }))`.
   - **Enregistrement** : une mutation interne transactionnelle revérifie le propriétaire, le projet, le quota et la limite par projet, puis insère `gmFiles`. Si elle refuse, l'action supprime le blob qu'elle vient de créer. Ce blob n'a encore jamais été exposé : aucun autre compte ne peut le référencer, et l'unicité `storageId` → `gmFiles` est garantie par construction.
   - **Filet de sécurité** : un cron paginé retire tout `_storage` de plus d'une heure sans ligne `gmFiles`. Ce cas n'arrive que si l'action plante entre le stockage et l'insertion. Règle documentée : toute future utilisation du stockage devra enregistrer ses blobs dans une table connue de ce cron.
   - Le client envoie via `fetch` avec suivi d'état (envoi en cours, erreur explicite) ; un seul fichier à la fois.
6. **Lecture** : une query authentifiée renvoie l'URL `ctx.storage.getUrl` au seul propriétaire.
   - Ces URL sont des URL à capacité : quiconque détient l'URL voit le fichier, sans authentification. Ce risque est accepté pour la bêta privée et documenté ; la suppression du fichier invalide l'URL.
   - CSP (revue F6-07) : `getUrl` sert les fichiers depuis l'origine **cloud** de Convex (`VITE_CONVEX_URL`), et l'envoi passe par l'origine **site** (`VITE_CONVEX_SITE_URL`). Donc `img-src` reçoit l'origine cloud, et `connect-src` reçoit les deux. On vérifie le rendu de l'image et le chargement du PDF sous la CSP de production, avec deux origines distinctes.
   - Une preuve E2E lit l'URL réelle et vérifie l'en-tête `Content-Type` canonique, y compris pour un polyglotte GIF+HTML, qui doit être servi en `image/gif`.
7. **Rendu PDF** avec `pdfjs-dist` dans un canvas, chargé à la demande (import dynamique, hors bundle principal), avec `isEvalSupported: false` et un worker servi localement.
   - Pas d'`<iframe>` du lecteur du navigateur : rendu inégal sur mobile, et contrôle CSP plus large.
   - Navigation : page précédente et suivante, saisie du numéro de page, zoom ajusté à la largeur.
   - La page courante est l'état du widget (`state.page`), sauvegardé comme un état de session.
8. **Widgets** : kinds `image` et `pdf` dans `convex/lib/gmValidators.ts` et `shared/gm.ts`.
   - image : `config { fileId, alt, fit: 'contain' | 'cover' }`, `state { zoom, x, y }` ;
   - pdf : `config { fileId }`, `state { page }`.

   Ils suivent le contrat F3 : une branche validée, un rendu numérique et un rendu statique. Un fichier supprimé, absent ou d'un autre projet affiche « Fichier indisponible » sans casser le Screen. Le rendu papier et export de F9 reste hors périmètre : le rendu statique affiche l'image, ou la première page du PDF à défaut d'un rendu complet.

9. **Coller ou déposer une image** sur un Screen : import du fichier, puis création d'un widget image à la position du curseur, ou au placement par défaut. Un seul fichier à la fois (PRD §7). Les images incluses dans le texte riche d'une note restent hors périmètre.
10. **Bibliothèque** : une section « Fichiers » dans la page projet liste, renomme, met en corbeille et restaure les fichiers ; la corbeille des fichiers permet la purge (revue F6-04).
    - Mettre en corbeille un fichier utilisé est permis, avec un avertissement qui indique le nombre de widgets concernés. Ces widgets affichent « Fichier indisponible » jusqu'à la restauration.
    - **Purge** : seulement pour un fichier en corbeille. Elle est permise même s'il est référencé, puisque les widgets restent en « Fichier indisponible ». Elle supprime le blob et la ligne. Pas de code `FILE_IN_USE`.
11. **Cycle de vie** (revue F6-05) :
    - la suppression de compte et `cleanupJobs` suppriment lignes et blobs, par leurs vrais points d'entrée ;
    - l'export de compte inclut les métadonnées des fichiers sans les blobs, ce qui est documenté ;
    - toutes les listes de tables du code (`gmTables`, `gmCollection`, `gmDocument`, `exportCollection`, etc.) incluent `gmFiles` ;
    - `scripts/snapshots.mjs` et `scripts/verify-restore.mjs` valident les kinds `image` et `pdf`, les relations `gmFiles` (propriétaire, projet), la présence et le type des blobs, et **échouent** si une relation est invalide ;
    - la restauration CI (`restore.spec.ts`) utilise des fixtures **non vides**, une image et un PDF, et prouve export, import, puis réexport identique.

## Hors périmètre

Images dans le texte riche, extraction ou conversion de PDF, OCR, cartes interactives (jetons, brouillard), import en lot, URL signées à durée limitée, export imprimable (F9), partage public.

## Critères d'acceptation

1. Backend (convex-test) :
   - import refusé pour un SVG renommé en `.png`, un fichier trop gros (y compris un `Content-Length` mensonger) et un quota dépassé, sans blob restant ;
   - un PDF déclaré en image est enregistré comme PDF ;
   - le type stocké est canonique ;
   - un projet d'un autre compte est refusé ;
   - une session révoquée, une MFA manquante, et une révocation entre l'autorisation initiale et l'insertion sont refusées ;
   - deux envois concurrents près du quota : un seul passe ;
   - isolation entre comptes, en lecture comme en écriture ;
   - purge permise seulement depuis la corbeille, avec les widgets qui passent à « indisponible » ;
   - nettoyage de compte : plus aucun blob ;
   - le cron des blobs orphelins supprime les blobs anciens et garde ceux qui sont récents ou enregistrés ;
   - les widgets image et PDF sont validés, dupliqués (la référence est partagée) et restaurés.
2. Navigateur (Vitest) : rendu du widget image (zoom, fichier indisponible) et du widget PDF sur un petit PDF de fixture (navigation, page hors bornes).
3. E2E CI, contre le vrai backend :
   - importer une image et un PDF dans un projet, les placer sur un Screen, recharger, naviguer dans le PDF ;
   - coller une image sur un Screen ;
   - en-têtes `Content-Type` réels, polyglotte compris ;
   - envoi trop gros refusé sans blob restant ;
   - corbeille, widget indisponible, restauration, puis purge ;
   - restauration non vide via `restore.spec.ts`.
4. `pnpm check` vert, `pnpm audit:convex` à 0 avec l'inventaire à jour, `pnpm audit --prod --audit-level=high` sans nouvelle vulnérabilité, pour `pdfjs-dist` notamment. ADR `decisions/files.md`, `docs/product.md`, `docs/backup-restore.md` et le journal sont à jour.

## Commandes de preuve

`pnpm check` · `pnpm audit:convex` · `pnpm audit --prod --audit-level=high` · CI de branche (E2E), puis avance rapide de `main`.
