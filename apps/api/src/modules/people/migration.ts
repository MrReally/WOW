export const peopleMigration = `
CREATE SCHEMA IF NOT EXISTS people;

CREATE TABLE IF NOT EXISTS people.users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id     text NOT NULL UNIQUE,
  display_name    text NOT NULL,
  role            text NOT NULL CHECK (role IN ('admin','warehouse','tech')),
  hourly_rate_eur numeric(12,2),
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
`;
