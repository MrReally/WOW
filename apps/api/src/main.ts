import { buildApp } from "./app.js";
import { runMigrations } from "./core/migrate.js";
import { closePool } from "./core/db.js";
import { seedDemo } from "./seedData.js";
import { env } from "./env.js";

async function main() {
  // Apply migrations on boot so a fresh container is usable immediately.
  await runMigrations();

  const { app, wiring } = await buildApp();

  // Default roles (Owner/Warehouse/Tech) always exist.
  await wiring.people.service.ensureDefaultRoles();

  // First-run convenience for containers: load demo data into an empty DB.
  if (env.seedOnStart) {
    const existing = await wiring.people.service.list();
    if (existing.length === 0) {
      app.log.info("[seed] empty database — loading demo data");
      await seedDemo({
        people: wiring.people.service,
        equipment: wiring.equipment.service,
        projects: wiring.projects.service,
        finance: wiring.finance.service,
        venues: wiring.venues.service,
        plans: wiring.plans.service,
      });
    }
  }

  await app.listen({ port: env.port, host: "0.0.0.0" });

  const shutdown = async () => {
    await app.close();
    await closePool();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[api] failed to start:", err);
  process.exit(1);
});
