export const migration = `
CREATE SCHEMA IF NOT EXISTS operations;
CREATE TABLE IF NOT EXISTS operations.documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number text NOT NULL UNIQUE,
 kind text NOT NULL CHECK(kind IN ('issue','return','transfer','inventory')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted','reversed')),
 payload jsonb NOT NULL, document_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1, updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 posted_at timestamptz, reversed_at timestamptz
);
ALTER TABLE operations.documents ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE operations.documents ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE operations.documents ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE operations.documents ADD COLUMN IF NOT EXISTS document_at timestamptz;
UPDATE operations.documents SET document_at=created_at WHERE document_at IS NULL;
ALTER TABLE operations.documents ALTER COLUMN document_at SET DEFAULT now();
ALTER TABLE operations.documents ALTER COLUMN document_at SET NOT NULL;
UPDATE operations.documents SET updated_by=created_by WHERE updated_by IS NULL;
ALTER TABLE operations.documents ALTER COLUMN updated_by SET NOT NULL;
CREATE TABLE IF NOT EXISTS operations.document_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES operations.documents(id),
 version integer NOT NULL, action text NOT NULL CHECK(action IN ('created','edited','posted','reversed')),
 payload jsonb NOT NULL, document_at timestamptz NOT NULL DEFAULT now(), actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE operations.document_revisions ADD COLUMN IF NOT EXISTS document_at timestamptz;
UPDATE operations.document_revisions SET document_at=created_at WHERE document_at IS NULL;
ALTER TABLE operations.document_revisions ALTER COLUMN document_at SET DEFAULT now();
ALTER TABLE operations.document_revisions ALTER COLUMN document_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS operation_revisions_document_idx ON operations.document_revisions(document_id,created_at);
CREATE INDEX IF NOT EXISTS operations_documents_status_idx ON operations.documents(status,created_at DESC);
CREATE INDEX IF NOT EXISTS operations_documents_document_at_idx ON operations.documents(document_at DESC);
`;
