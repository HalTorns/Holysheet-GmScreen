PRD — Holysheet GM Screen Statut : cadrage validé, préparation au développement Dépôt applicatif : https://github.com/HalTorns/Holysheet-GmScreen.git Boilerplate de départ : https://github.com/NathanDigiDev/boilerplate-v2.git Implémentation future : Codex, en respectant AGENTS.md et la documentation du boilerplate Cible de lancement : petite bêta privée auprès de maîtres du jeu (MJ) Langue du produit à ce stade : français par défaut (autres langues non cadrées)

1. Vision et problème à résoudre Construire une plateforme web permettant à chaque MJ de composer des écrans de maître du jeu personnalisés, comparables aux écrans physiques fournis avec un jeu de rôle, mais enrichis de contenus interactifs. La priorité est de préparer rapidement des références de partie et de retrouver sans effort notes, règles, rappels, fiches, marchands, objets et tableaux durant une session. Ce produit n'est PAS un VTT (virtual tabletop) et ne doit pas se transformer en logiciel de conduite exhaustive d'une partie : pas de plateau tactique, de brouillard de guerre, de déplacement de figurines, de gestion systématique de toutes les actions ou d'obligation de suivre une session entière. Les dés et un tracker d'initiative sont des aides facultatives, non le cœur de l'expérience. Principes : simplicité par défaut, personnalisation puissante à la demande ; interface moderne, sobre et neutre ; préparation rapide par copie/collage ; information lisible et immédiatement accessible ; contenus indépendants d'un système de JDR particulier ; aucun assistant IA intégré.
2. Utilisateurs, accès et propriété

- Chaque utilisateur possède un espace personnel, ses projets, ses fichiers et ses publications.
- Authentification email + mot de passe uniquement pour la V1, via le mécanisme du boilerplate ; connexion obligatoire pour toutes les pages, y compris la bibliothèque communautaire.
- Première ouverture à un petit groupe de MJ testeurs ; plateforme conçue pour s'ouvrir ensuite à davantage d'utilisateurs.
- Aucune organisation, invitation privée, partage privé par lien ou collaboration simultanée entre comptes : ces options ont été explicitement retirées du périmètre.
- La réutilisation du travail d'un autre MJ passe par publication communautaire puis import d'une copie indépendante. Aucun lien de filiation nécessaire entre copie et original.
- Ne pas confondre absence de collaboration multi-utilisateur avec synchronisation : les multiples pop-ups, onglets et appareils d'un même utilisateur doivent bien rester synchronisés en temps réel.
- Recommander le modèle d'accès final à partir de ces règles, sans inventer une couche organisationnelle.

3. Parcours principal du MJ
1. Se connecter et retrouver un tableau de bord : projets, Screens récents, favoris.
1. Créer un projet de campagne ou de JDR, avec dossiers et sous-dossiers.
1. Ajouter des ressources et fiches propres au projet ; coller directement du texte, des tableaux, des images ou du Markdown ; utiliser les modèles sans ressaisie forcée.
1. Créer un ou plusieurs Screens aux dimensions d'un écran numérique ou d'un papier A5/A4/A3.
1. Glisser/déposer, placer librement, redimensionner et configurer des widgets ; lier certains à des fiches et variables partagées.
1. Ouvrir les Screens dans des fenêtres indépendantes du navigateur, éventuellement en ensemble prédéfini, et les répartir entre plusieurs écrans physiques.
1. Pendant la partie, consulter les informations immédiatement, rechercher une fiche, modifier une valeur, cocher un rappel ou ouvrir une autre fiche sans quitter le Screen ; modifications répercutées en live.
1. Exporter la version imprimable, éventuellement plusieurs Screens dans un PDF commun ; partager publiquement certains contenus en publiant une copie complète après vérification.
1. Projets, dossiers, Screens et sessions

