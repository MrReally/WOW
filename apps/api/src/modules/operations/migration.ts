export const migration = `
CREATE SCHEMA IF NOT EXISTS operations;
CREATE TABLE IF NOT EXISTS operations.documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number text NOT NULL UNIQUE,
 kind text NOT NULL CHECK(kind IN ('issue','return','transfer','inventory')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted','reversed')),
 payload jsonb NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 posted_at timestamptz, reversed_at timestamptz
);
CREATE INDEX IF NOT EXISTS operations_documents_status_idx ON operations.documents(status,created_at DESC);
`;
