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
             CHECK (status IN ('draft','confirmed','in_progress','awaiting_payment','completed','cancelled')),
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
ALTER TABLE projects.projects ADD COLUMN IF NOT EXISTS warehouse_turnover_completed_at timestamptz;
ALTER TABLE projects.projects ADD COLUMN IF NOT EXISTS finance_tracked boolean NOT NULL DEFAULT true;
ALTER TABLE projects.projects ADD COLUMN IF NOT EXISTS dry_rental boolean NOT NULL DEFAULT false;
ALTER TABLE projects.projects ADD COLUMN IF NOT EXISTS service_mode text;
UPDATE projects.projects
SET service_mode=CASE WHEN dry_rental THEN 'dry_rental_pickup' ELSE 'full_service' END
WHERE service_mode IS NULL;
ALTER TABLE projects.projects ALTER COLUMN service_mode SET DEFAULT 'full_service';
ALTER TABLE projects.projects ALTER COLUMN service_mode SET NOT NULL;
ALTER TABLE projects.projects DROP CONSTRAINT IF EXISTS projects_service_mode_check;
ALTER TABLE projects.projects ADD CONSTRAINT projects_service_mode_check CHECK (service_mode IN ('full_service','dry_rental_pickup','dry_rental_delivery'));
ALTER TABLE projects.projects ADD COLUMN IF NOT EXISTS dress_code_option_id uuid;
ALTER TABLE projects.projects ADD COLUMN IF NOT EXISTS dress_code_label text;
ALTER TABLE projects.projects ADD COLUMN IF NOT EXISTS dress_code_uniform boolean NOT NULL DEFAULT false;
ALTER TABLE projects.projects ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE projects.projects ADD COLUMN IF NOT EXISTS base_name text;
UPDATE projects.projects SET base_name=name WHERE base_name IS NULL;
ALTER TABLE projects.projects ALTER COLUMN base_name SET NOT NULL;
ALTER TABLE projects.projects ALTER COLUMN starts_at DROP NOT NULL;
ALTER TABLE projects.projects ALTER COLUMN ends_at DROP NOT NULL;
ALTER TABLE projects.projects ADD COLUMN IF NOT EXISTS series_id uuid;
ALTER TABLE projects.projects ADD COLUMN IF NOT EXISTS series_occurrence_key text;
ALTER TABLE projects.projects ADD COLUMN IF NOT EXISTS series_template_version integer;
ALTER TABLE projects.projects ADD COLUMN IF NOT EXISTS series_baseline jsonb;
ALTER TABLE projects.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects.projects ADD CONSTRAINT projects_status_check CHECK (status IN ('draft','confirmed','in_progress','awaiting_payment','completed','cancelled'));
ALTER TABLE projects.projects DROP CONSTRAINT IF EXISTS projects_operation_stage_check;
ALTER TABLE projects.projects ADD CONSTRAINT projects_operation_stage_check CHECK (operation_stage IN ('prep','pickup','delivery','mount','show','dismantle','return'));