- Plusieurs projets par utilisateur ; arborescence de dossiers et sous-dossiers.
- Plusieurs Screens par projet, organisables par dossier et/ou par session ; possibilité de réutiliser fiches et widgets entre sessions.
- Un Screen est une surface de composition ; chaque instance de widget a position, dimensions, ordre de calque, configuration et références à ses données.
- La bibliothèque de fiches et de variables appartient au projet, pas à un catalogue personnel global.
- Un Screen se duplique pour servir de modèle ; pas de système distinct de templates liés. Les créations communautaires peuvent être utilisées comme modèles en les important et en les dupliquant.
- La suppression est réversible grâce à une corbeille avec restauration temporaire ; les projets sont archivables puis restaurables.
- Export/import d'un projet complet, comprenant structure, contenus, Screen(s), widgets, ressources, fiches, variables, relations et références internes. L'import reconstruit des identifiants propres à la copie et évite les références cassées.

5. Création des Screens et formats

- Surface numérique personnalisée en pixels : dimensions explicites, notamment pour moniteurs et petits écrans dédiés.
- Formats papier : A5 (148 × 210 mm), A4 (210 × 297 mm), A3 (297 × 420 mm), en portrait ou paysage. Respect des dimensions physiques à l'impression.
- Les dimensions d'un Screen peuvent changer après sa création ; le MJ repositionne manuellement les widgets si nécessaire, pas de redistribution automatique imposée.
- Plusieurs profils de disposition nommés pour un même Screen (bureau, portable, tablette MJ, etc.) avec positions et tailles indépendantes ; les contenus sous-jacents restent communs.
- Quand une fenêtre est plus petite que la surface définie, conserver les dimensions du Screen et permettre défilement et déplacement de la vue, plutôt que redimensionner automatiquement son contenu.
- Fonds : couleurs, images, textures, transparence ; pas de système d'effets multicouches complexes requis.

6. Éditeur libre et expérience d'édition

- Positionnement au pixel près, grille magnétique désactivable, guides d'alignement et distribution, groupes de widgets.
- Déplacer, redimensionner, copier/coller, dupliquer, supprimer ; calques et ordre d'empilement ; annuler/refaire et historique des modifications ; sauvegarde automatique.
- Styles avancés : couleurs, typographies, bordures, fonds, transparence et CSS personnalisé contrôlé / limité au widget.
- Menus contextuels, raccourcis clavier, sélection et manipulation adaptées au choix confirmé (groupes oui, sélection multiple avancée non imposée au-delà de ce qui est nécessaire aux groupes).
- L'éditeur reste accessible depuis la fenêtre principale et directement depuis chaque pop-up : ajouter, supprimer, déplacer et configurer les widgets sur place.
- Trois modes utiles : édition (déplacement/configuration et interactions), verrouillé (mise en page bloquée, widgets toujours interactifs) et lecture seule (consultation sans modification). Le verrouillage peut être indépendant par Screen.
- Prévoir des panneaux de paramètres pour les configurations complexes ; interactions usuelles directement dans les widgets ; menus contextuels et raccourcis.
- Sur tablette/téléphone : consulter les Screens et modifier le contenu des widgets ; l'éditeur complet de disposition mobile n'est pas exigé.

7. Fenêtres pop-up, live et multi-écrans

- Ouvrir un Screen dans une fenêtre séparée via une action explicite de l'utilisateur ; plusieurs fenêtres peuvent coexister.
- Ensembles de fenêtres prédéfinis, à tenter d'ouvrir en un clic. Gestion des bloqueurs de pop-ups : fournir une reprise manuelle si le navigateur refuse l'ouverture.
- Mémorisation de largeur, hauteur, positions et environnement de fenêtres ; restauration au mieux suivant les permissions et contraintes du navigateur, sans promettre un positionnement exact sur chaque OS.
- Répercussion en direct des changements de texte, état, fiche, compteur, disposition et configuration sur toutes les vues autorisées du même utilisateur, y compris entre appareils ; un objet partagé mis à jour une fois doit actualiser tous les widgets qui le consultent.
- Éviter les boucles d'événements, conflits d'état et pertes de saisie. Employer en priorité les capacités temps réel de Convex ; BroadcastChannel peut optimiser les fenêtres d'une même origine si utile, sans remplacer la persistance serveur.
- Pas d'édition collaborative simultanée entre utilisateurs distincts. Aucun suivi des curseurs ou présence collaborative requis.
- Fonctionnement connecté uniquement : pas de mode hors ligne ni synchronisation différée requis.

