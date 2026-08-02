import { randomBytes } from "node:crypto";
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

const PDF_LINK_TTL_MS = 2 * 60 * 1000;
const MAX_PDF_LINKS = 50;
const pdfLinks = new Map<string, { projectId: string; filename: string; pdf: Buffer; expiresAt: number }>();

function prunePdfLinks(): void {
  const now = Date.now();
  for (const [token, value] of pdfLinks) if (value.expiresAt <= now) pdfLinks.delete(token);
  while (pdfLinks.size >= MAX_PDF_LINKS) {
    const oldest = pdfLinks.keys().next().value as string | undefined;
    if (!oldest) break;
    pdfLinks.delete(oldest);
  }
}

function pdfFilename(number: string, projectId: string): string {
  const safeNumber = (number || `estimate-${projectId}`).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
  return `${safeNumber || "estimate"}.pdf`;
}

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
    const pdf = await renderEstimatePdf(body);
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${pdfFilename(body.number, req.params.id)}"`)
      .send(pdf);
  });
  app.post<{ Params: { id: string } }>("/api/projects/:id/invoice/pdf-link", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage");
    const body = invoicePdfSchema.parse(req.body) as Finance.EstimatePdfRequestDTO;
    const pdf = await renderEstimatePdf(body);
    const token = randomBytes(24).toString("base64url");
    const filename = pdfFilename(body.number, req.params.id);
    prunePdfLinks();
    pdfLinks.set(token, { projectId: req.params.id, filename, pdf, expiresAt: Date.now() + PDF_LINK_TTL_MS });
    return { url: `/api/projects/${encodeURIComponent(req.params.id)}/invoice/pdf/${token}`, filename, expiresInSeconds: PDF_LINK_TTL_MS / 1000 };
  });
  app.get<{ Params: { id: string; token: string } }>("/api/projects/:id/invoice/pdf/:token", async (req, reply) => {
    prunePdfLinks();
    const download = pdfLinks.get(req.params.token);
    if (!download || download.projectId !== req.params.id) {
      return reply.status(404).send({ error: { code: "not_found", message: "PDF link expired or was not found" } });
    }
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="${download.filename}"`)
      .header("Cache-Control", "private, no-store")
      .header("X-Content-Type-Options", "nosniff")
      .send(download.pdf);
  });
  app.get("/api/billing/client-debts", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage");
    return service.outstandingClientDebts();
  });
}
