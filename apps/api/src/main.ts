import { buildApp } from "./app.js";
import { runMigrations } from "./core/migrate.js";
import { closePool } from "./core/db.js";
import { env } from "./env.js";

async function main() {
  // Apply migrations on boot so a fresh container is usable immediately.
  await runMigrations();

  const { app } = await buildApp();
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