CREATE TABLE IF NOT EXISTS projects.project_series (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  template_project_id uuid NOT NULL REFERENCES projects.projects(id),
  frequency           text NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  interval_count      integer NOT NULL DEFAULT 1 CHECK (interval_count > 0),
  weekdays            integer[] NOT NULL DEFAULT '{}',
  end_mode            text NOT NULL DEFAULT 'never' CHECK (end_mode IN ('never','until','count')),
  until_at            timestamptz,
  occurrence_count    integer,
  time_zone           text NOT NULL DEFAULT 'Europe/Belgrade',
  active              boolean NOT NULL DEFAULT true,
  template_version    integer NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK ((end_mode <> 'until') OR until_at IS NOT NULL),
  CHECK ((end_mode <> 'count') OR occurrence_count > 0)
);
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='projects_series_fk'
  ) THEN
    ALTER TABLE projects.projects ADD CONSTRAINT projects_series_fk
      FOREIGN KEY (series_id) REFERENCES projects.project_series(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS projects_series_occurrence_unique
  ON projects.projects(series_id, series_occurrence_key) WHERE series_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS projects_series_idx ON projects.projects(series_id, starts_at);

CREATE TABLE IF NOT EXISTS projects.series_change_sets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id         uuid NOT NULL REFERENCES projects.project_series(id) ON DELETE CASCADE,
  source_project_id uuid NOT NULL REFERENCES projects.projects(id),
  scope             text NOT NULL CHECK (scope IN ('this_and_future','all')),
  project_patch     jsonb NOT NULL,
  preview           jsonb NOT NULL,
  status            text NOT NULL DEFAULT 'preview' CHECK (status IN ('preview','applied','stale')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  applied_at        timestamptz
);
CREATE INDEX IF NOT EXISTS series_change_sets_series_idx ON projects.series_change_sets(series_id, created_at DESC);

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
ALTER TABLE projects.operation_unit_marks DROP CONSTRAINT IF EXISTS operation_unit_marks_project_id_stage_unit_id_key;
ALTER TABLE projects.operation_unit_marks DROP CONSTRAINT IF EXISTS operation_unit_marks_project_stage_unit_status_key;
ALTER TABLE projects.operation_unit_marks ADD CONSTRAINT operation_unit_marks_project_stage_unit_status_key UNIQUE(project_id, stage, unit_id, status);
ALTER TABLE projects.operation_unit_marks DROP CONSTRAINT IF EXISTS operation_unit_marks_stage_check;
ALTER TABLE projects.operation_unit_marks ADD CONSTRAINT operation_unit_marks_stage_check CHECK (stage IN ('prep','pickup','delivery','mount','show','dismantle','return'));
ALTER TABLE projects.operation_unit_marks DROP CONSTRAINT IF EXISTS operation_unit_marks_status_check;
ALTER TABLE projects.operation_unit_marks ADD CONSTRAINT operation_unit_marks_status_check CHECK (status IN ('kit_checked','ready','packed','picked','missing','left','delivered','mounted','held_in_reserve','collected','broken','lost','returned'));
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
ALTER TABLE projects.reservations ALTER COLUMN starts_at DROP NOT NULL;
ALTER TABLE projects.reservations ALTER COLUMN ends_at DROP NOT NULL;
ALTER TABLE projects.reservations ADD COLUMN IF NOT EXISTS is_reserve boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS reservations_model_idx ON projects.reservations(model_id, starts_at, ends_at);

-- The snapshot makes a project's commercial kit independent from later edits
-- to equipment.kits. kit_id/model_id are opaque IDs; no cross-schema FK.
CREATE TABLE IF NOT EXISTS projects.kit_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects.projects(id) ON DELETE CASCADE,
  kit_id uuid NOT NULL, kit_name text NOT NULL, kit_description text,
  pricing_mode text NOT NULL CHECK (pricing_mode IN ('fixed_daily','sum_components')),
  daily_price_eur numeric(12,2), qty integer NOT NULL CHECK (qty > 0),
  is_reserve boolean NOT NULL DEFAULT false, starts_at timestamptz, ends_at timestamptz,
  components jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE projects.reservations ADD COLUMN IF NOT EXISTS kit_reservation_id uuid;
CREATE INDEX IF NOT EXISTS reservations_kit_reservation_idx ON projects.reservations(kit_reservation_id);
CREATE INDEX IF NOT EXISTS kit_reservations_project_idx ON projects.kit_reservations(project_id);

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
ALTER TABLE projects.project_roles ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE projects.project_roles ADD COLUMN IF NOT EXISTS ends_at   timestamptz;
ALTER TABLE projects.project_roles ADD COLUMN IF NOT EXISTS comment   text;
ALTER TABLE projects.project_roles DROP CONSTRAINT IF EXISTS project_roles_engagement_range_check;
ALTER TABLE projects.project_roles ADD CONSTRAINT project_roles_engagement_range_check CHECK (
  (starts_at IS NULL AND ends_at IS NULL)
  OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS project_roles_project_idx ON projects.project_roles(project_id, created_at);

-- Roles responsible for a timing block. Unlike people assignments, this keeps
-- an unfilled staffing role visible in the event plan.
CREATE TABLE IF NOT EXISTS projects.timing_roles (
  timing_id uuid NOT NULL REFERENCES projects.timings(id) ON DELETE CASCADE,
  role_id   uuid NOT NULL REFERENCES projects.project_roles(id) ON DELETE CASCADE,
  PRIMARY KEY (timing_id, role_id)
);
CREATE INDEX IF NOT EXISTS timing_roles_role_idx ON projects.timing_roles(role_id);

CREATE TABLE IF NOT EXISTS projects.assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects.projects(id),
  user_id    uuid NOT NULL,         -- opaque people id
  role_note  text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assignments_user_idx ON projects.assignments(user_id);

-- Invitation flow: added directly, or invited → accepted / declined / cancelled.
ALTER TABLE projects.assignments ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'added';
ALTER TABLE projects.assignments ADD COLUMN IF NOT EXISTS rate_eur     numeric(12,2);
ALTER TABLE projects.assignments ADD COLUMN IF NOT EXISTS invited_by   uuid;
ALTER TABLE projects.assignments ADD COLUMN IF NOT EXISTS responded_at timestamptz;
ALTER TABLE projects.assignments ADD COLUMN IF NOT EXISTS telegram_chat_id text;
ALTER TABLE projects.assignments ADD COLUMN IF NOT EXISTS telegram_message_id integer;
ALTER TABLE projects.assignments ADD COLUMN IF NOT EXISTS role_id      uuid REFERENCES projects.project_roles(id) ON DELETE SET NULL;
ALTER TABLE projects.assignments ADD COLUMN IF NOT EXISTS dress_code_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE projects.assignments ADD COLUMN IF NOT EXISTS paid_eur numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_eur >= 0);
ALTER TABLE projects.assignments ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE projects.assignments ADD COLUMN IF NOT EXISTS status_before_project_cancel text;
ALTER TABLE projects.assignments ADD COLUMN IF NOT EXISTS responded_at_before_project_cancel timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='projects' AND table_name='project_roles' AND column_name='dress_code_enabled') THEN
    ALTER TABLE projects.project_roles ADD COLUMN dress_code_enabled boolean NOT NULL DEFAULT false;
    UPDATE projects.project_roles r SET dress_code_enabled=true WHERE EXISTS (SELECT 1 FROM projects.assignments a WHERE a.role_id=r.id AND a.dress_code_enabled);
    UPDATE projects.assignments a SET dress_code_enabled=r.dress_code_enabled FROM projects.project_roles r WHERE a.role_id=r.id;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS assignments_role_idx ON projects.assignments(role_id);

