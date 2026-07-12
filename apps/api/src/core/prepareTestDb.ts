import { Client } from "pg";

const explicit = process.env.TEST_DATABASE_URL;
if (!explicit) {
  const adminUrl = process.env.DATABASE_URL ?? "postgres://sever:sever@localhost:5432/sever";
  const target = new URL(adminUrl);
  target.pathname = "/sever_test";
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [target.pathname.slice(1)]);
  if (!exists.rowCount) await admin.query(`CREATE DATABASE ${target.pathname.slice(1)}`);
  await admin.end();
}
