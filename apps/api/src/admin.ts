import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteContext } from "./core/module.js";
import { requirePermission } from "./core/auth.js";
import { resetSchemas } from "./core/reset.js";
import { runMigrations } from "./core/migrate.js";
import { seedDemo } from "./seedData.js";
import type { Wiring } from "./registry.js";

const resetSchema = z.object({ mode: z.enum(["demo", "empty"]) });

// Operational endpoints that span all modules (not a domain module). Lives at
// the composition layer because only the host knows the whole graph.
export function registerAdminRoutes(app: FastifyInstance, ctx: RouteContext, wiring: Wiring): void {
  app.post("/api/admin/reset", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "data.reset");
    const { mode } = resetSchema.parse(req.body);

    await resetSchemas();
    await runMigrations();
    if (mode === "demo") {
      await seedDemo({
        people: wiring.people.service,
        equipment: wiring.equipment.service,
        projects: wiring.projects.service,
        finance: wiring.finance.service,
      });
    }
    return { ok: true, mode };
  });
}
