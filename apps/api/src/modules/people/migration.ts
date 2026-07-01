export const peopleMigration = `
CREATE SCHEMA IF NOT EXISTS people;

CREATE TABLE IF NOT EXISTS people.roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  permissions text[] NOT NULL DEFAULT '{}',
  is_system   boolean NOT NULL DEFAULT false,
  is_owner    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS people.users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                text UNIQUE,
  telegram_id          text UNIQUE,
  display_name         text NOT NULL,
  role_id              uuid REFERENCES people.roles(id),
  password_hash        text,
  must_change_password boolean NOT NULL DEFAULT false,
  hourly_rate_eur      numeric(12,2),
  calendar_token       text UNIQUE,
  is_system            boolean NOT NULL DEFAULT false,
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS people.sessions (
  token      text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES people.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON people.sessions(user_id);

-- Migrate a legacy users table (pre-roles) in place, if present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='people' AND table_name='users' AND column_name='role'
  ) THEN
    ALTER TABLE people.users ADD COLUMN IF NOT EXISTS email text;
    ALTER TABLE people.users ADD COLUMN IF NOT EXISTS role_id uuid;
    ALTER TABLE people.users ADD COLUMN IF NOT EXISTS password_hash text;
    ALTER TABLE people.users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
    ALTER TABLE people.users ADD COLUMN IF NOT EXISTS calendar_token text UNIQUE;
    BEGIN ALTER TABLE people.users ALTER COLUMN telegram_id DROP NOT NULL; EXCEPTION WHEN others THEN END;
    BEGIN ALTER TABLE people.users ALTER COLUMN role DROP NOT NULL; EXCEPTION WHEN others THEN END;
  END IF;
END $$;

ALTER TABLE people.users ADD COLUMN IF NOT EXISTS calendar_token text UNIQUE;
ALTER TABLE people.users ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
ALTER TABLE people.users ADD COLUMN IF NOT EXISTS document_number text;
ALTER TABLE people.users ADD COLUMN IF NOT EXISTS document_photo_url text;
ALTER TABLE people.users ADD COLUMN IF NOT EXISTS languages text;
ALTER TABLE people.users ADD COLUMN IF NOT EXISTS about text;
ALTER TABLE people.users ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE people.users ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE people.users ADD COLUMN IF NOT EXISTS use_photo_as_avatar boolean NOT NULL DEFAULT false;
ALTER TABLE people.users ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE people.users ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE people.users ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE people.users ADD COLUMN IF NOT EXISTS patronymic text;
ALTER TABLE people.users ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE people.users ADD COLUMN IF NOT EXISTS operations_show_all_projects boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS people.crew_applications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id         text NOT NULL,
  telegram_username   text,
  first_name          text NOT NULL,
  last_name           text NOT NULL,
  patronymic          text,
  nickname            text NOT NULL,
  email               text NOT NULL,
  birth_date          date NOT NULL,
  languages           text NOT NULL,
  about               text NOT NULL,
  source              text NOT NULL,
  photo_file_id       text NOT NULL,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  reviewed_by_user_id uuid,
  reviewed_at         timestamptz,
  created_user_id     uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crew_applications_status_idx ON people.crew_applications(status, created_at DESC);
CREATE INDEX IF NOT EXISTS crew_applications_telegram_idx ON people.crew_applications(telegram_id, created_at DESC);
`;
