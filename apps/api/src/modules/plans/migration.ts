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
`;
