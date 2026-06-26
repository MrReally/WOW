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

CREATE TABLE IF NOT EXISTS equipment.warehouses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  address    text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO equipment.warehouses (name, is_default)
SELECT 'Main warehouse', true
WHERE NOT EXISTS (SELECT 1 FROM equipment.warehouses);
UPDATE equipment.warehouses
SET is_default=true
WHERE id = (SELECT id FROM equipment.warehouses ORDER BY is_default DESC, created_at LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM equipment.warehouses WHERE is_default=true);

CREATE TABLE IF NOT EXISTS equipment.units (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id           uuid NOT NULL REFERENCES equipment.models(id),
  asset_tag          text NOT NULL UNIQUE,
  serial             text,
  warehouse_id       uuid REFERENCES equipment.warehouses(id),
  status             text NOT NULL DEFAULT 'in_stock'
                     CHECK (status IN ('in_stock','reserved','on_project','in_repair','at_contractor','lost')),
  current_project_id uuid,            -- opaque id from projects module (no FK)
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS units_model_idx ON equipment.units(model_id);
CREATE INDEX IF NOT EXISTS units_status_idx ON equipment.units(status);
CREATE INDEX IF NOT EXISTS units_project_idx ON equipment.units(current_project_id);

-- Per-unit free-form notes: unique defects, quirks, marks.
ALTER TABLE equipment.units ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE equipment.units ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES equipment.warehouses(id);
UPDATE equipment.units
SET warehouse_id=(SELECT id FROM equipment.warehouses ORDER BY is_default DESC, created_at LIMIT 1)
WHERE warehouse_id IS NULL;
CREATE INDEX IF NOT EXISTS units_warehouse_idx ON equipment.units(warehouse_id);

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
  warehouse_id uuid REFERENCES equipment.warehouses(id),
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
ALTER TABLE equipment.journal ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES equipment.warehouses(id);
UPDATE equipment.journal
SET warehouse_id=(SELECT id FROM equipment.warehouses ORDER BY is_default DESC, created_at LIMIT 1)
WHERE warehouse_id IS NULL AND model_id IS NOT NULL;

-- Quantity stock totals for models tracked by quantity (cables). Counts on
-- projects are derived from the journal; this row holds the owned total.
CREATE TABLE IF NOT EXISTS equipment.model_stock (
  model_id  uuid REFERENCES equipment.models(id),
  warehouse_id uuid REFERENCES equipment.warehouses(id),
  total_qty integer NOT NULL DEFAULT 0
);
ALTER TABLE equipment.model_stock ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES equipment.warehouses(id);
UPDATE equipment.model_stock
SET warehouse_id=(SELECT id FROM equipment.warehouses ORDER BY is_default DESC, created_at LIMIT 1)
WHERE warehouse_id IS NULL;
ALTER TABLE equipment.model_stock ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE equipment.model_stock DROP CONSTRAINT IF EXISTS model_stock_pkey;
ALTER TABLE equipment.model_stock ADD PRIMARY KEY (model_id, warehouse_id);

-- Contractors (external parties equipment can be handed to).
CREATE TABLE IF NOT EXISTS equipment.contractors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  contacts   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Repair records (full cycle: open -> closed, with cost + outcome).
CREATE TABLE IF NOT EXISTS equipment.repairs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id      uuid NOT NULL REFERENCES equipment.units(id),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  problem      text NOT NULL,
  vendor       text,
  est_cost_eur numeric(12,2),
  cost_eur     numeric(12,2),
  resolution   text,
  outcome      text CHECK (outcome IN ('repaired','written_off')),
  opened_by    uuid,
  opened_at    timestamptz NOT NULL DEFAULT now(),
  closed_by    uuid,
  closed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS repairs_unit_idx ON equipment.repairs(unit_id);
CREATE INDEX IF NOT EXISTS repairs_status_idx ON equipment.repairs(status);

-- Contractor handovers (send a unit out -> take it back).
CREATE TABLE IF NOT EXISTS equipment.handovers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id         uuid NOT NULL REFERENCES equipment.units(id),
  contractor_id   uuid NOT NULL REFERENCES equipment.contractors(id),
  status          text NOT NULL DEFAULT 'out' CHECK (status IN ('out','returned')),
  reason          text,
  note            text,
  expected_return timestamptz,
  sent_by         uuid,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  returned_by     uuid,
  returned_at     timestamptz
);
CREATE INDEX IF NOT EXISTS handovers_unit_idx ON equipment.handovers(unit_id);
CREATE INDEX IF NOT EXISTS handovers_status_idx ON equipment.handovers(status);

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
