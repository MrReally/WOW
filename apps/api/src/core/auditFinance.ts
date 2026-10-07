import { pool, closePool } from "./db.js";
import { auditFinance } from "../modules/finance/audit.js";

try {
  const report = await auditFinance(pool);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 2;
} finally {
  await closePool();
}
