CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TYPE role_utilisateur AS ENUM ('ELEVE','PROFESSEUR','ADMINISTRATION','ADMIN_PRINCIPAL');
CREATE TYPE type_espace AS ENUM ('CLASSE','MATIERE','GENERAL_ELEVES','PERSONNEL','PRIVE_ADULTES','INTERPELLATION');

CREATE TABLE etablissements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nom text NOT NULL, slug text UNIQUE NOT NULL,
  actif boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), etablissement_id uuid NOT NULL REFERENCES etablissements(id),
  nom text NOT NULL, UNIQUE(etablissement_id,nom)
);
CREATE TABLE utilisateurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), etablissement_id uuid NOT NULL REFERENCES etablissements(id),
  classe_id uuid REFERENCES classes(id), identifiant text UNIQUE NOT NULL, nom_affichage text NOT NULL,
  role role_utilisateur NOT NULL, password_hash text NOT NULL, actif boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role='ELEVE' AND classe_id IS NOT NULL) OR role<>'ELEVE')
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), utilisateur_id uuid NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE UNIQUE INDEX une_session_active_par_compte ON sessions(utilisateur_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_expiration ON sessions(expires_at);

CREATE TABLE espaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), etablissement_id uuid NOT NULL REFERENCES etablissements(id),
  nom text NOT NULL, type type_espace NOT NULL, classe_id uuid REFERENCES classes(id), cree_par uuid REFERENCES utilisateurs(id),
  ecriture_fermee boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE espace_membres (
  espace_id uuid NOT NULL REFERENCES espaces(id) ON DELETE CASCADE,
  utilisateur_id uuid NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  peut_moderer boolean NOT NULL DEFAULT false,
  PRIMARY KEY(espace_id,utilisateur_id)
);
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), etablissement_id uuid NOT NULL REFERENCES etablissements(id),
  espace_id uuid NOT NULL REFERENCES espaces(id) ON DELETE CASCADE, auteur_id uuid NOT NULL REFERENCES utilisateurs(id),
  contenu varchar(4000) NOT NULL CHECK(length(trim(contenu))>0), reponse_a uuid REFERENCES messages(id),
  created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, deleted_by uuid REFERENCES utilisateurs(id)
);
CREATE INDEX messages_espace_date ON messages(espace_id,created_at);
CREATE TABLE reactions (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  utilisateur_id uuid NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  emoji varchar(16) NOT NULL CHECK(emoji IN ('👍','❤️','👏','✅','🙏')),
  PRIMARY KEY(message_id,utilisateur_id,emoji)
);
CREATE TABLE signalements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), etablissement_id uuid NOT NULL REFERENCES etablissements(id),
  message_id uuid NOT NULL REFERENCES messages(id), signale_par uuid NOT NULL REFERENCES utilisateurs(id),
  motif varchar(500) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), traite_at timestamptz,
  UNIQUE(message_id,signale_par)
);

-- Aucun auteur, utilisateur, IP, user-agent ou appareil ne figure dans ces tables.
CREATE TABLE idee_jetons (
  token_hash char(64) PRIMARY KEY, etablissement_id uuid NOT NULL REFERENCES etablissements(id),
  expires_at timestamptz NOT NULL
);
CREATE TABLE idees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), etablissement_id uuid NOT NULL REFERENCES etablissements(id),
  contenu varchar(4000) NOT NULL, code_suivi_hash char(64) UNIQUE NOT NULL,
  reponse varchar(4000), created_at timestamptz NOT NULL DEFAULT now(), answered_at timestamptz
);

CREATE TABLE audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, etablissement_id uuid NOT NULL REFERENCES etablissements(id),
  acteur_id uuid REFERENCES utilisateurs(id), action text NOT NULL, cible_id uuid, motif text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(action<>'SUPERVISION_LECTURE' OR length(trim(motif))>=10)
);
CREATE OR REPLACE FUNCTION audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Le journal d audit est immuable'; END $$;
CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON audit FOR EACH ROW EXECUTE FUNCTION audit_immutable();

-- L'isolation établissement est appliquée par l'API et par les clés étrangères.
-- Un rôle PostgreSQL applicatif à privilèges minimaux est obligatoire en production.
