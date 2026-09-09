# Matrice des autorisations

| Action | Élève | Professeur | Administration | Admin principal |
|---|---:|---:|---:|---:|
| Lire/écrire ses groupes attribués | Oui | Oui | Oui | Oui |
| Voir une autre classe | Non | Si attribué | Si délégué | Oui, avec motif journalisé |
| Initier un privé | Non | Adultes + élève | Adultes + élève | Adultes + élève |
| Répondre à une interpellation reçue | Oui | Oui | Oui | Oui |
| Groupe personnel | Non | Oui | Oui | Oui |
| Déposer une idée | Oui | Oui | Oui | Oui |
| Lire/répondre aux idées | Non | Non | Non | Oui |
| Créer/suspendre un compte | Non | Non | Selon future délégation | Oui |
| Voir/révoquer les sessions | Non | Non | Non | Oui |

Les tests automatiques de `apps/api/test/policy.test.ts` couvrent les invariants les plus sensibles. Toute nouvelle route doit réutiliser les fonctions de politique ou ajouter un test équivalent.
