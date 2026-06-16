// Destructive reset of all module schemas. Used by `pnpm seed` and the admin
// "reset" action. This is the one place allowed to touch every schema at once,
// because it operates on the whole deployment, not from inside a module.

import { pool } from "./db.js";

const MODULE_SCHEMAS = ["people", "equipment", "projects", "finance", "venues", "plans"];

export async function resetSchemas(): Promise<void> {
  await pool.query(`DROP SCHEMA IF EXISTS ${MODULE_SCHEMAS.join(", ")} CASCADE`);
}
