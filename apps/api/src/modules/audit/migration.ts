export const auditMigration = `
CREATE SCHEMA IF NOT EXISTS audit;
CREATE TABLE IF NOT EXISTS audit.entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  method text NOT NULL,
  path text NOT NULL,
  status_code integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_entries_created_idx ON audit.entries(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_entries_actor_idx ON audit.entries(actor_id, created_at DESC);
`;
