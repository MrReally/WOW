export const equipmentMigration = `
CREATE SCHEMA IF NOT EXISTS equipment;

CREATE TABLE IF NOT EXISTS equipment.types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  tracking_mode text NOT NULL CHECK (tracking_mode IN ('serial','quantity')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment.models (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id                      uuid NOT NULL REFERENCES equipment.types(id),
  name                         text NOT NULL,
  manufacturer                 text,
  unit_cost_eur                numeric(12,2) NOT NULL DEFAULT 0,
  daily_price_eur              numeric(12,2) NOT NULL DEFAULT 0,
  attrs                        jsonb,
  required_component_model_ids uuid[] NOT NULL DEFAULT '{}',
  created_at                   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment.units (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id           uuid NOT NULL REFERENCES equipment.models(id),
  asset_tag          text NOT NULL UNIQUE,
  serial             text,
  status             text NOT NULL DEFAULT 'in_stock'
                     CHECK (status IN ('in_stock','reserved','on_project','in_repair','at_contractor','lost')),
  current_project_id uuid,            -- opaque id from projects module (no FK)
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS units_model_idx ON equipment.units(model_id);
CREATE INDEX IF NOT EXISTS units_status_idx ON equipment.units(status);
CREATE INDEX IF NOT EXISTS units_project_idx ON equipment.units(current_project_id);

-- Append-only journal. Never updated or deleted. Entries are either per serial
-- unit (unit_id set) or per model for quantity/cable moves (model_id + qty).
CREATE TABLE IF NOT EXISTS equipment.journal (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     uuid REFERENCES equipment.units(id),
  model_id    uuid REFERENCES equipment.models(id),
  qty         integer,
  action      text NOT NULL,
  from_status text,
  to_status   text,
  project_id  uuid,                   -- opaque id
  actor_id    uuid,                   -- opaque people id
  note        text,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journal_unit_idx ON equipment.journal(unit_id, at);
CREATE INDEX IF NOT EXISTS journal_model_idx ON equipment.journal(model_id, at);

-- Migrate older databases where unit_id was NOT NULL and the new columns absent.
ALTER TABLE equipment.journal ALTER COLUMN unit_id DROP NOT NULL;
ALTER TABLE equipment.journal ADD COLUMN IF NOT EXISTS model_id uuid REFERENCES equipment.models(id);
ALTER TABLE equipment.journal ADD COLUMN IF NOT EXISTS qty integer;

-- Quantity stock totals for models tracked by quantity (cables). Counts on
-- projects are derived from the journal; this row holds the owned total.
CREATE TABLE IF NOT EXISTS equipment.model_stock (
  model_id  uuid PRIMARY KEY REFERENCES equipment.models(id),
  total_qty integer NOT NULL DEFAULT 0
);

-- Problems surfaced to Apex (некомплект, lost). Actions are never blocked.
CREATE TABLE IF NOT EXISTS equipment.problems (
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
