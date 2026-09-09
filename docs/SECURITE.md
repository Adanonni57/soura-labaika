# Sécurité et mise en production

## Contrôles déjà présents

- Hash Argon2id paramétrable, mot de passe initial à changer.
- Cookie de session `HttpOnly`, `SameSite=Strict`, `Secure` en production et durée courte.
- Refus transactionnel d’une deuxième session; l’ancienne n’est pas expulsée.
- Validation Zod et requêtes PostgreSQL paramétrées.
- En-têtes Helmet, CORS explicite, limites de débit globales et renforcées sur connexion/idées.
- Autorisations serveur et filtre `etablissement_id`.
- Audit non modifiable au niveau PostgreSQL et motif d’au moins dix caractères pour toute supervision.
- Aucun stockage d’auteur dans la table d’idées; jetons et codes conservés sous forme SHA-256.
- Secrets et projets Android générés exclus de Git.

## Obligatoire avant données réelles

1. Héberger uniquement en HTTPS, dans une région et sous un contrat compatibles avec le droit applicable au Burkina Faso et les règles de l’établissement.
2. Créer un rôle PostgreSQL applicatif non propriétaire, avec privilèges minimaux. Restreindre l’accès réseau à la base.
3. Exclure `/ideas`, `/ideas/token` et leurs corps des journaux du proxy, de l’APM et des traces distribuées. Ne jamais activer de replay de session sur cet écran.
4. Définir les durées de conservation avec la direction et le conseil juridique; automatiser purge des messages, sessions, jetons expirés et audits selon cette politique.
5. Remplacer le numéro fictif du bouton urgence dans `apps/web/src/main.tsx`.
6. Configurer sauvegardes chiffrées, tester une restauration, centraliser les alertes sans contenu de message.
7. Faire réaliser revue de code, analyse de dépendances, SAST/DAST et test d’intrusion indépendant.
8. Ajouter rotation des secrets, MFA pour l’administrateur principal et récupération de compte hors bande.

## En-têtes proxy recommandés

`Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy: no-referrer` et désactivation du cache sur les réponses authentifiées.

## Menaces résiduelles

Un code de suivi perdu n’est pas récupérable sans compromettre l’anonymat. Une personne ayant accès à l’appareil peut le lire dans le stockage local. Les métadonnées réseau peuvent exister chez un opérateur ou un hébergeur même si l’application ne les conserve pas; l’établissement ne doit donc jamais promettre un anonymat absolu face à ces tiers.
