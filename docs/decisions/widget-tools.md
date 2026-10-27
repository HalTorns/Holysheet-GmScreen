# Outils d’édition, styles et corbeille

## Périmètre

Après l’éditeur de notes, compléter duplication, copier-coller dans la vue, suppression restaurable, groupes, alignement et styles. Les fiches/variables et catégories supplémentaires restent la tranche suivante. Les styles CSS libres, guides visuels, menus contextuels et raccourcis étendus restent à implémenter pour terminer l’éditeur V1.

Les styles et identifiants de groupe sont optionnels dans les placements existants : chaque profil peut avoir sa présentation, le contenu des notes reste commun. L’absence de style utilise le thème par défaut ; aucun effacement ou migration des notes existantes. Couleurs hexadécimales, trois familles de polices et valeurs numériques bornées uniquement ; aucune URL, règle CSS ou exécution de code fournie par l’utilisateur.

## Sélection et groupes

Sélection par cases à cocher. Sans sélection cochée, les outils agissent sur la note active. Les groupes se déplacent par une translation commune, bornée aux coordonnées autorisées, au pointeur, au clavier et via X/Y. Chaque note garde son redimensionnement indépendant. L’alignement considère un groupe entier comme un bloc et préserve ses décalages internes. La distribution nécessite trois blocs et assez d’espace pour un espacement non négatif.

La duplication, la suppression et les styles portent sur les notes sélectionnées explicitement. Grouper fusionne les groupes concernés ; dégrouper détache leurs membres. Les copies sont des notes indépendantes, avec styles et géométries copiés dans les profils mais sans appartenance au groupe d’origine.

Le presse-papiers est éphémère dans la vue, sans stockage navigateur ni accès au presse-papiers système. Il conserve les IDs et versions de contenu sélectionnées ; coller vérifie ces versions puis copie le contenu et les placements courants. Un changement de contenu ou une suppression depuis la copie refuse le collage. Changer de profil ou recharger abandonne cette copie locale. Le copier-coller inter-Screens et le collage du contenu externe restent des tranches ultérieures.

## Suppression et restauration

La corbeille conserve `gmNotes` avec `deletedAt` et ses anciens placements dans les profils. L’index `by_screen_live` distingue les notes actives des notes supprimées ; les lectures actives existantes utilisent `deletedAt` absent, compatible avec les anciennes données. Chaque opération vérifie la session, le propriétaire, le Screen, le verrouillage et les versions attendues. Une note supprimée refuse toute édition de contenu ou restauration de son historique jusqu’à sa restauration explicite.

Retirer une note met à jour atomiquement toutes les dispositions, papier compris, sans déplacer les autres notes. La restauration retrouve ses anciens placements et styles, ou un placement initial dans les profils créés depuis ; elle la détache des groupes et la met au premier plan. Elle conserve le contenu et son historique. Restaurer une ancienne disposition ne ressuscite jamais une note supprimée ou effacée.

Limites techniques réversibles : 100 notes actives et 100 notes dans la corbeille par Screen ; lots de 20 notes au plus pour copie/suppression ; budget `resourceWrite` existant. Pas de purge automatique ni durée de conservation inventée. Une corbeille pleine refuse une nouvelle suppression. L’effacement définitif exige une confirmation explicite dans l’interface, ne concerne que les notes déjà supprimées et retire leur historique de contenu dans une transaction bornée. Les sauvegardes historiques restent indépendantes de cet effacement.

Les modifications de placements alimentent l’historique existant. Annuler/refaire de disposition ne remplace pas restaurer une note depuis la corbeille. Les brouillons et opérations en cours bloquent les changements de profil/mode et bénéficient du garde de navigation. Le verrouillage refuse aussi copie structurelle, restauration et effacement ; lecture seule interdit les écritures de cette vue.

## Cycle de vie et validation

Aucune nouvelle table ni dépendance. Export et nettoyage du compte incluent les notes supprimées et leurs placements via les collections existantes. La restauration réelle doit inclure styles, groupes et une note en corbeille. Tests Convex pour droits, versions, bornes, copie indépendante, restauration et nettoyage ; tests de géométrie pour conservation des groupes aux limites et distribution ; E2E pour les contrôles réels et le rendu de texte.

Context7 indisponible dans la session : réutilisation des API Convex 1.46, React 19.3 et composants déjà employés dans l’éditeur, types installés et versions conservées. Aucun changement d’API d’authentification ni activation d’intégration externe.
