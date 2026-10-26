# Relais SMTP Infomaniak

Besoin : l’utilisateur utilise un relais SMTP Infomaniak et souhaite envoyer depuis `admin@holysheet.fr`. Le fournisseur Resend du socle ne répond pas à ce choix.

Décision : ajouter Nodemailer 10.2.1 et ses types, sans mise à niveau des autres dépendances. Une action Convex **interne**, dans un module `use node`, effectue l’envoi ; le runtime Node est présent dans l’image backend épinglée, vérifié sur l’image locale. Aucun serveur SMTP intermédiaire, endpoint public ou base supplémentaire.

Les actions d’email existantes conservent validation et quotas avant cet appel interne. L’hôte et les identifiants proviennent exclusivement de variables privées opérateur. TLS direct ou STARTTLS obligatoire, certificats vérifiés, TLS 1.2 minimum, délais bornés, logs SMTP désactivés et erreurs fournisseur remplacées par un message générique. Pièces jointes, lecture de fichiers et chargement d’URL ne font pas partie du contrat.

Coolify injecte les secrets uniquement dans le runtime `operations`. Une commande opérateur explicite valide la cible et transfère une liste fermée de valeurs vers les variables privées Convex. Les builds et le navigateur ne reçoivent aucun mot de passe SMTP ni clé admin. Les valeurs du développement ne sont pas copiées.

Context7 n’est pas disponible dans cette session ; les API sont vérifiées dans les versions installées et la [documentation SMTP Nodemailer](https://nodemailer.com/smtp), avec les [runtimes Convex](https://docs.convex.dev/functions/runtimes). L’envoi réel vers Infomaniak attend la configuration et le déploiement effectués par l’utilisateur.
