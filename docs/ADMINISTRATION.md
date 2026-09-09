# Notice d’administration

L’API d’administration exige le rôle `ADMIN_PRINCIPAL` et écrit chaque action sensible dans `audit`.

- Créer un compte : `POST /admin/users` avec identifiant, nom, rôle, classe éventuelle et mot de passe initial de 12 caractères minimum.
- Suspendre/réactiver : `PATCH /admin/users/:id/status`. Une suspension révoque immédiatement toutes les sessions.
- Sessions actives : `GET /admin/sessions`; révocation par `DELETE /admin/sessions/:id`.
- Lire les idées : `GET /admin/ideas`; répondre via `POST /admin/ideas/:id/respond`.
- Superviser un espace non attribué : `GET /spaces/:id/messages?motif=...` avec un motif explicite de 10 caractères minimum.

Pour créer classes et espaces au lancement, utiliser des migrations SQL révisées à quatre yeux. Un écran d’administration graphique et les délégations fines sont à ajouter avant généralisation.
