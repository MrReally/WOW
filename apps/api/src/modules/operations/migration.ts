export const migration = `
CREATE SCHEMA IF NOT EXISTS operations;
CREATE TABLE IF NOT EXISTS operations.documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number text NOT NULL UNIQUE,
 kind text NOT NULL CHECK(kind IN ('issue','return','transfer','inventory')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted','reversed')),
 payload jsonb NOT NULL, document_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1, updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 posted_at timestamptz, reversed_at timestamptz
);
ALTER TABLE operations.documents ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE operations.documents ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE operations.documents ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE operations.documents ADD COLUMN IF NOT EXISTS document_at timestamptz;
UPDATE operations.documents SET document_at=created_at WHERE document_at IS NULL;
ALTER TABLE operations.documents ALTER COLUMN document_at SET DEFAULT now();
ALTER TABLE operations.documents ALTER COLUMN document_at SET NOT NULL;
UPDATE operations.documents SET updated_by=created_by WHERE updated_by IS NULL;
ALTER TABLE operations.documents ALTER COLUMN updated_by SET NOT NULL;
CREATE TABLE IF NOT EXISTS operations.document_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES operations.documents(id),
 version integer NOT NULL, action text NOT NULL CHECK(action IN ('created','edited','posted','reversed')),
 payload jsonb NOT NULL, document_at timestamptz NOT NULL DEFAULT now(), actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE operations.document_revisions ADD COLUMN IF NOT EXISTS document_at timestamptz;
UPDATE operations.document_revisions SET document_at=created_at WHERE document_at IS NULL;
ALTER TABLE operations.document_revisions ALTER COLUMN document_at SET DEFAULT now();
ALTER TABLE operations.document_revisions ALTER COLUMN document_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS operation_revisions_document_idx ON operations.document_revisions(document_id,created_at);
CREATE INDEX IF NOT EXISTS operations_documents_status_idx ON operations.documents(status,created_at DESC);
CREATE INDEX IF NOT EXISTS operations_documents_document_at_idx ON operations.documents(document_at DESC);

CREATE TABLE IF NOT EXISTS operations.inventory_schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), warehouse_id uuid NOT NULL,
 frequency text NOT NULL CHECK(frequency IN ('daily','weekly','monthly','interval')),
 interval_days integer, launch_time time NOT NULL, time_zone text NOT NULL,
 hide_expected boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
 next_run_at timestamptz NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_schedules_due_idx ON operations.inventory_schedules(active,next_run_at);

CREATE TABLE IF NOT EXISTS operations.inventory_processes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), warehouse_id uuid NOT NULL, warehouse_name text NOT NULL,
 schedule_id uuid REFERENCES operations.inventory_schedules(id), parent_process_id uuid REFERENCES operations.inventory_processes(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','review','completed','cancelled')),
 completeness text NOT NULL DEFAULT 'partial' CHECK(completeness IN ('partial','full')),
 hide_expected boolean NOT NULL DEFAULT false, snapshot_at timestamptz NOT NULL DEFAULT now(), snapshot jsonb NOT NULL,
 document_id uuid REFERENCES operations.documents(id), created_by uuid NOT NULL, completed_by uuid,
 completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE operations.inventory_processes ADD COLUMN IF NOT EXISTS applied_line_keys jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_one_open_per_warehouse ON operations.inventory_processes(warehouse_id) WHERE status IN ('active','review');
CREATE INDEX IF NOT EXISTS inventory_processes_visible_idx ON operations.inventory_processes(status,created_at DESC);

CREATE TABLE IF NOT EXISTS operations.inventory_zone_work (
 process_id uuid NOT NULL REFERENCES operations.inventory_processes(id) ON DELETE CASCADE,
 zone_key text NOT NULL, zone_id uuid, parent_id uuid, zone_name text NOT NULL,
 assigned_to uuid, assigned_to_name text, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','completed')),
 started_at timestamptz, completed_at timestamptz, PRIMARY KEY(process_id,zone_key)
);
ALTER TABLE operations.inventory_zone_work ADD COLUMN IF NOT EXISTS parent_id uuid;
CREATE TABLE IF NOT EXISTS operations.inventory_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), process_id uuid NOT NULL REFERENCES operations.inventory_processes(id) ON DELETE CASCADE,
 line_key text NOT NULL, zone_key text NOT NULL, kind text NOT NULL CHECK(kind IN ('serial','quantity','add_serial')),
 serial_result text CHECK(serial_result IN ('ok','repair','lost')), actual_qty integer, comment text,
 added_model_id uuid, added_asset_tag text, added_serial text, created_unit_id uuid,
 actor_id uuid NOT NULL, actor_name text NOT NULL, correction_of uuid REFERENCES operations.inventory_entries(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_entries_process_idx ON operations.inventory_entries(process_id,created_at);
`;
