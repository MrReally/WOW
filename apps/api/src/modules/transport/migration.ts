export const transportMigration = `
CREATE SCHEMA IF NOT EXISTS transport;
CREATE TABLE IF NOT EXISTS transport.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number text NOT NULL UNIQUE,
  model text NOT NULL,
  required_license_category text NOT NULL DEFAULT 'B',
  fuel_type text NOT NULL CHECK (fuel_type IN ('petrol','diesel','electric','hybrid')),
  consumption_l_per_100_km numeric(8,2) NOT NULL CHECK (consumption_l_per_100_km >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;
