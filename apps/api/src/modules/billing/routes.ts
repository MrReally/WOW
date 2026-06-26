import type { FastifyInstance } from "fastify";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";
import type { BillingService } from "./service.js";

export function registerBillingRoutes(app: FastifyInstance, ctx: RouteContext, service: BillingService): void {
  app.get<{ Params: { id: string } }>("/api/projects/:id/invoice", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage");
    return service.projectInvoice(req.params.id);
  });
  app.get("/api/billing/client-debts", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage");
    return service.outstandingClientDebts();
  });
}
