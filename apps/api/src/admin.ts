import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { RouteContext } from "./core/module.js";
import { requirePermission } from "./core/auth.js";
import { AppError, BadRequest, Conflict, Forbidden } from "./core/errors.js";
import { resetSchemas } from "./core/reset.js";
import { runMigrations } from "./core/migrate.js";
import { seedDemo } from "./seedData.js";
import type { Wiring } from "./registry.js";
import { env } from "./env.js";
import { createDatabaseBackup, databaseToolsStatus, MAX_RESTORE_BYTES, restoreDatabaseBackup } from "./core/databaseBackup.js";
import { startMaintenance, stopMaintenance } from "./core/maintenance.js";

const resetSchema = z.object({ mode: z.enum(["demo", "empty"]) });

function dataResetStatus() {
  const available = !env.isProd || env.allowDataReset;
  return {
    available,
    reason: available ? null : "disabled_in_production",
  };
}

// Operational endpoints that span all modules (not a domain module). Lives at
// the composition layer because only the host knows the whole graph.
export function registerAdminRoutes(app: FastifyInstance, ctx: RouteContext, wiring: Wiring): void {
  let restoreRunning = false;

  app.get("/api/admin/backup-status", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "data.backup");
    const tools = await databaseToolsStatus();
    return {
      available: tools.available,
      restoreAvailable: tools.available && (!env.isProd || env.allowDataRestore),
      reason: tools.available ? null : "postgres_tools_missing",
      restoreReason: tools.available && env.isProd && !env.allowDataRestore ? "restore_disabled_in_production" : null,
      maxRestoreBytes: MAX_RESTORE_BYTES,
    };
  });

  app.get("/api/admin/backup", async (req, reply) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "data.backup");
    const tools = await databaseToolsStatus();
    if (!tools.available) throw new AppError("backup_unavailable", "На сервере не установлены PostgreSQL backup tools", 503);
    const backup = await createDatabaseBackup();
    reply.raw.once("close", () => void backup.cleanup());
    return reply
      .header("content-type", "application/vnd.postgresql.custom")
      .header("content-disposition", `attachment; filename="${backup.filename}"`)
      .header("content-length", String(backup.size))
      .header("cache-control", "no-store")
      .send(createReadStream(backup.file));
  });

  app.post("/api/admin/restore", { bodyLimit: MAX_RESTORE_BYTES }, async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "data.restore");
    if (env.isProd && !env.allowDataRestore) throw Forbidden("database restore is disabled in production");
    if (restoreRunning) throw Conflict("database restore is already running");
    if (req.headers["x-sever-restore-confirm"] !== "RESTORE") throw BadRequest("restore confirmation is required");
    if (!Buffer.isBuffer(req.body) || req.body.length < 5) throw BadRequest("backup file is empty");
    if (req.body.length > MAX_RESTORE_BYTES) throw new AppError("backup_too_large", "backup file is too large", 413);
    const tools = await databaseToolsStatus();
    if (!tools.available) throw new AppError("restore_unavailable", "На сервере не установлены PostgreSQL backup tools", 503);

    const dir = await mkdtemp(join(tmpdir(), "sever-restore-"));
    const file = join(dir, "uploaded.dump");
    restoreRunning = true;
    startMaintenance("database_restore");
    try {
      await writeFile(file, req.body);
      const result = await restoreDatabaseBackup(file);
      return { ok: true, safetyBackupFile: result.safetyBackupFile, restoredAt: new Date().toISOString() };
    } finally {
      restoreRunning = false;
      stopMaintenance();
      await rm(dir, { recursive: true, force: true });
    }
  });

  app.get("/api/admin/reset-status", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "data.reset");
    return dataResetStatus();
  });

  app.post("/api/admin/reset", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "data.reset");
    if (!dataResetStatus().available) {
      throw Forbidden("data reset is disabled in production");
    }
    const { mode } = resetSchema.parse(req.body);

    await resetSchemas();
    await runMigrations();
    if (mode === "demo") {
      await seedDemo({
        people: wiring.people.service,
        equipment: wiring.equipment.service,
        projects: wiring.projects.service,
        finance: wiring.finance.service,
        venues: wiring.venues.service,
        plans: wiring.plans.service,
        catalog: wiring.catalog.service,
      });
    }
    return { ok: true, mode };
  });
}