CREATE TABLE IF NOT EXISTS projects.project_reminders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES projects.projects(id) ON DELETE CASCADE,
  offset_minutes     integer NOT NULL CHECK (offset_minutes > 0),
  recipient_mode     text NOT NULL DEFAULT 'project_team' CHECK (recipient_mode IN ('project_team','selected')),
  user_ids           uuid[] NOT NULL DEFAULT '{}',
  note               text,
  sent_at            timestamptz,
  created_by_user_id uuid,
  created_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE projects.project_reminders ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Напоминание о мероприятии';
ALTER TABLE projects.project_reminders ADD COLUMN IF NOT EXISTS timing_id uuid REFERENCES projects.timings(id) ON DELETE CASCADE;
ALTER TABLE projects.project_reminders DROP CONSTRAINT IF EXISTS project_reminders_offset_minutes_check;
ALTER TABLE projects.project_reminders ADD CONSTRAINT project_reminders_offset_minutes_check CHECK (offset_minutes >= 0);
CREATE INDEX IF NOT EXISTS project_reminders_project_idx ON projects.project_reminders(project_id, created_at);
CREATE INDEX IF NOT EXISTS project_reminders_due_idx ON projects.project_reminders(sent_at, offset_minutes);

CREATE TABLE IF NOT EXISTS projects.project_pings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects.projects(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL,
  reminder_id         uuid REFERENCES projects.project_reminders(id) ON DELETE SET NULL,
  message             text NOT NULL DEFAULT '',
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','declined')),
  responded_at        timestamptz,
  created_by_user_id  uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE projects.project_pings ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Пинг по проекту';
CREATE INDEX IF NOT EXISTS project_pings_project_idx ON projects.project_pings(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_pings_user_idx ON projects.project_pings(user_id, status);

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
ALTER TABLE projects.contractor_items ADD COLUMN IF NOT EXISTS received_at timestamptz;
ALTER TABLE projects.contractor_items ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'equipment';
ALTER TABLE projects.contractor_items ADD COLUMN IF NOT EXISTS booked boolean NOT NULL DEFAULT false;
ALTER TABLE projects.contractor_items ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE projects.contractor_items ADD COLUMN IF NOT EXISTS order_id uuid;
ALTER TABLE projects.contractor_items ADD COLUMN IF NOT EXISTS pricing_mode text;
UPDATE projects.contractor_items
SET pricing_mode=CASE
  WHEN kind='equipment' AND order_id IS NULL THEN 'per_day'
  ELSE 'flat_total'
END
WHERE pricing_mode IS NULL;
ALTER TABLE projects.contractor_items ALTER COLUMN pricing_mode SET DEFAULT 'per_day';
ALTER TABLE projects.contractor_items ALTER COLUMN pricing_mode SET NOT NULL;
ALTER TABLE projects.contractor_items DROP CONSTRAINT IF EXISTS contractor_items_pricing_mode_check;
ALTER TABLE projects.contractor_items ADD CONSTRAINT contractor_items_pricing_mode_check CHECK (pricing_mode IN ('per_day','flat_total'));
ALTER TABLE projects.contractor_items DROP CONSTRAINT IF EXISTS contractor_items_kind_check;
ALTER TABLE projects.contractor_items ADD CONSTRAINT contractor_items_kind_check CHECK (kind IN ('equipment','delivery','setup'));
CREATE INDEX IF NOT EXISTS contractor_items_project_idx ON projects.contractor_items(project_id);
CREATE INDEX IF NOT EXISTS contractor_items_contractor_idx ON projects.contractor_items(contractor_id);

CREATE TABLE IF NOT EXISTS projects.contractor_orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES projects.projects(id),
  contractor_id         uuid NOT NULL,
  warehouse_id          uuid,
  name                  text NOT NULL,
  fulfillment_mode      text NOT NULL CHECK (fulfillment_mode IN ('dry_rental','contractor_delivery')),
  supplier_price_eur    numeric(12,2) NOT NULL CHECK (supplier_price_eur >= 0),
  client_price_eur      numeric(12,2) NOT NULL CHECK (client_price_eur >= 0),
  delivery_at           timestamptz,
  pickup_at             timestamptz,
  booked                boolean NOT NULL DEFAULT false,
  receipt_completed_at  timestamptz,
  return_completed_at   timestamptz,
  delivery_timing_id    uuid,
  pickup_timing_id      uuid,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contractor_orders_project_idx ON projects.contractor_orders(project_id);
CREATE INDEX IF NOT EXISTS contractor_orders_contractor_idx ON projects.contractor_orders(contractor_id);

CREATE TABLE IF NOT EXISTS projects.contractor_order_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES projects.contractor_orders(id) ON DELETE CASCADE,
  catalog_item_id uuid NOT NULL,
  name            text NOT NULL,
  qty             integer NOT NULL CHECK (qty > 0),
  received_at     timestamptz,
  returned_at     timestamptz
);
-- Preserve the catalogue note as an operational snapshot for receiving and return.
-- It is not used by the client-facing commercial line.
ALTER TABLE projects.contractor_order_lines ADD COLUMN IF NOT EXISTS note text;
CREATE INDEX IF NOT EXISTS contractor_order_lines_order_idx ON projects.contractor_order_lines(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS contractor_items_order_idx ON projects.contractor_items(order_id) WHERE order_id IS NOT NULL;

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

-- R1 site-import provenance. These IDs are opaque site_integration IDs: the
-- projects module never joins or constrains another module's schema.
ALTER TABLE projects.projects ADD COLUMN IF NOT EXISTS source_import_id uuid;
ALTER TABLE projects.projects ADD COLUMN IF NOT EXISTS source_import_environment text;
ALTER TABLE projects.projects DROP CONSTRAINT IF EXISTS projects_source_import_environment_check;
ALTER TABLE projects.projects ADD CONSTRAINT projects_source_import_environment_check
  CHECK (source_import_environment IS NULL OR source_import_environment IN ('test','live'));
CREATE UNIQUE INDEX IF NOT EXISTS projects_one_project_per_source_import
  ON projects.projects(source_import_id) WHERE source_import_id IS NOT NULL;

-- The legacy contacts field remains untouched for existing clients. Structured identities are
-- an additive exact-match index for future imports only.
CREATE TABLE IF NOT EXISTS projects.client_contact_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES projects.clients(id) ON DELETE CASCADE,
  identity_type text NOT NULL CHECK (identity_type IN ('phone','email','instagram','site_customer_id')),
  normalized_value text NOT NULL,
  original_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(identity_type, normalized_value)
);
CREATE INDEX IF NOT EXISTS client_contact_identities_client_idx ON projects.client_contact_identities(client_id);
CREATE INDEX IF NOT EXISTS client_contact_identities_exact_lookup_idx
  ON projects.client_contact_identities(identity_type, normalized_value);

-- Requested equipment is a planning/import fact, never a reservation. It has
-- no price columns: a source line's commercial value exists only in the quote
-- snapshot in site_integration.
CREATE TABLE IF NOT EXISTS projects.requested_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects.projects(id) ON DELETE CASCADE,
  source_import_id uuid NOT NULL,
  source_site_line_id text NOT NULL,
  source_mapping_component_key text NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('own_model','contractor_catalog')),
  target_id uuid NOT NULL,
  contractor_id uuid,
  site_quantity integer NOT NULL CHECK (site_quantity > 0),
  qty_per_site_unit numeric(12,4) NOT NULL CHECK (qty_per_site_unit > 0),
  requested_quantity numeric(12,4) NOT NULL CHECK (requested_quantity > 0),
  review_status text NOT NULL DEFAULT 'pending_review' CHECK (review_status IN ('pending_review','ready','converted','rejected')),
  converted_reservation_id uuid REFERENCES projects.reservations(id),
  converted_contractor_item_id uuid REFERENCES projects.contractor_items(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  converted_at timestamptz,
  CHECK ((target_kind = 'contractor_catalog') = (contractor_id IS NOT NULL)),
  CHECK ((target_kind = 'own_model') OR converted_reservation_id IS NULL),
  CHECK ((target_kind = 'contractor_catalog') OR converted_contractor_item_id IS NULL),
  CHECK ((review_status = 'converted') = ((converted_reservation_id IS NOT NULL) OR (converted_contractor_item_id IS NOT NULL))),
  UNIQUE(project_id, source_site_line_id, source_mapping_component_key),
  UNIQUE(converted_reservation_id),
  UNIQUE(converted_contractor_item_id)
);
-- Upgrade early R1 requested equipment. Its model_id was explicitly an own
-- equipment model, so this backfill does not guess a contractor target.
ALTER TABLE projects.requested_equipment ADD COLUMN IF NOT EXISTS target_kind text;
ALTER TABLE projects.requested_equipment ADD COLUMN IF NOT EXISTS target_id uuid;
ALTER TABLE projects.requested_equipment ADD COLUMN IF NOT EXISTS contractor_id uuid;
ALTER TABLE projects.requested_equipment ADD COLUMN IF NOT EXISTS qty_per_site_unit numeric(12,4);
ALTER TABLE projects.requested_equipment ADD COLUMN IF NOT EXISTS converted_contractor_item_id uuid;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='projects' AND table_name='requested_equipment' AND column_name='model_id') THEN
    UPDATE projects.requested_equipment
    SET target_kind='own_model', target_id=model_id, qty_per_site_unit=quantity_multiplier
    WHERE target_kind IS NULL AND target_id IS NULL AND model_id IS NOT NULL AND quantity_multiplier IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM projects.requested_equipment WHERE target_kind IS NULL OR target_id IS NULL OR qty_per_site_unit IS NULL) THEN
    RAISE EXCEPTION 'Cannot upgrade projects.requested_equipment: legacy row has no unambiguous own-model target';
  END IF;
