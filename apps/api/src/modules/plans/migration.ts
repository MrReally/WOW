export const plansMigration = `
CREATE SCHEMA IF NOT EXISTS plans;

-- Each row is a version of a project's technical plan; one is current.
CREATE TABLE IF NOT EXISTS plans.plans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,            -- opaque
  venue_id   uuid,                     -- opaque
  name       text NOT NULL,
  version    integer NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  stage_w    integer NOT NULL DEFAULT 400,
  stage_h    integer NOT NULL DEFAULT 560,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plans_project_idx ON plans.plans(project_id);
-- Keep version/current selection deterministic even under concurrent requests.
WITH ranked AS (
  SELECT id,row_number() OVER (PARTITION BY project_id ORDER BY version,created_at,id) AS next_version
  FROM plans.plans
)
UPDATE plans.plans p SET version=ranked.next_version FROM ranked WHERE p.id=ranked.id AND p.version<>ranked.next_version;
WITH ranked AS (
  SELECT id,row_number() OVER (PARTITION BY project_id ORDER BY is_current DESC,version DESC,created_at DESC,id DESC) AS priority
  FROM plans.plans
)
UPDATE plans.plans p SET is_current=false FROM ranked WHERE p.id=ranked.id AND ranked.priority>1 AND p.is_current=true;
CREATE UNIQUE INDEX IF NOT EXISTS plans_project_version_idx ON plans.plans(project_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS plans_one_current_idx ON plans.plans(project_id) WHERE is_current=true;

CREATE TABLE IF NOT EXISTS plans.elements (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    uuid NOT NULL REFERENCES plans.plans(id) ON DELETE CASCADE,
  layer      text NOT NULL,
  kind       text NOT NULL,
  label      text NOT NULL DEFAULT '',
  x          numeric(9,2) NOT NULL,
  y          numeric(9,2) NOT NULL,
  rotation   numeric(7,2) NOT NULL DEFAULT 0,
  w          numeric(9,2),
  h          numeric(9,2),
  model_id   uuid,                     -- opaque equipment id
  unit_id    uuid,                     -- opaque equipment id
  attrs      jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS elements_plan_idx ON plans.elements(plan_id);

-- Cable endpoints: a 'cable' element links two other elements on the same plan.
ALTER TABLE plans.elements ADD COLUMN IF NOT EXISTS from_id uuid;
ALTER TABLE plans.elements ADD COLUMN IF NOT EXISTS to_id   uuid;
CREATE INDEX IF NOT EXISTS elements_from_idx ON plans.elements(from_id) WHERE from_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS elements_to_idx ON plans.elements(to_id) WHERE to_id IS NOT NULL;
`;
