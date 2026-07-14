import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { env } from "../env.js";

const run = promisify(execFile);
const MAX_OUTPUT = 16 * 1024 * 1024;
export const MAX_RESTORE_BYTES = 512 * 1024 * 1024;

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function commandAvailable(command: string): Promise<boolean> {
  try {
    await run(command, ["--version"], { maxBuffer: MAX_OUTPUT });
    return true;
  } catch {
    return false;
  }
}

export async function databaseToolsStatus() {
  const [pgDump, pgRestore] = await Promise.all([commandAvailable("pg_dump"), commandAvailable("pg_restore")]);
  return { available: pgDump && pgRestore, pgDump, pgRestore };
}

async function verifyDump(file: string): Promise<void> {
  const header = await readFile(file).then((value) => value.subarray(0, 5));
  if (header.toString("ascii") !== "PGDMP") throw new Error("not a PostgreSQL custom-format backup");
  await run("pg_restore", ["--list", file], { maxBuffer: MAX_OUTPUT });
}

async function pruneSafetyBackups(): Promise<void> {
  const entries = (await readdir(env.backupDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.startsWith("sever-before-restore-") && entry.name.endsWith(".dump"))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  await Promise.all(entries.slice(10).map((name) => rm(join(env.backupDir, name), { force: true })));
}

export async function createDatabaseBackup(prefix = "sever-backup"): Promise<{ file: string; filename: string; size: number; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "sever-backup-"));
  const filename = `${prefix}-${stamp()}.dump`;
  const file = join(dir, filename);
  try {
    await run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--file=${file}`, env.databaseUrl], { maxBuffer: MAX_OUTPUT });
    await verifyDump(file);
    return { file, filename, size: (await stat(file)).size, cleanup: () => rm(dir, { recursive: true, force: true }) };
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

export async function restoreDatabaseBackup(uploadedFile: string): Promise<{ safetyBackupFile: string }> {
  await verifyDump(uploadedFile);
  await mkdir(env.backupDir, { recursive: true });
  const safetyBackupFile = join(env.backupDir, `sever-before-restore-${stamp()}.dump`);
  await run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--file=${safetyBackupFile}`, env.databaseUrl], { maxBuffer: MAX_OUTPUT });
  await verifyDump(safetyBackupFile);
  await run("pg_restore", [
    "--clean",
    "--if-exists",
    "--single-transaction",
    "--no-owner",
    "--no-privileges",
    `--dbname=${env.databaseUrl}`,
    uploadedFile,
  ], { maxBuffer: MAX_OUTPUT });
  await pruneSafetyBackups();
  return { safetyBackupFile: basename(safetyBackupFile) };
}
