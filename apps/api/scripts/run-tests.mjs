import { spawnSync } from "node:child_process";

const cliArgs = process.argv.slice(2);
if (cliArgs[0] === "--") cliArgs.shift();
const requestedMode = cliArgs[0] === "run" || cliArgs[0] === "watch" ? cliArgs.shift() : null;
const watch = requestedMode === "watch" || cliArgs.includes("--watch");
const vitestArgs = watch
  ? ["--watch", ...cliArgs.filter((arg) => arg !== "--watch")]
  : ["run", ...cliArgs];
// Only the unfiltered suite needs the DDL test split. A targeted invocation
// must retain Vitest's usual argument semantics and run as a single command.
const fullRun = !watch && cliArgs.length === 0;
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
  return result.status ?? 1;
}

const prepared = run(["exec", "tsx", "src/core/prepareTestDb.ts"]);
if (prepared !== 0) {
  process.exitCode = prepared;
} else if (fullRun) {
  const ddlStatus = run(
    ["exec", "vitest", "run", "test/site-integration-postgres.test.ts", "--no-file-parallelism"],
    { ...process.env, DATABASE_URL: databaseUrl },
  );
  if (ddlStatus !== 0) {
    process.exitCode = ddlStatus;
  } else {
    process.exitCode = run(
      ["exec", "vitest", "run", "--exclude", "test/site-integration-postgres.test.ts"],
      { ...process.env, DATABASE_URL: databaseUrl },
    );
  }
} else {
  process.exitCode = run(
    ["exec", "vitest", ...vitestArgs],
    { ...process.env, DATABASE_URL: databaseUrl },
  );
}
