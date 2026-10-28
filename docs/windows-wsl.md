# Développement Windows avec WSL 2

Le checkout reste dans son dossier Windows. Les commandes du socle s’exécutent dans Ubuntu 24.04 avec Node 26.11.0 et pnpm 11.8.0. Docker Desktop fournit le moteur Linux et son intégration Ubuntu, activée dans Resources → WSL integration.

Depuis PowerShell dans le projet :

```powershell
powershell -File scripts/wsl.ps1 setup
powershell -File scripts/wsl.ps1 doctor
powershell -File scripts/wsl.ps1 dev
```

Pendant les modifications backend, ouvrir un second terminal :

```powershell
powershell -File scripts/wsl.ps1 backend:dev
```

Les commandes `services:up`, `services:down`, `services:status`, `backend:push`, `check` et `test:e2e:local` utilisent le même lanceur. Il appelle les wrappers du dépôt et conserve leurs contrôles de cible/propriété. Il n’effectue ni déploiement distant ni réinitialisation.

## Dépendances et secrets

- Les anciens modules Windows restent dans `node_modules.windows/`, ignoré par Git. Ne pas les charger depuis Linux.
- Les modules Linux utilisent `node_modules/`, avec magasin virtuel dans `/opt/holysheet-tools/holysheet-dependencies`. Pour réinstaller depuis Ubuntu, utiliser `pnpm install --frozen-lockfile --virtual-store-dir /opt/holysheet-tools/holysheet-dependencies`.
- Le lien `/opt/holysheet-tools/node_modules` pointe vers le `node_modules` de ce checkout, pour que les dépendances du magasin externe retrouvent les dépendances directes et leurs types. Il appartient à ce projet uniquement.
- Le runtime Node Linux est dans `/opt/holysheet-tools/node-v26.11.0-linux-x64`. Les liens `node`, `npm` et `pnpm` sont disponibles dans `/usr/local/bin`.
- Le montage Windows utilise les métadonnées de permissions WSL : les fichiers `.env.local` et `.env.docker` doivent rester privés, mode `600`, et ignorés par Git. Ne jamais les recopier entre projets.
- Les commandes ci-dessus utilisent explicitement l’utilisateur root de cette nouvelle distribution. Un passage à un utilisateur Linux dédié devra transférer les permissions des outils et du cache avant utilisation.

Le premier setup et les vérifications effectives sont consignés dans [l’état local](archive/local-setup-status.md). Les données du projet restent dans ses volumes Docker dédiés. Un arrêt normal passe par `services:down` et conserve ces volumes.

Le setup du produit active `AUTH_PASSWORD_ONLY=true` dans le backend local : inscription, vérification d’adresse, connexion email/mot de passe et récupération par code. La vérification ne connecte pas l’utilisateur ; une récupération invalide ses sessions existantes. Les endpoints OTP de connexion, passkeys et fournisseurs sociaux sont fermés dans ce mode. Configurer aussi cette politique sur la cible de production avant toute ouverture.
