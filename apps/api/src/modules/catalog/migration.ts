export const migration = `
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE TABLE IF NOT EXISTS catalog.items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku text NOT NULL UNIQUE, name text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('product','item','semi_finished','modifier','equipment_kit')),
 group_name text, base_unit text NOT NULL, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS catalog.packaging_units (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL, name text NOT NULL,
 coefficient numeric(14,6) NOT NULL CHECK (coefficient > 0), barcode text, supplier_code text, active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS catalog_packaging_item_idx ON catalog.packaging_units(item_id);
CREATE TABLE IF NOT EXISTS catalog.recipe_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL, version integer NOT NULL,
 valid_from timestamptz NOT NULL, valid_to timestamptz, output_qty numeric(14,6) NOT NULL,
 output_unit text NOT NULL, technology text, UNIQUE(item_id, version)
);
CREATE TABLE IF NOT EXISTS catalog.recipe_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipe_id uuid NOT NULL, ingredient_item_id uuid NOT NULL,
 unit text NOT NULL, gross_qty numeric(14,6) NOT NULL, net_qty numeric(14,6) NOT NULL, base_qty numeric(14,6) NOT NULL
);
CREATE INDEX IF NOT EXISTS catalog_recipe_item_idx ON catalog.recipe_versions(item_id);
CREATE INDEX IF NOT EXISTS catalog_recipe_lines_idx ON catalog.recipe_lines(recipe_id);
`;
