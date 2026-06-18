export const financeMigration = `
CREATE SCHEMA IF NOT EXISTS finance;

CREATE TABLE IF NOT EXISTS finance.fx_rates (
  currency    text PRIMARY KEY,
  rate_to_eur numeric(18,8) NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance.accounts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  currency   text NOT NULL,
  balance    numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Each transaction freezes the FX rate at creation. amount_eur is computed once
-- and never recalculated when rates change later.
CREATE TABLE IF NOT EXISTS finance.transactions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES finance.accounts(id),
  project_id     uuid,                 -- opaque id
  unit_id        uuid,                 -- opaque id (for per-unit payback)
  kind           text NOT NULL CHECK (kind IN ('income','expense')),
  category       text NOT NULL,
  amount         numeric(14,2) NOT NULL,
  currency       text NOT NULL,
  fx_rate_to_eur numeric(18,8) NOT NULL,
  amount_eur     numeric(14,2) NOT NULL,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tx_project_idx ON finance.transactions(project_id);
CREATE INDEX IF NOT EXISTS tx_unit_idx ON finance.transactions(unit_id);

-- Who recorded the transaction (opaque people id).
ALTER TABLE finance.transactions ADD COLUMN IF NOT EXISTS created_by uuid;

-- Singleton config row (amortization formula, etc.).
CREATE TABLE IF NOT EXISTS finance.settings (
  id                  integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  projects_to_payback integer NOT NULL DEFAULT 10
);
INSERT INTO finance.settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- EUR is the base currency; its rate is always 1.
INSERT INTO finance.fx_rates (currency, rate_to_eur) VALUES ('EUR', 1)
  ON CONFLICT (currency) DO NOTHING;
`;
