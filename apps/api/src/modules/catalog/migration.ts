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

-- Replace the early restaurant demo with rental-specific reference data in place.
-- IDs stay unchanged so mobile/desktop references continue to point at the same rows.
UPDATE catalog.items SET sku='CON-GAFFER-BLK', name='Скотч Gaffer чёрный', kind='product', group_name='Расходные материалы', base_unit='roll'
 WHERE sku='COLA-1L';
UPDATE catalog.items SET sku='CON-BAT-AA', name='Батарейки AA', kind='product', group_name='Расходные материалы', base_unit='pcs'
 WHERE sku='RUM-1L';
UPDATE catalog.items SET sku='KIT-STAGE-BASIC', name='Комплект расходников для сцены', kind='equipment_kit', group_name='Комплекты', base_unit='kit'
 WHERE sku='RUM-COLA';
UPDATE catalog.packaging_units SET name='Коробка 24 рулона', coefficient=24, barcode='460000000101'
 WHERE item_id=(SELECT id FROM catalog.items WHERE sku='CON-GAFFER-BLK') AND name='Бутылка 1 л';
UPDATE catalog.packaging_units SET name='Упаковка 20 штук', coefficient=20, barcode='460000000102'
 WHERE item_id=(SELECT id FROM catalog.items WHERE sku='CON-BAT-AA') AND name='Бутылка 0,7 л';
UPDATE catalog.recipe_versions SET output_unit='kit', technology='Проверить комплект перед выдачей'
 WHERE item_id=(SELECT id FROM catalog.items WHERE sku='KIT-STAGE-BASIC') AND technology='Смешать со льдом';
UPDATE catalog.recipe_lines SET unit='roll', gross_qty=2, net_qty=2, base_qty=2
 WHERE ingredient_item_id=(SELECT id FROM catalog.items WHERE sku='CON-GAFFER-BLK') AND gross_qty=0.15;
UPDATE catalog.recipe_lines SET unit='pcs', gross_qty=8, net_qty=8, base_qty=8
 WHERE ingredient_item_id=(SELECT id FROM catalog.items WHERE sku='CON-BAT-AA') AND gross_qty=0.05;
`;
