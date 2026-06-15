// Reset module schemas to a clean state and load the rich demo dataset.
// Run: `pnpm --filter @sever/api seed`

import { pool } from "./core/db.js";
import { resetSchemas } from "./core/reset.js";
import { runMigrations } from "./core/migrate.js";
import { createModules } from "./registry.js";
import { seedDemo } from "./seedData.js";

async function seed() {
  await resetSchemas();
  await runMigrations();
  const { people, equipment, projects, finance } = createModules();
  const { summary } = await seedDemo({
    people: people.service,
    equipment: equipment.service,
    projects: projects.service,
    finance: finance.service,
  });
  // eslint-disable-next-line no-console
  console.log("[seed] demo data loaded:", summary);
}

seed()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[seed] failed:", err);
    process.exit(1);
  });