8. Bibliothèque de fiches, données et recherche

- Bibliothèque de fiches par projet : PNJ, monstres, marchands, objets, lieux, règles/références, événements, notes, et types extensibles si nécessaire.
- Fiches réutilisables et relations entre fiches, liens cliquables, références croisées et ouverture de détails depuis un widget.
- Le comportement de consultation d'un widget est configurable : affichage direct, panneau latéral, infobulle ou fiche détaillée, selon sa nature.
- Un même objet métier peut être affiché par plusieurs widgets, avec une seule donnée source ; ses changements sont visibles partout dans le projet.
- Variables typées du projet, formules et calculs automatiques ; détecter/refuser les cycles de dépendance et valider les entrées. Aucun moteur de script libre requis pour les formules.
- Marchands : plusieurs marchands peuvent faire référence à un catalogue d'objets commun ; prix, descriptions, catégories, stocks et disponibilités. Une quantité propre au marchand ne doit pas écraser le modèle d'objet partagé.
- Notes/rappels : notes libres, listes, cases à cocher, couleurs, priorités et épinglage.
- Navigation rapide : recherche globale dans tous les Screens/fiches d'un projet avec catégories, filtres, raccourcis, aperçu des résultats, favoris, historique de consultation ; ouverture depuis la recherche sans quitter le Screen. Prévoir des liens cliquables entre Screens, un sélecteur de Screen et des raccourcis clavier de navigation.
- Palette de commandes au clavier pour retrouver une information ou créer rapidement une note/un widget.
- Widgets denses : sections repliables, onglets, recherche interne et raccourcis vers sections.
- Règles : tableaux et références consultables, liens vers les passages sources ; recherche dans les documents lorsque l'extraction documentaire avancée sera disponible.

9. Catalogue des 12 catégories de widgets — toutes requises pour la V1
1. Texte riche / notes : titres, listes, formatage, liens, blocs repliables, édition directe.
1. Images / illustrations / cartes : affichage, zoom et navigation simples. Pas de plateau tactique VTT, jetons ou brouillard de guerre.
1. Tableaux personnalisables : lignes, colonnes, cellules éditables, affichage lisible, copier/coller de tableaux.
1. Checklists / listes de tâches : cocher, décocher, ordonner, persister l'état.
1. Compteurs : PV, mana, ressources et valeurs modifiables, éventuellement liées à des variables.
1. Lanceur de dés : dés classiques et interactions de lancer accessibles rapidement ; aucune exigence de moteur de règles complet.
1. Initiative / combat : aide légère de référence et d'ordre de tour, éventuellement état simple ; ne pas en faire le centre du produit.
1. Fiches de PNJ / monstres : vues synthétiques avec accès aux fiches détaillées, champs personnalisables et références.
1. Horloges / chronomètres / minuteurs : fonctions simples, état partagé selon configuration.
1. Liens web / contenu intégré (iframe) : liens et contenus autorisés intégrables dans un cadre contrôlé ; prévoir refus gracieux quand un site interdit l'intégration.
1. Documents PDF : affichage et navigation dans un PDF existant, même si l'extraction/convertisseur PDF avancé arrive après V1.
1. Widgets personnalisés : HTML, CSS, JavaScript ou TypeScript selon un contrat défini, dans un environnement d'exécution isolé. Tous les widgets doivent définir : schéma de configuration, état persistant ou non, interactions disponibles, rendu numérique, rendu imprimable et comportements d'erreur. Les interactions non imprimables ont un équivalent statique cohérent.
1. Widgets personnalisés et sécurité du code utilisateur

