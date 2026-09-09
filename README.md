# Labaïka SOURA

MVP sécurisé de messagerie scolaire pour le Lycée Privé Labaïka de Niaogho. Le projet fournit une application Web responsive installable, une cible Android via Capacitor, une API TypeScript et un schéma PostgreSQL multi-établissement.

## Démarrage local

Le guide complet, avec étapes Windows/macOS/Linux, Docker, Chrome, Android Studio, SDK et création d’APK est dans [docs/GUIDE_INSTALLATION_DETAILLE.md](docs/GUIDE_INSTALLATION_DETAILLE.md).

Prérequis : Node.js 22+, Docker et Docker Compose.

```bash
cp .env.example .env
# Remplacer impérativement JWT_SECRET.
docker compose up -d
npm install
npm run demo:seed # avec DATABASE_URL et DEMO_INITIAL_PASSWORD définis
npm run dev
```

- Web : `http://localhost:5173`
- API : `http://localhost:4000`
- Santé : `http://localhost:4000/health`

## Vérifications

```bash
npm test
npm run typecheck
npm run build
```

## Android

```bash
cd apps/web
npm run android:add
npm run android:sync
npm run android:open
```

Dans Android Studio, sélectionner **Build > Generate Signed Bundle / APK**. Utiliser un keystore détenu par l’établissement; ne jamais l’ajouter au dépôt. Avant une compilation pour appareil réel, définir `VITE_API_URL` avec l’URL HTTPS publique de l’API.

## Structure

- `apps/api` : API Fastify, authentification, autorisations, audit et idées.
- `apps/web` : interface React responsive et cible Capacitor Android.
- `database` : schéma PostgreSQL et amorçage.
- `docs` : architecture, sécurité, exploitation et matrice des droits.

## État de la V1

Le socle implémente les règles critiques : aucune inscription publique, session unique bloquante, cloisonnement par établissement, groupes attribués, interpellation adulte→élève, supervision motivée, audit immuable et dépôt d’idées découplé de l’identité. Les notifications push, réactions, épinglage et écran graphique complet d’administration sont préparés par le modèle de données/API mais restent des extensions avant pilote.

Ne pas utiliser avec des données réelles de mineurs avant revue juridique locale, test d’intrusion, paramétrage de rétention, sauvegarde restaurable et validation des contacts d’urgence.
