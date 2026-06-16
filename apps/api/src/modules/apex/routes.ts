import type { FastifyInstance } from "fastify";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";
import type { ApexService } from "./service.js";

export function registerApexRoutes(
  app: FastifyInstance,
  ctx: RouteContext,
  service: ApexService
): void {
  // Management dashboard — owners / top management only.
  app.get("/api/apex/dashboard", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "apex.view");
    return service.dashboard();
  });
}
