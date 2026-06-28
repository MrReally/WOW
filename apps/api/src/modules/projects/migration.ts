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
  operation_stage text NOT NULL DEFAULT 'prep'
             CHECK (operation_stage IN ('prep','pickup','delivery','mount','show','dismantle','return')),
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects.projects(status);
CREATE INDEX IF NOT EXISTS projects_window_idx ON projects.projects(starts_at, ends_at);
ALTER TABLE projects.projects ADD COLUMN IF NOT EXISTS operation_stage text NOT NULL DEFAULT 'prep';
ALTER TABLE projects.projects DROP CONSTRAINT IF EXISTS projects_operation_stage_check;
ALTER TABLE projects.projects ADD CONSTRAINT projects_operation_stage_check CHECK (operation_stage IN ('prep','pickup','delivery','mount','show','dismantle','return'));

CREATE TABLE IF NOT EXISTS projects.operation_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects.projects(id) ON DELETE CASCADE,
  from_stage  text CHECK (from_stage IN ('prep','pickup','delivery','mount','show','dismantle','return')),
  to_stage    text NOT NULL CHECK (to_stage IN ('prep','pickup','delivery','mount','show','dismantle','return')),
  actor_id    uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operation_events_project_idx ON projects.operation_events(project_id, created_at);

CREATE TABLE IF NOT EXISTS projects.operation_unit_marks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects.projects(id) ON DELETE CASCADE,
  stage      text NOT NULL CHECK (stage IN ('prep','pickup','delivery','mount','show','dismantle','return')),
  unit_id    uuid NOT NULL,
  status     text NOT NULL CHECK (status IN ('ready','packed','picked','missing','left','delivered','mounted','collected','broken','lost','returned')),
  actor_id   uuid,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, stage, unit_id)
);
ALTER TABLE projects.operation_unit_marks DROP CONSTRAINT IF EXISTS operation_unit_marks_stage_check;
ALTER TABLE projects.operation_unit_marks ADD CONSTRAINT operation_unit_marks_stage_check CHECK (stage IN ('prep','pickup','delivery','mount','show','dismantle','return'));
ALTER TABLE projects.operation_unit_marks DROP CONSTRAINT IF EXISTS operation_unit_marks_status_check;
ALTER TABLE projects.operation_unit_marks ADD CONSTRAINT operation_unit_marks_status_check CHECK (status IN ('ready','packed','picked','missing','left','delivered','mounted','collected','broken','lost','returned'));
CREATE INDEX IF NOT EXISTS operation_unit_marks_project_idx ON projects.operation_unit_marks(project_id, stage, updated_at);

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

CREATE TABLE IF NOT EXISTS projects.project_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects.projects(id) ON DELETE CASCADE,
  title        text NOT NULL,
  status       text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  assignee_id  uuid,
  timing_id    uuid REFERENCES projects.timings(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS project_tasks_project_idx ON projects.project_tasks(project_id, status);
CREATE INDEX IF NOT EXISTS project_tasks_assignee_idx ON projects.project_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS project_tasks_timing_idx ON projects.project_tasks(timing_id);

CREATE TABLE IF NOT EXISTS projects.project_checklist (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects.projects(id) ON DELETE CASCADE,
  group_key       text NOT NULL CHECK (group_key IN ('prep','pickup','delivery','mount','show','dismantle','return')),
  title           text NOT NULL,
  done            boolean NOT NULL DEFAULT false,
  done_by_user_id uuid,
  done_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE projects.project_checklist DROP CONSTRAINT IF EXISTS project_checklist_group_key_check;
ALTER TABLE projects.project_checklist ADD CONSTRAINT project_checklist_group_key_check CHECK (group_key IN ('prep','pickup','delivery','mount','show','dismantle','return'));
CREATE INDEX IF NOT EXISTS project_checklist_project_idx ON projects.project_checklist(project_id, group_key, created_at);

CREATE TABLE IF NOT EXISTS projects.project_roles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects.projects(id) ON DELETE CASCADE,
  title          text NOT NULL,
  required_count integer NOT NULL DEFAULT 1 CHECK (required_count > 0),
  rate_eur       numeric(12,2),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_roles_project_idx ON projects.project_roles(project_id, created_at);

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
ALTER TABLE projects.assignments ADD COLUMN IF NOT EXISTS role_id      uuid REFERENCES projects.project_roles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS assignments_role_idx ON projects.assignments(role_id);

-- Backfill staffing roles for legacy assignments. Keep this conservative:
-- one role per legacy assignment, so old costs and project membership survive.
INSERT INTO projects.project_roles (project_id, title, required_count, rate_eur, created_at)
SELECT a.project_id, COALESCE(NULLIF(a.role_note, ''), 'Роль'), 1, a.rate_eur, a.created_at
FROM projects.assignments a
WHERE a.role_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM projects.project_roles pr
    WHERE pr.project_id = a.project_id
      AND pr.title = COALESCE(NULLIF(a.role_note, ''), 'Роль')
      AND pr.required_count = 1
      AND pr.created_at = a.created_at
  );
UPDATE projects.assignments a
SET role_id = pr.id
FROM projects.project_roles pr
WHERE a.role_id IS NULL
  AND pr.project_id = a.project_id
  AND pr.title = COALESCE(NULLIF(a.role_note, ''), 'Роль')
  AND pr.required_count = 1
  AND pr.created_at = a.created_at;

-- Contractor (subrent) equipment used on a project. Not in our warehouse.
CREATE TABLE IF NOT EXISTS projects.contractor_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects.projects(id),
  contractor_id uuid NOT NULL,         -- opaque equipment.contractors id
  kind          text NOT NULL DEFAULT 'equipment' CHECK (kind IN ('equipment','delivery','setup')),
  name          text NOT NULL,
  qty           integer NOT NULL DEFAULT 1 CHECK (qty > 0),
  price_eur     numeric(12,2) NOT NULL DEFAULT 0,
  cost_eur      numeric(12,2) NOT NULL DEFAULT 0,
  note          text,
  returned_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE projects.contractor_items ADD COLUMN IF NOT EXISTS returned_at timestamptz;
ALTER TABLE projects.contractor_items ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'equipment';
ALTER TABLE projects.contractor_items DROP CONSTRAINT IF EXISTS contractor_items_kind_check;
ALTER TABLE projects.contractor_items ADD CONSTRAINT contractor_items_kind_check CHECK (kind IN ('equipment','delivery','setup'));
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
