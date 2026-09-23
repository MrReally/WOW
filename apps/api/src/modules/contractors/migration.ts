export const contractorsMigration = `
CREATE SCHEMA IF NOT EXISTS contractors;

CREATE TABLE IF NOT EXISTS contractors.people (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id   uuid NOT NULL,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  patronymic      text,
  phone           text,
  telegram        text,
  document_number text,
  photo_url       text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contractor_people_contractor_idx ON contractors.people(contractor_id);

CREATE TABLE IF NOT EXISTS contractors.vehicles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL,
  make          text NOT NULL,
  model         text NOT NULL,
  color         text,
  plate_number  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contractor_vehicles_contractor_idx ON contractors.vehicles(contractor_id);

CREATE TABLE IF NOT EXISTS contractors.equipment (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id    uuid NOT NULL,
  name             text NOT NULL,
  available_qty    integer NOT NULL DEFAULT 1 CHECK (available_qty >= 0),
  default_cost_eur numeric(12,2),
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contractor_equipment_contractor_idx ON contractors.equipment(contractor_id);
`;
