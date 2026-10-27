# Éditeur de disposition et sauvegarde

## Périmètre de cette tranche

Étendre le premier parcours avec les widgets note existants : déplacement et redimensionnement au pointeur et au clavier, coordonnées numériques, zoom, grille magnétique désactivable de 8 px, empilement, profils numériques nommés, dimensions personnalisées, verrouillage, sauvegarde automatique et historique. Les widgets riches, groupes, guides d’alignement, styles, pop-ups et impression/export restent des tranches suivantes du PRD ; cette livraison ne termine pas l’éditeur V1 complet.

Le développement utilise une branche distincte et les services locaux du checkout. Le premier jalon a été initialisé sur Coolify le 27 octobre 2026 et l’utilisateur confirme que ses parcours fonctionnent. Les validations de cette tranche ne doivent pas appeler cette production ni ses emails Infomaniak.

## Données et compatibilité

Conserver `gmNotes` pour le contenu partagé et `gmLayouts` pour chaque disposition. Les profils numériques sont copiés à partir d’un profil existant, sans dupliquer les notes. Les noms numériques sont uniques au sein du Screen, sans distinction de casse. Au plus huit dispositions par Screen, dont la disposition papier existante : sept profils numériques dans cette version.

Les dimensions numériques sont des entiers de 320 × 240 à 8192 × 8192 px. Chaque rectangle conserve ses coordonnées et sa taille lors d’un changement de dimensions ; des notes peuvent donc sortir du cadre. Le sélecteur et les champs de coordonnées permettent de les retrouver et de les repositionner. Les valeurs de position sont bornées à 16384 px, les tailles à 160 × 120 minimum et 8192 × 8192 maximum. Ces bornes techniques sont révisables, sans constituer des quotas métier validés par l’utilisateur.

Le papier reste en millimètres et n’est pas modifié par l’édition d’un profil numérique. L’ajout d’une nouvelle note crée un placement initial dans chaque disposition, comme dans le premier jalon. Restaurer une ancienne disposition conserve les notes créées depuis cette version : restaurer la géométrie ne supprime pas du contenu.

Ajout compatible de `gmScreens.layoutLocked`, optionnel pour les données déjà créées. Son absence vaut `false`. Aucun renommage ni retrait de champs ou tables existants. Le verrouillage est commun aux vues du Screen et interdit côté serveur le déplacement, la configuration, la création de profils et l’ajout de notes ; les notes restent modifiables. La lecture seule est locale à la vue et bloque les interactions d’écriture de cette vue. Aucun de ces modes ne remplace l’autorisation propriétaire.

## Sauvegarde et concurrence

Sauvegarde après 1500 ms sans nouvelle saisie ; une sauvegarde explicite reste disponible et l’automatisme est désactivable par vue. Les gestes affichent un aperçu local, puis enregistrent à la fin du geste, jamais à chaque événement pointeur. Les déplacements tiennent compte du zoom. Les annulations de pointeur abandonnent l’aperçu.

Chaque enregistrement et restauration transmet une version attendue. Une mutation concurrente refuse l’écriture ; le brouillon reste visible et la sauvegarde automatique s’arrête jusqu’à résolution explicite. Une saisie effectuée pendant une requête n’est pas effacée à son retour : son contenu est conservé et sa version de base avance après acquittement. Les erreurs ne déclenchent pas de boucle automatique de nouvelles tentatives.

Les brouillons et requêtes en cours bloquent le changement de profil/mode et bénéficient du garde de navigation. Annuler/refaire conserve les vingt dernières opérations enregistrées de la vue ; une modification distante invalide cette pile pour éviter d’annuler une opération d’une autre fenêtre. L’historique serveur reste accessible après rechargement.

Budget d’écriture distinct `gmEditorWrite` : 120/minute par compte, capacité de rafale 60. La création des ressources conserve `resourceWrite` à 30/minute. Les limites d’authentification/email restent inchangées.

## Historique et cycle de vie

`gmEditorHistory` conserve les vingt versions précédentes de chaque note et profil modifié, avec propriétaire, Screen, projet, sujet, version et snapshot. Chaque enregistrement de contenu ou de disposition capture l’état remplacé et élimine au plus la révision excédentaire dans la même transaction. Un enregistrement identique ne crée pas de version. La restauration est une nouvelle écriture soumise à la version attendue et aux droits courants, jamais une réinitialisation de l’historique.

Les lectures sont paginées, au plus dix versions par page. L’export de compte inclut la collection ; le nettoyage par propriétaire la retire. Les collections GM sont nettoyées par lots de vingt pour borner la lecture cumulée des notes et snapshots pouvant chacun contenir 50 000 caractères. Les sauvegardes complètes contiennent l’historique ; le parcours E2E doit vérifier sa restauration réelle avec les données du Screen.

## Outils et preuves

Aucune dépendance ajoutée : événements pointeur natifs, React 19.3.0, TanStack Form, Convex et composants du socle. Context7 est indisponible dans cette session ; les versions sont vérifiées au lockfile, avec les types installés et les documentations officielles [React 19.3](https://react.dev/reference/react/useEffect) et [Pointer Capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture).

Les tests Convex possèdent droits, validation, versions, verrouillage, bornes, rétention, restauration et nettoyage. Les tests navigateur React possèdent autosauvegarde et saisie pendant une requête. Les E2E possèdent le vrai déplacement, le redimensionnement sous zoom, la synchronisation entre fenêtres, les profils indépendants, les modes, le mobile et une restauration isolée de toutes les collections.
