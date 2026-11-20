import { readFile } from "node:fs/promises";
import { pool } from "../../core/db.js";
import { importApprovedSiteMappings } from "./importApprovedMappings.js";

const fileIndex = process.argv.indexOf("--file");
const file = fileIndex >= 0 ? process.argv[fileIndex + 1] : undefined;
if (!file) throw new Error("Usage: tsx importApprovedMappings.cli.ts --file <approved-mapping.json>");

const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (databaseUrl.pathname !== "/sever_test") {
  throw new Error("This R1 loader is test-only. DATABASE_URL must point to /sever_test.");
}

const document = JSON.parse(await readFile(file, "utf8"));
try {
  const result = await importApprovedSiteMappings(pool, document);
  console.log(`Approved mappings: ${result.inserted} inserted, ${result.unchanged} unchanged`);
} finally {
  await pool.end();
}