END $$;
ALTER TABLE projects.requested_equipment ALTER COLUMN target_kind SET NOT NULL;
ALTER TABLE projects.requested_equipment ALTER COLUMN target_id SET NOT NULL;
ALTER TABLE projects.requested_equipment ALTER COLUMN qty_per_site_unit SET NOT NULL;
ALTER TABLE projects.requested_equipment DROP CONSTRAINT IF EXISTS requested_equipment_target_kind_check;
ALTER TABLE projects.requested_equipment ADD CONSTRAINT requested_equipment_target_kind_check CHECK (target_kind IN ('own_model','contractor_catalog'));
ALTER TABLE projects.requested_equipment DROP CONSTRAINT IF EXISTS requested_equipment_target_contractor_check;
ALTER TABLE projects.requested_equipment ADD CONSTRAINT requested_equipment_target_contractor_check CHECK ((target_kind = 'contractor_catalog') = (contractor_id IS NOT NULL));
ALTER TABLE projects.requested_equipment DROP CONSTRAINT IF EXISTS requested_equipment_converted_target_check;
ALTER TABLE projects.requested_equipment ADD CONSTRAINT requested_equipment_converted_target_check CHECK (
  (target_kind = 'own_model' AND converted_contractor_item_id IS NULL)
  OR (target_kind = 'contractor_catalog' AND converted_reservation_id IS NULL)
);
ALTER TABLE projects.requested_equipment DROP CONSTRAINT IF EXISTS requested_equipment_conversion_presence_check;
ALTER TABLE projects.requested_equipment ADD CONSTRAINT requested_equipment_conversion_presence_check CHECK (
  (review_status = 'converted') = ((converted_reservation_id IS NOT NULL) OR (converted_contractor_item_id IS NOT NULL))
);
ALTER TABLE projects.requested_equipment DROP CONSTRAINT IF EXISTS requested_equipment_reservation_fk;
ALTER TABLE projects.requested_equipment ADD CONSTRAINT requested_equipment_reservation_fk FOREIGN KEY (converted_reservation_id) REFERENCES projects.reservations(id);
ALTER TABLE projects.requested_equipment DROP CONSTRAINT IF EXISTS requested_equipment_contractor_item_fk;
ALTER TABLE projects.requested_equipment ADD CONSTRAINT requested_equipment_contractor_item_fk FOREIGN KEY (converted_contractor_item_id) REFERENCES projects.contractor_items(id);
ALTER TABLE projects.requested_equipment DROP COLUMN IF EXISTS model_id;
ALTER TABLE projects.requested_equipment DROP COLUMN IF EXISTS quantity_multiplier;
CREATE INDEX IF NOT EXISTS requested_equipment_project_idx ON projects.requested_equipment(project_id, review_status);
CREATE INDEX IF NOT EXISTS requested_equipment_import_idx ON projects.requested_equipment(source_import_id);
`;
