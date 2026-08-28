import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CURRENCIES, type AppSettings, type Finance } from "@sever/contracts";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";
import { AppError, BadRequest } from "../../core/errors.js";
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
  totalDiscountEUR: z.number().nonnegative(),
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

function pdfFilename(number: string, projectId: string): string {
  const safeNumber = (number || `estimate-${projectId}`).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
  return `${safeNumber || "estimate"}.pdf`;
}

type SendTelegramDocument = (
  chatId: string | null,
  document: Buffer,
  filename: string,
  caption?: string
) => Promise<{ chatId: string; messageId: number } | null>;

export function registerBillingRoutes(
  app: FastifyInstance,
  ctx: RouteContext,
  service: BillingService,
  appSettings: AppSettings.AppSettingsService,
  sendTelegramDocument: SendTelegramDocument
): void {
  app.get<{ Params: { id: string } }>("/api/projects/:id/invoice", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage", "operations.finance.view", "operations.finance.manage");
    return service.projectInvoice(req.params.id);
  });
  app.post<{ Params: { id: string } }>("/api/projects/:id/invoice/pdf", async (req, reply) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage");
    const body = invoicePdfSchema.parse(req.body) as Finance.EstimatePdfRequestDTO;
    const pdf = await renderEstimatePdf(body, await appSettings.getDateTimeSettings());
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${pdfFilename(body.number, req.params.id)}"`)
      .send(pdf);
  });
  app.post<{ Params: { id: string } }>("/api/projects/:id/invoice/pdf/telegram", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage");
    if (!auth.telegramId) throw BadRequest("К аккаунту не привязан Telegram");
    const body = invoicePdfSchema.parse(req.body) as Finance.EstimatePdfRequestDTO;
    const pdf = await renderEstimatePdf(body, await appSettings.getDateTimeSettings());
    const filename = pdfFilename(body.number, req.params.id);
    const sent = await sendTelegramDocument(auth.telegramId, pdf, filename);
    if (!sent) throw new AppError("telegram_delivery_failed", "Не удалось отправить PDF в Telegram. Убедитесь, что бот запущен и может писать вам.", 502);
    return { sent: true, filename };
  });
  app.get("/api/billing/client-debts", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage");
    return service.outstandingClientDebts();
  });
}
