import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CURRENCIES, type Finance } from "@sever/contracts";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";
import type { BillingService } from "./service.js";
import { renderEstimatePdf } from "./pdf.js";

const invoicePdfSchema = z.object({
  number: z.string(),
  date: z.string(),
  place: z.string(),
  clientName: z.string(),
  company: z.object({
    name: z.string(),
    requisites: z.string(),
    phone: z.string(),
    email: z.string(),
    telegram: z.string(),
  }),
  lang: z.enum(["EN", "RU", "RS"]),
  currency: z.enum(CURRENCIES as [string, ...string[]]),
  rateToEUR: z.number().positive().nullable(),
  note: z.string(),
  lines: z.array(z.object({
    id: z.string(),
    section: z.string(),
    name: z.string(),
    count: z.string(),
    priceEUR: z.number(),
    costEUR: z.number(),
    comment: z.string(),
  })),
});

export function registerBillingRoutes(app: FastifyInstance, ctx: RouteContext, service: BillingService): void {
  app.get<{ Params: { id: string } }>("/api/projects/:id/invoice", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage");
    return service.projectInvoice(req.params.id);
  });
  app.post<{ Params: { id: string } }>("/api/projects/:id/invoice/pdf", async (req, reply) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage");
    const body = invoicePdfSchema.parse(req.body) as Finance.EstimatePdfRequestDTO;
    const pdf = renderEstimatePdf(body);
    const safeNumber = (body.number || `estimate-${req.params.id}`).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${safeNumber || "estimate"}.pdf"`)
      .send(pdf);
  });
  app.get("/api/billing/client-debts", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage");
    return service.outstandingClientDebts();
  });
}
