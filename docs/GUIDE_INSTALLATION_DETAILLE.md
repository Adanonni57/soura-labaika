# Guide d’installation détaillé — Labaïka SOURA

Ce guide permet de lancer la version Web sur Chrome et de produire un APK Android de test. Il est prévu pour un ordinateur; un téléphone seul ne suffit pas pour compiler l’APK.

## 1. Ce qu’il faut avant de commencer

Prévoir au minimum 15 Go d’espace libre, une connexion Internet et un compte administrateur sur l’ordinateur.

Installer les logiciels suivants :

| Logiciel | Version attendue | Où vérifier après installation |
|---|---:|---|
| Google Chrome | récente | ouvrir Chrome |
| Node.js | 22 ou plus récent | `node --version` |
| Docker Desktop | récente | `docker --version` |
| Android Studio | récente | ouvrir Android Studio |
| Android SDK | API 35 ou version installée par Android Studio | Android Studio > SDK Manager |
| JDK | 17 (fourni avec Android Studio suffit) | Android Studio > Settings > Build Tools > Gradle |

Sur Windows, utilisez de préférence PowerShell. Sous macOS ou Linux, utilisez Terminal.

## 2. Télécharger et décompresser le projet

1. Téléchargez `Labaika_SOURA_V1_source.zip` depuis le lien Drive dans Chrome.
2. Dans le dossier Téléchargements, cliquez droit sur le ZIP puis choisissez **Extraire tout**.
3. Choisissez un dossier simple, par exemple `C:\Projets\Labaika-SOURA` sous Windows, ou `~/Projets/Labaika-SOURA` sur macOS/Linux.
4. Ouvrez le dossier extrait. Vous devez y voir notamment `package.json`, `docker-compose.yml`, `apps`, `database` et `docs`.

Ne mettez pas le projet dans OneDrive, Google Drive synchronisé ou un dossier dont le nom contient des caractères inhabituels : cela peut gêner Android Studio.

## 3. Ouvrir un terminal dans le dossier du projet

### Windows

Dans l’Explorateur de fichiers, ouvrez le dossier du projet. Cliquez dans la barre d’adresse, tapez `powershell`, puis appuyez sur Entrée.

Exemple :

```powershell
cd C:\Projets\Labaika-SOURA
```

### macOS / Linux

```bash
cd ~/Projets/Labaika-SOURA
```

Vérifiez que vous êtes au bon endroit :

```bash
node --version
npm --version
docker --version
```

Si une commande n’est pas reconnue, installez le logiciel correspondant puis fermez et rouvrez le terminal.

## 4. Créer la configuration locale

Le fichier `.env` contient les réglages locaux. Il n’est jamais à envoyer par e-mail, WhatsApp ou GitHub.

### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

### macOS / Linux

```bash
cp .env.example .env
```

Ouvrez ensuite `.env` dans un éditeur de texte et remplacez cette valeur :

```text
JWT_SECRET=replace-with-at-least-32-random-characters
```

par une longue phrase secrète aléatoire de plus de 32 caractères. Exemple de forme (ne pas recopier cet exemple) :

```text
JWT_SECRET=une-phrase-secrete-longue-et-unique-a-remplacer-absolument
```

Pour un premier lancement sur le même ordinateur, conservez les autres valeurs telles quelles, notamment :

```text
DATABASE_URL=postgres://soura:soura@localhost:5432/soura
VITE_API_URL=http://localhost:4000
```

## 5. Installer les dépendances du projet

Dans le terminal, à la racine du projet :

```bash
npm install
```

Attendez la fin de la commande. Elle doit se terminer sans message `npm error`. Cette étape peut prendre plusieurs minutes lors du premier lancement.

## 6. Démarrer la base de données PostgreSQL

1. Ouvrez Docker Desktop et attendez le message indiquant que Docker est démarré.
2. Dans le terminal du projet, lancez :

```bash
docker compose up -d
```

3. Vérifiez l’état :

```bash
docker compose ps
```

Le service `postgres` doit apparaître comme démarré (`running` ou `Up`). Au premier démarrage, Docker crée automatiquement la base, les tables et l’établissement de démonstration.

En cas de problème, affichez les journaux :

```bash
docker compose logs postgres
```

Pour arrêter uniquement la base après vos essais :

```bash
docker compose down
```

N’utilisez pas `docker compose down -v` sauf si vous acceptez de supprimer complètement les données locales de test.

## 7. Créer les comptes de démonstration

Choisissez un mot de passe temporaire de démonstration d’au moins 12 caractères. Il ne sera pas affiché à l’écran : notez-le dans un endroit sûr.

### Windows PowerShell

```powershell
$env:DEMO_INITIAL_PASSWORD="VotreMotDePasseTemporaire12!"
npm run demo:seed
```

### macOS / Linux

```bash
DEMO_INITIAL_PASSWORD='VotreMotDePasseTemporaire12!' npm run demo:seed
```

La commande crée ces comptes fictifs :

| Rôle | Identifiant |
|---|---|
| Élève | `eleve.demo` |
| Professeur | `prof.demo` |
| Administration | `administration.demo` |
| Administrateur principal | `admin.demo` |

Ils utilisent tous le mot de passe temporaire que vous venez de choisir. À la première connexion, changez le mot de passe depuis l’application dès que l’écran correspondant est activé pour le pilote.

## 8. Lancer l’application Web

Dans le même terminal, lancez :

```bash
npm run dev
```

Laissez ce terminal ouvert. Attendez les deux adresses suivantes :

```text
API : http://localhost:4000
Web : http://localhost:5173
```

