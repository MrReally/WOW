// Migration runner. Collects each module's idempotent DDL and applies it.
// Run directly: `pnpm --filter @sever/api migrate`.

import { pool } from "./db.js";
import { collectMigrations } from "../registry.js";

export async function runMigrations(): Promise<void> {
  const migrations = collectMigrations();
  const client = await pool.connect();
  try {
    for (const { name, sql } of migrations) {
      // eslint-disable-next-line no-console
      console.log(`[migrate] applying ${name}`);
      await client.query(sql);
    }
    // eslint-disable-next-line no-console
    console.log(`[migrate] done (${migrations.length} modules)`);
  } finally {
    client.release();
  }
}

// Allow running as a script.
const invokedDirectly =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  runMigrations()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[migrate] failed:", err);
      process.exit(1);
    });
}
