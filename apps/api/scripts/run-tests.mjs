import { spawnSync } from "node:child_process";

const watch = process.argv.includes("--watch");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://sever:sever@localhost:5432/sever_test";

function run(args, env = process.env) {
  const result = spawnSync(pnpm, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(["exec", "tsx", "src/core/prepareTestDb.ts"]);
run(
  ["exec", "vitest", watch ? "--watch" : "run"],
  { ...process.env, DATABASE_URL: databaseUrl },
);