Dans Chrome, ouvrez :

```text
http://localhost:5173
```

Connectez-vous avec `admin.demo` et le mot de passe temporaire choisi à l’étape 7.

### Vérifications minimales dans Chrome

1. La page de connexion s’affiche.
2. Une connexion avec le bon compte fonctionne.
3. Un second essai avec le même compte depuis une fenêtre de navigation privée doit être refusé par le message « compte déjà connecté ailleurs ».
4. Déconnectez-vous, puis reconnectez-vous : la connexion doit de nouveau fonctionner.
5. Testez la boîte à idées avec un compte fictif et conservez le code de suivi affiché.

Pour arrêter l’application, revenez dans le terminal et appuyez sur `Ctrl+C`.

## 9. Préparer Android Studio et le SDK Android

1. Ouvrez Android Studio.
2. À l’écran d’accueil, cliquez sur **More Actions > SDK Manager**.
3. Dans **SDK Platforms**, cochez au moins une version Android récente, idéalement Android 15 / API 35.
4. Dans **SDK Tools**, cochez **Android SDK Build-Tools**, **Android SDK Platform-Tools** et **Android SDK Command-line Tools (latest)**.
5. Cliquez sur **Apply**, puis attendez la fin du téléchargement.
6. Dans **Settings > Build, Execution, Deployment > Build Tools > Gradle**, sélectionnez le JDK 17 fourni avec Android Studio.

## 10. Générer le projet Android

L’application Android reprend l’interface Web grâce à Capacitor.

Dans un nouveau terminal, à la racine du projet :

```bash
cd apps/web
npm run android:add
npm run android:sync
```

La première commande crée le dossier `apps/web/android`. Ne la relancez pas si ce dossier existe déjà; dans ce cas, lancez seulement `npm run android:sync`.

Important : avant de produire un APK utilisable sur un téléphone, remplacez dans `.env` :

```text
VITE_API_URL=http://localhost:4000
```

par l’adresse HTTPS publique de l’API, par exemple :

```text
VITE_API_URL=https://api.exemple-ecole.bf
```

`localhost` fonctionne sur l’ordinateur, mais pas sur le téléphone. Rejouez ensuite `npm run android:sync`.

## 11. Compiler et tester l’APK debug

Ouvrez le projet Android :

```bash
npm run android:open
```

Dans Android Studio :

1. Attendez la fin de la synchronisation Gradle.
2. Ouvrez le terminal intégré d’Android Studio, placé dans `apps/web/android`.
3. Exécutez :

```bash
./gradlew :app:assembleDebug
```

Sous Windows PowerShell, exécutez plutôt :

```powershell
.\gradlew.bat :app:assembleDebug
```

L’APK de test est créé ici :

```text
apps/web/android/app/build/outputs/apk/debug/app-debug.apk
```

Pour l’installer sur un téléphone Android, activez temporairement l’installation depuis la source utilisée (Chrome, Gestionnaire de fichiers ou Android Studio), copiez l’APK puis ouvrez-le sur le téléphone.

## 12. Produire un APK signé pour distribution

Ne partagez jamais votre fichier keystore ni ses mots de passe.

Dans Android Studio :

1. Cliquez sur **Build > Generate Signed Bundle / APK**.
2. Choisissez **APK**, puis **Next**.
3. Créez un nouveau keystore ou choisissez le keystore officiel détenu par l’établissement.
4. Conservez le keystore hors du projet et dans une sauvegarde chiffrée.
5. Choisissez le type `release` et cliquez sur **Create**.
6. Android Studio indique le chemin du fichier final.

Avant toute diffusion, vérifiez que l’APK pointe vers une API HTTPS réelle, que le numéro « Urgence ou danger » est remplacé par le numéro officiel de l’établissement, et que les comptes de démonstration ne sont pas conservés en production.

## 13. Commandes de contrôle avant livraison

À la racine du projet :

```bash
npm test
npm run typecheck
npm run build
```

Les trois commandes doivent se terminer sans erreur. Vérifiez aussi manuellement l’APK avec `:app:assembleDebug` dans Android Studio.

## 14. Dépannage rapide

| Problème | Cause probable | Action |
|---|---|---|
| `docker` non reconnu | Docker Desktop absent ou arrêté | Installez/démarrez Docker Desktop, puis rouvrez le terminal |
| Port 5432 déjà utilisé | Une autre base PostgreSQL utilise le port | Arrêtez l’autre service ou adaptez `docker-compose.yml` et `.env` ensemble |
| Port 5173/4000 déjà utilisé | Une autre application est ouverte | Arrêtez-la, ou modifiez les ports et les URLs correspondantes |
| Connexion refusée | Base non démarrée ou comptes non créés | Lancez `docker compose up -d`, puis l’étape 7 |
| Le téléphone n’accède pas à l’API | URL `localhost` utilisée | Déployez l’API HTTPS, mettez son URL dans `VITE_API_URL`, puis synchronisez Android |
| Gradle échoue | SDK ou JDK manquant | Reprenez l’étape 9 et installez API 35 + Build-Tools + JDK 17 |
| `android:add` échoue | Dépendances non installées | Revenez à la racine et exécutez `npm install` |

## 15. Passage en production : arrêt obligatoire avant données d’élèves

Ne chargez aucune donnée réelle d’élève avant : validation juridique et politique de conservation, hébergement HTTPS, sauvegardes chiffrées testées, revue de code, test d’intrusion, choix du contact d’urgence officiel et création d’un rôle PostgreSQL de production à privilèges minimaux. Consultez aussi `docs/SECURITE.md`.
