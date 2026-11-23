// R1 persistence only. The receiver/worker belongs to a later, explicitly approved phase.
export const siteIntegrationMigration = `
CREATE SCHEMA IF NOT EXISTS site_integration;

CREATE TABLE IF NOT EXISTS site_integration.inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('test','live')),
  external_order_id text NOT NULL,
  raw_payload jsonb NOT NULL,
  raw_body bytea,
  payload_digest text,
  status text NOT NULL DEFAULT 'received' CONSTRAINT inbox_status_check CHECK (status IN ('received','processing','needs_review','imported','failed','retryable_failure')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  retry_after timestamptz,
  last_error text,
  review_reasons text[] NOT NULL DEFAULT '{}',
  import_id uuid,
  project_id uuid,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source, environment, external_order_id),
  CHECK ((status = 'processing') = (lease_token IS NOT NULL)),
  CHECK (lease_expires_at IS NULL OR lease_token IS NOT NULL),
  CONSTRAINT inbox_processing_requires_lease_check CHECK (
    status <> 'processing'
    OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);
-- R2 preserves the signed HTTP bytes separately from R1's queryable JSONB.
-- Existing R1 rows legitimately have no HTTP body and remain readable.
ALTER TABLE site_integration.inbox ADD COLUMN IF NOT EXISTS delivery_id text;
ALTER TABLE site_integration.inbox ADD COLUMN IF NOT EXISTS raw_body bytea;
-- The first R1 migration did not require an expiry for a processing lease.
-- Validate before adding the stricter constraint so a legacy upgrade fails with
-- a useful diagnostic and leaves the migration transaction untouched.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM site_integration.inbox
    WHERE status = 'processing'
      AND (lease_token IS NULL OR lease_expires_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'Cannot upgrade site_integration.inbox: processing rows require both lease_token and lease_expires_at';
  END IF;
  IF EXISTS (SELECT 1 FROM site_integration.inbox WHERE status IS NULL) THEN
    RAISE EXCEPTION 'Cannot upgrade site_integration.inbox: status must not be NULL';
  END IF;
END $$;
ALTER TABLE site_integration.inbox ALTER COLUMN status SET NOT NULL;
ALTER TABLE site_integration.inbox DROP CONSTRAINT IF EXISTS inbox_status_check;
ALTER TABLE site_integration.inbox
  ADD CONSTRAINT inbox_status_check CHECK (status IN ('received','processing','needs_review','imported','failed','retryable_failure'));
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'site_integration.inbox'::regclass
      AND conname = 'inbox_processing_requires_lease_check'
  ) THEN
    ALTER TABLE site_integration.inbox
      ADD CONSTRAINT inbox_processing_requires_lease_check CHECK (
        status <> 'processing'
        OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
      );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS site_integration_inbox_recovery_idx ON site_integration.inbox(status, retry_after, lease_expires_at);

CREATE TABLE IF NOT EXISTS site_integration.product_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  site_product_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE(source, site_product_id)
);
CREATE TABLE IF NOT EXISTS site_integration.product_mapping_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id uuid NOT NULL REFERENCES site_integration.product_mappings(id),
  version integer NOT NULL CHECK (version > 0),
  accounting_unit text NOT NULL CHECK (accounting_unit IN ('catalog_unit','catalog_pair','component')),
  site_unit text NOT NULL DEFAULT 'item' CHECK (site_unit = 'item'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','superseded')),
  source_document jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mapping_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS site_integration_one_published_mapping_version
  ON site_integration.product_mapping_versions(mapping_id) WHERE status='published';
CREATE TABLE IF NOT EXISTS site_integration.product_mapping_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_version_id uuid NOT NULL REFERENCES site_integration.product_mapping_versions(id) ON DELETE CASCADE,
  component_key text NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('own_model','contractor_catalog')),
  target_id uuid NOT NULL,
  contractor_id uuid,
  qty_per_site_unit numeric(12,4) NOT NULL CHECK (qty_per_site_unit > 0),
  counting_unit text NOT NULL CHECK (counting_unit IN ('physical_unit','catalog_entry')),
  represented_physical_qty_per_catalog_unit numeric(12,4),
  catalog_entry_represents_bundle boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mapping_version_id, component_key),
  CHECK ((target_kind = 'contractor_catalog') = (contractor_id IS NOT NULL)),
  CHECK ((catalog_entry_represents_bundle = false) OR (counting_unit = 'catalog_entry')),
  CHECK (represented_physical_qty_per_catalog_unit IS NULL OR represented_physical_qty_per_catalog_unit > 0)
);
-- Upgrade the initial R1 draft. model_id had an unambiguous meaning there:
-- an own model, so it can be backfilled safely. A null or incomplete legacy
-- row is deliberately rejected instead of being guessed into a target type.
ALTER TABLE site_integration.product_mapping_versions ADD COLUMN IF NOT EXISTS source_document jsonb NOT NULL DEFAULT '{}';
ALTER TABLE site_integration.product_mapping_components ADD COLUMN IF NOT EXISTS target_kind text;
ALTER TABLE site_integration.product_mapping_components ADD COLUMN IF NOT EXISTS target_id uuid;
ALTER TABLE site_integration.product_mapping_components ADD COLUMN IF NOT EXISTS contractor_id uuid;
ALTER TABLE site_integration.product_mapping_components ADD COLUMN IF NOT EXISTS qty_per_site_unit numeric(12,4);
ALTER TABLE site_integration.product_mapping_components ADD COLUMN IF NOT EXISTS counting_unit text;
ALTER TABLE site_integration.product_mapping_components ADD COLUMN IF NOT EXISTS represented_physical_qty_per_catalog_unit numeric(12,4);
ALTER TABLE site_integration.product_mapping_components ADD COLUMN IF NOT EXISTS catalog_entry_represents_bundle boolean NOT NULL DEFAULT false;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='site_integration' AND table_name='product_mapping_components' AND column_name='model_id') THEN
    UPDATE site_integration.product_mapping_components
    SET target_kind='own_model', target_id=model_id,
        qty_per_site_unit=quantity_multiplier, counting_unit='physical_unit'
    WHERE target_kind IS NULL AND target_id IS NULL AND model_id IS NOT NULL AND quantity_multiplier IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM site_integration.product_mapping_components WHERE target_kind IS NULL OR target_id IS NULL OR qty_per_site_unit IS NULL OR counting_unit IS NULL) THEN
    RAISE EXCEPTION 'Cannot upgrade site_integration.product_mapping_components: legacy row has no unambiguous own-model target';
  END IF;
END $$;
ALTER TABLE site_integration.product_mapping_components ALTER COLUMN target_kind SET NOT NULL;
ALTER TABLE site_integration.product_mapping_components ALTER COLUMN target_id SET NOT NULL;
ALTER TABLE site_integration.product_mapping_components ALTER COLUMN qty_per_site_unit SET NOT NULL;
ALTER TABLE site_integration.product_mapping_components ALTER COLUMN counting_unit SET NOT NULL;
ALTER TABLE site_integration.product_mapping_components DROP CONSTRAINT IF EXISTS product_mapping_components_target_kind_check;
ALTER TABLE site_integration.product_mapping_components ADD CONSTRAINT product_mapping_components_target_kind_check CHECK (target_kind IN ('own_model','contractor_catalog'));
ALTER TABLE site_integration.product_mapping_components DROP CONSTRAINT IF EXISTS product_mapping_components_target_contractor_check;
ALTER TABLE site_integration.product_mapping_components ADD CONSTRAINT product_mapping_components_target_contractor_check CHECK ((target_kind = 'contractor_catalog') = (contractor_id IS NOT NULL));
ALTER TABLE site_integration.product_mapping_components DROP CONSTRAINT IF EXISTS product_mapping_components_qty_per_site_unit_check;
ALTER TABLE site_integration.product_mapping_components ADD CONSTRAINT product_mapping_components_qty_per_site_unit_check CHECK (qty_per_site_unit > 0);
ALTER TABLE site_integration.product_mapping_components DROP COLUMN IF EXISTS model_id;
ALTER TABLE site_integration.product_mapping_components DROP COLUMN IF EXISTS quantity_multiplier;
CREATE TABLE IF NOT EXISTS site_integration.mapping_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_id uuid NOT NULL REFERENCES site_integration.inbox(id),
  site_line_id text NOT NULL,
  mapping_version_id uuid NOT NULL REFERENCES site_integration.product_mapping_versions(id),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(inbox_id, site_line_id)
);

CREATE TABLE IF NOT EXISTS site_integration.quote_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_id uuid NOT NULL UNIQUE REFERENCES site_integration.inbox(id),
  currency text NOT NULL CHECK (currency IN ('EUR','USD','RSD','RUB','GBP')),
  subtotal numeric(14,2),
  discount_type text CHECK (discount_type IN ('percent','fixed','none')),
  discount_value numeric(14,2),
  quoted_total numeric(14,2),
  lines jsonb NOT NULL,
  raw_quote jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION site_integration.reject_quote_snapshot_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'site_integration.quote_snapshots is immutable'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS site_integration_quote_snapshot_immutable ON site_integration.quote_snapshots;
CREATE TRIGGER site_integration_quote_snapshot_immutable BEFORE UPDATE OR DELETE ON site_integration.quote_snapshots
  FOR EACH ROW EXECUTE FUNCTION site_integration.reject_quote_snapshot_mutation();
`;
