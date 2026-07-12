import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteContext } from "./core/module.js";
import { requirePermission } from "./core/auth.js";
import { Forbidden } from "./core/errors.js";
import { resetSchemas } from "./core/reset.js";
import { runMigrations } from "./core/migrate.js";
import { seedDemo } from "./seedData.js";
import type { Wiring } from "./registry.js";
import { env } from "./env.js";

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