- Création et édition du code directement dans l'application. Le choix validé ne requiert ni assistant IA, ni génération de code, ni extension IDE intégrée sophistiquée.
- L'utilisateur peut concevoir des widgets HTML/CSS/JS/TS complets, avec contrat de rendu/données/version explicite.
- Exécution isolée (par exemple iframe sandboxée d'origine distincte ou architecture au moins aussi restrictive) ; aucun accès au DOM hôte, aux secrets, aux cookies, aux API internes, aux données d'autres widgets, aux variables partagées ou aux fonctions privilégiées.
- Le widget personnalisé accède uniquement à ses propres données, via une interface contrôlée et validée. Il ne peut pas contourner les autorisations Convex.
- Pas d'accès réseau arbitraire par défaut, pas d'évaluation de code sur le serveur ; politique CSP stricte et isolation vérifiée avant publication.
- L'installation et l'exécution d'un widget communautaire contenant du code demandent un consentement explicite ; l'autorisation ne supprime pas le sandbox.
- CSS personnalisé limité au composant concerné, sans fuite vers les autres composants ou l'application.
- Prévoir messages d'erreurs lisibles, limites de ressources, validation des messages échangés, comportement de repli si un widget échoue.
- Aucune assistance IA : ni structuration de notes, ni génération de Screen, ni CSS/JS par IA dans le produit.

11. Copier/coller, importation et préparation rapide Le MJ dispose souvent de notes existantes dans d'autres outils. La priorité est de ne pas lui faire retaper ni structurer obligatoirement ses données.

- V1 : coller du texte enrichi en conservant raisonnablement formatages, listes, tableaux et images ; importer des images et du Markdown ; créer immédiatement un widget texte ou choisir une conversion en widget adapté.
- Conversion volontaire de contenu en liste/tableau/fiche, avec modèles et reconnaissance déterministe sans IA, prévisualisation et contrôle manuel.
- Préparation par modèles de disposition et glisser-déposer ; un import de fichier/widget à la fois (pas de traitement en lot requis).
- Toute importation de contenu est une copie indépendante de la source, pas une synchronisation avec Notion, Obsidian, Word, un lien ou un document tiers.
- Produit cible après V1 : extraction du contenu de fichiers PDF, Word, texte et autres documents prévus, conversion vers les widgets ; OCR facultatif pour PDF scannés. Ne pas confondre ceci avec le simple widget d'affichage PDF de la V1.
- Importation sûre : filtrage des contenus actifs, protection contre XSS, limites configurées, retour d'erreurs compréhensibles.

12. Impression, mise en page papier et exports

- A5, A4, A3 en portrait/paysage ; dimensions physiques exactes. Export de Screen individuel en PDF et image (PNG ou format adapté), et plusieurs Screens dans un même PDF.
- Chaque Screen dispose d'une disposition imprimable indépendante de ses profils numériques ; choisir les widgets visibles et leur position pour le papier.
- Respect des zones utiles / marges et aperçu avant impression ; pas de recadrage ou redimensionnement arbitraire des éléments.
- Pour un widget débordant, imprimer uniquement la portion visible à l'intérieur de ses dimensions. Ne pas étendre automatiquement son texte sur plusieurs pages.
- Les widgets interactifs se transforment en représentations statiques (valeur actuelle du compteur, cases cochées, note affichée, etc.) ; éviter boutons, barres d'outils et contrôles dans le rendu.
- Export sans altérer l'état interactif ni la disposition numérique.

13. Communauté, partage et modération

- Bibliothèque communautaire réservée aux comptes connectés ; rechercher les créations, catégories/tags, filtres, aperçus et favoris.
- Publication immédiate avec titre et description, contenant une copie complète du contenu sélectionné. Prévisualisation/confirmation avant publication pour éviter de révéler involontairement les secrets du MJ ; pas de filtrage automatique des notes secrètes imposé par défaut.
- Publier/importer des Screens, widgets, fiches et contenus réutilisables selon le type de publication ; copie indépendante lors de chaque import, sans filiation et sans mise à jour automatique.
- L'auteur peut mettre à jour sa publication ; historique public des versions. Les versions ne se propagent jamais aux copies déjà importées.
- Profils publics : pseudonyme, avatar/description si disponibles, publications et possibilité de s'abonner à des créateurs.
- Favoris, notes/évaluations et commentaires publics sur les publications.
- Signalements, suppression/modération et interface d'administration pour traiter les contenus signalés.
- Aucun partage privé ni invitation ; si un contenu est partagé, il l'est via publication communautaire.
- Un widget communautaire exécutable doit passer le contrôle de consentement décrit plus haut.

14. Stockage, sauvegardes et exploitation

- Sauvegarde automatique, historique et annuler/refaire dans l'éditeur ; pas d'historique de versions nommées de projets privés obligatoire. Ne pas confondre avec les versions publiques d'une publication.
- Corbeille avec restauration temporaire ; durée de rétention à paramétrer/choisir techniquement, à documenter, et non inventée ici.
- Archivage/restauration de projets ; export/import complet de projet.
- Limites de taille par type de fichier et quotas de stockage par utilisateur configurables ; stratégie de stockage conforme aux modules existants du boilerplate.
- Authentification et contrôle serveur sur toutes les mutations et lectures, y compris fichiers, copies, recherches, imports, exports, publications et suppressions.
- Connexion requise en permanence ; pas de fonction hors ligne.

15. Socle technique existant à respecter Le dépôt https://github.com/NathanDigiDev/boilerplate-v2.git est le point de départ, pas un simple exemple. Consulter ses fichiers réels avant toute décision d'architecture :

- TanStack Start/Router (navigation et SSR), pas Next.js par défaut.
- Convex (données métier, droits, temps réel) + intégration Convex/TanStack Query.
- Better Auth (connexion email/mot de passe).
- TanStack Form, @shared/zod, composants shadcn locaux/Base UI, Tailwind, Lucide.
- Outillage réellement installé : Oxlint/Ultracite, Oxfmt, Knip, Vitest, Playwright.
- Backend Convex, validations dans shared/, interface dans src/features/, routes légères dans src/routes/, sauf conventions actualisées prouvées par le dépôt.
- Consulter AGENTS.md, guides et Context7 selon la version des dépendances ; n'activer que les modules réellement nécessaires.
- Ne pas ajouter automatiquement de service WebSocket, deuxième base de données ou framework alternatif si le socle peut répondre au besoin.
- Le dépôt produit cible est https://github.com/HalTorns/Holysheet-GmScreen.git ; préserver l'histoire et les fichiers éventuellement existants, vérifier l'état des dépôts avant tout changement de remotes.

16. Délimitation de la V1 et des évolutions V1 exigée par le cadrage : bêta privée, authentification, projets/dossiers, fiches et variables, éditeur avancé avec placement libre et styles, les 12 catégories de widgets, widgets personnalisés sécurisés, pop-ups et synchronisation live, profils nommés, consultation/modification sur mobile, recherche/navigation, import de texte enrichi/images/Markdown, impression A5/A4/A3 avec mise en page indépendante, PDF individuel/multiple et export image, publication/import communautaires et fonctionnalités sociales/modération validées, sauvegarde et export/import des projets. Après V1, sans les oublier : extraction/conversion avancée des documents PDF et Word, OCR facultatif des scans, enrichissement de la recherche documentaire lié à leur indexation. La V1 doit néanmoins afficher les PDF via son widget dédié. Hors périmètre décidé : VTT tactique, suivi obligatoire de toutes les actions d'une session, collaboration live entre comptes, invitations et liens privés, organisations, IA intégrée de préparation ou de génération de CSS/widgets, fonctionnement hors ligne, synchronisation automatique avec les sources importées, filiation ou mise à jour automatique des copies communautaires.
17. Ordre de construction de la V1 L'ensemble des phases ci-dessous fait partie de la V1 souhaitée. Avancer par parcours bout-en-bout utilisables, testables et validés plutôt que produire seulement des écrans statiques.
18. Fondations : environnement du boilerplate, identité de l'application, authentification, projets, dossiers, contrôles d'accès.
19. Éditeur : création de Screen, formats, placement libre, calques/groupes, raccourcis, annuler/refaire, profils.
20. Contenus : fiches, relations, variables/formules, bibliothèque de projet, douze catégories de widgets natives et custom.
21. Utilisation live : pop-ups, modifications et synchronisation inter-fenêtres/appareils, verrouillage, ensembles de fenêtres.
22. Préparation et impression : presse-papiers/Markdown/images, recherche/palette de commandes, mise en page papier, PDF/images, multi-Screens.
23. Widgets programmables robustes : éditeur de code, sandbox, consentement, isolation, tests adversariaux ; anticiper l'isolation dès la phase des widgets et non à la fin.
24. Communauté : publications, import, versions, profils, abonnements, favoris, notes, commentaires, modération.
25. Stabilisation : tests bout-en-bout, sécurité, performance, fiabilisation multi-écrans et bêta privée. Les dépendances peuvent faire ajuster l'ordre, mais ne pas réduire silencieusement le périmètre de la V1. En cas de nécessité de séquencement, documenter précisément ce qui est prêt, partiel, non commencé et les blocages.
26. Scénarios d'acceptation et tests indispensables

- Un MJ inscrit se connecte, crée un projet et un Screen A4 paysage, y colle une note puis l'imprime avec un format réel A4 sans barre d'outils.
- Un MJ crée un Screen 1920×1080, place et redimensionne des widgets librement, enregistre, recharge et retrouve leur mise en page.
- Le même Screen possède deux profils de disposition nommés : la position des widgets diffère, mais une note ou un compteur conserve la même valeur.
- Une modification de note dans la pop-up A apparaît dans l'éditeur et la pop-up B, et inversement, puis sur un deuxième appareil connecté avec le même compte.
- Le Screen est verrouillé : le MJ coche une checklist sans déplacer la checklist accidentellement.
- Une fiche d'objet liée à plusieurs widgets est mise à jour une fois ; toutes ses vues se mettent à jour. Le stock de deux marchands reste distinct si les deux référencent le même type d'objet.
- La recherche trouve rapidement une fiche au sein du projet et l'affiche sans faire quitter le Screen actif.
- Le MJ exporte plusieurs Screens dans un seul PDF et peut importer/exporter un projet en conservant ses liens internes.
- Un widget personnalisé tente de lire le DOM parent, des secrets, un autre widget ou des données projet : accès refusé, aucune fuite. Une installation communautaire demande un consentement explicite.
- Un autre utilisateur non autorisé ne peut pas lire/modifier un projet privé en forgeant des identifiants Convex ou des URLs de ressources.
- La publication d'un Screen comporte une confirmation de son contenu ; son import produit une copie indépendante ; les modifications ou nouvelles versions de la publication source n'altèrent pas cette copie.
- Une suppression passe par la corbeille puis peut être restaurée dans la durée retenue.
- Le navigateur qui refuse ou redimensionne des pop-ups ne bloque pas l'accès au Screen ; une alternative manuelle est disponible.
- Les comportements d'erreur (fichier refusé, quota dépassé, formule cyclique, widget en erreur, PDF inaccessible) sont explicites et ne détruisent pas les données.

19. Décisions explicitement corrigées pendant le cadrage Ces points priment sur toute formulation antérieure contradictoire :
1. Jamais un VTT : le Screen sert de mémoire externe et d'accès rapide aux références du MJ.
1. Pas de collaboration live multi-utilisateurs, même si cela avait été envisagé ; partage uniquement communautaire sous forme de copies.
1. Aucune assistance IA, y compris création de Screen et CSS ; le code custom reste créé manuellement dans l'éditeur.
1. Bibliothèque par projet : pas de référentiel personnel global.
1. Pas de modèles distincts liés : simple duplication de Screens et import de créations publiées.
1. Impression indépendante des profils numériques ; seule la zone visible d'un widget est imprimée.
1. PDF affichable dès V1 mais extraction PDF/Word et OCR plus tard.
1. Tous les 12 widgets, code personnalisé et communauté dès V1, même si l'implémentation est découpée en phases.
1. Questions restantes et marge de manœuvre technique Le cadrage fonctionnel est arrêté. Ne reposer des questions que lorsqu'une décision modifie réellement le périmètre, le modèle d'accès ou une implémentation incontournable. Les paramètres non tranchés (nom de domaine final, quotas chiffrés, durée de corbeille, mode de stockage exact, limites d'exécution de code, stratégie de versionnement des données, taille maximale d'un document, détails d'identité visuelle) doivent être documentés comme hypothèses techniques réversibles dans docs/product.md / documents de décision, sans inventer de préférences utilisateur. Le texte de démarrage fourni séparément est la procédure opératoire Codex ; ce PRD est la référence pour les exigences produit.
