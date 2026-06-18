export const projectsMigration = `
CREATE SCHEMA IF NOT EXISTS projects;

CREATE TABLE IF NOT EXISTS projects.clients (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  contacts   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects.projects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  client_id  uuid NOT NULL REFERENCES projects.clients(id),
  status     text NOT NULL DEFAULT 'draft'
             CHECK (status IN ('draft','confirmed','in_progress','completed','cancelled')),
  venue_id   uuid,                  -- opaque id (venues module, later phase)
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects.projects(status);
CREATE INDEX IF NOT EXISTS projects_window_idx ON projects.projects(starts_at, ends_at);

-- Hourly reservations. model_id is an opaque equipment id (no cross-schema FK).
CREATE TABLE IF NOT EXISTS projects.reservations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects.projects(id),
  model_id          uuid NOT NULL,
  qty               integer NOT NULL CHECK (qty > 0),
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  resolved_unit_ids uuid[] NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservations_model_idx ON projects.reservations(model_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS projects.timings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects.projects(id),
  title      text NOT NULL,
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL
);

-- People responsible for a timing block (opaque people ids).
CREATE TABLE IF NOT EXISTS projects.timing_assignees (
  timing_id uuid NOT NULL REFERENCES projects.timings(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL,
  PRIMARY KEY (timing_id, user_id)
);
CREATE INDEX IF NOT EXISTS timing_assignees_user_idx ON projects.timing_assignees(user_id);

CREATE TABLE IF NOT EXISTS projects.assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects.projects(id),
  user_id    uuid NOT NULL,         -- opaque people id
  role_note  text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assignments_user_idx ON projects.assignments(user_id);

-- Invitation flow: added directly, or invited → accepted / declined.
ALTER TABLE projects.assignments ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'added';
ALTER TABLE projects.assignments ADD COLUMN IF NOT EXISTS rate_eur     numeric(12,2);
ALTER TABLE projects.assignments ADD COLUMN IF NOT EXISTS invited_by   uuid;
ALTER TABLE projects.assignments ADD COLUMN IF NOT EXISTS responded_at timestamptz;

-- Contractor (subrent) equipment used on a project. Not in our warehouse.
CREATE TABLE IF NOT EXISTS projects.contractor_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects.projects(id),
  contractor_id uuid NOT NULL,         -- opaque equipment.contractors id
  name          text NOT NULL,
  qty           integer NOT NULL DEFAULT 1 CHECK (qty > 0),
  price_eur     numeric(12,2) NOT NULL DEFAULT 0,
  cost_eur      numeric(12,2) NOT NULL DEFAULT 0,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contractor_items_project_idx ON projects.contractor_items(project_id);
CREATE INDEX IF NOT EXISTS contractor_items_contractor_idx ON projects.contractor_items(contractor_id);

CREATE TABLE IF NOT EXISTS projects.problems (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,
  severity    text NOT NULL,
  title       text NOT NULL,
  detail      text NOT NULL,
  refs        jsonb NOT NULL DEFAULT '{}',
  resolved    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
`;
