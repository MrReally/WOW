import pg from "pg";
import { env } from "../env.js";

// One pool for the monolith. Each module owns its own Postgres schema and only
// ever issues SQL against its own schema — that boundary is what makes a module
// extractable into a separate service+database later. There are NO cross-schema
// JOINs or foreign keys; modules reference each other only by opaque IDs.

export const pool = new pg.Pool({ connectionString: env.databaseUrl });

export type Sql = pg.Pool | pg.PoolClient;

/** Run a parameterized query and return typed rows. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: Sql,
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await sql.query<T>(text, params as never[]);
  return res.rows;
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: Sql,
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, text, params);
  return rows[0] ?? null;
}

/** Run a function inside a transaction. */
export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
