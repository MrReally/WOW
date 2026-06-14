import type { FastifyInstance } from "fastify";
import type { RouteContext } from "../../core/module.js";
import type { ApexService } from "./service.js";

export function registerApexRoutes(
  app: FastifyInstance,
  ctx: RouteContext,
  service: ApexService
): void {
  app.get("/api/apex/dashboard", async (req) => {
    await ctx.auth(req);
    return service.dashboard();
  });
}
