export const suppliesMigration = `
CREATE SCHEMA IF NOT EXISTS supplies;

CREATE TABLE IF NOT EXISTS supplies.item_settings (
  item_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  minimum_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK (minimum_qty >= 0),
  maximum_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK (maximum_qty >= minimum_qty),
  incoming_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK (incoming_qty >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS supplies.containers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  label text NOT NULL,
  capacity_liters numeric(14,3) NOT NULL CHECK (capacity_liters > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, warehouse_id, label)
);
CREATE INDEX IF NOT EXISTS supplies_containers_item_idx ON supplies.containers(item_id, warehouse_id);

CREATE TABLE IF NOT EXISTS supplies.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  container_id uuid,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  package_count numeric(14,3),
  package_label text,
  supplier_name text,
  currency text NOT NULL,
  total_price numeric(14,2) NOT NULL CHECK (total_price >= 0),
  fx_rate_to_eur numeric(18,8) NOT NULL CHECK (fx_rate_to_eur > 0),
  total_eur numeric(14,2) NOT NULL CHECK (total_eur >= 0),
  note text,
  received_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplies_receipts_item_idx ON supplies.receipts(item_id, received_at DESC);

-- Append-only stock ledger. Balances are always derived from signed quantities.
CREATE TABLE IF NOT EXISTS supplies.journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  container_id uuid,
  warehouse_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('receipt','consume','adjust','write_off','transfer_in','transfer_out')),
  quantity numeric(14,3) NOT NULL CHECK (quantity <> 0),
  project_id uuid,
  receipt_id uuid,
  note text,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplies_journal_stock_idx ON supplies.journal(item_id, warehouse_id);
CREATE INDEX IF NOT EXISTS supplies_journal_container_idx ON supplies.journal(container_id);
CREATE INDEX IF NOT EXISTS supplies_journal_created_idx ON supplies.journal(created_at DESC);
`;
