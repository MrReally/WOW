import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthContext, Finance } from "@sever/contracts";
import { CURRENCIES } from "@sever/contracts";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";
import { BadRequest, NotFound } from "../../core/errors.js";

const fullRead = (auth: AuthContext) => auth.permissions.some(p => p === "finance.view" || p === "finance.manage");
function requireTransactionWrite(auth: AuthContext, transaction: Pick<Finance.CreateTransactionInput, "category" | "kind" | "projectId" | "assignmentId" | "contractorId">) {
  if (auth.permissions.includes("finance.manage")) return;
  if (!transaction.projectId) throw BadRequest("операция в Operations требует проекта");
  if (transaction.category === "salary" && transaction.kind === "expense" && transaction.assignmentId) {
    requirePermission(auth, "operations.payroll.manage");
  } else if ((transaction.kind === "income" && ["prepayment", "debt_settlement"].includes(transaction.category)) || (transaction.kind === "expense" && !!transaction.contractorId)) {
    requirePermission(auth, "operations.finance.manage");
  } else {
    requirePermission(auth, "finance.manage");
  }
}

const fxSchema = z.object({
  currency: z.enum(CURRENCIES as [string, ...string[]]),
  rateToEUR: z.number().positive(),
});
const accountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  currency: z.enum(CURRENCIES as [string, ...string[]]),
});
const accountUpdateSchema = z.object({ name: z.string().trim().min(1) });
const txSchema = z.object({
  requestKey: z.string().uuid().optional(),
  accountId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  unitId: z.string().uuid().nullable().optional(),
  assignmentId: z.string().uuid().nullable().optional(),
  contractorId: z.string().uuid().nullable().optional(),
  kind: z.enum(["income", "expense"]),
  category: z.enum([
    "rental_revenue",
    "prepayment",
    "debt_settlement",
    "purchase",
    "repair",
    "salary",
    "other",
  ]),
  amount: z.number().positive(),
  currency: z.enum(CURRENCIES as [string, ...string[]]),
  note: z.string().nullable().optional(),
});
const txUpdateSchema = z.object({ accountId: z.string().uuid(), amount: z.number().positive(), note: z.string().nullable().optional() });
const invoiceCompanySchema = z.object({
  name: z.string(),
  requisites: z.string(),
  phone: z.string(),
  email: z.string(),
  telegram: z.string(),
  logoDataUrl: z.string().max(3_000_000).regex(/^data:image\/(?:png|jpeg);base64,/).nullable().optional().default(null),
});
const invoiceVersionLineSchema = z.object({
  id: z.string(),
  section: z.string(),
  name: z.string(),
  count: z.string(),
  priceEUR: z.number().nonnegative(),
  costEUR: z.number().nonnegative(),
  comment: z.string(),
});
const invoiceVersionSchema = z.object({
  number: z.string(),
  date: z.string(),
  place: z.string(),
  clientName: z.string(),
  totalEUR: z.number().nonnegative(),
  rateToEUR: z.number().positive().nullable().optional(),
  company: invoiceCompanySchema.nullable().optional(),
  currency: z.enum(CURRENCIES as [string, ...string[]]),
  lang: z.enum(["EN", "RU", "RS"]),
  lines: z.array(invoiceVersionLineSchema),
  totalDiscountType: z.enum(["percent", "fixed_rsd", "fixed_eur"]),
  totalDiscountValue: z.number().nonnegative(),
  note: z.string().optional(),
});
const estimateLineSchema = z.object({
  id: z.string().uuid().optional(),
  source: z.enum(["equipment", "contractor", "labor", "manual"]).optional(),
  sourceRefId: z.string().uuid().nullable().optional(),
  section: z.string(),
  name: z.string().trim().min(1),
  qty: z.number().positive(),
  priceEUR: z.number().nonnegative(),
  costEUR: z.number().nonnegative(),
  discountType: z.enum(["percent", "fixed_rsd", "fixed_eur"]).optional(),
  discountValue: z.number().nonnegative().optional(),
  comment: z.string().optional(),
  hidden: z.boolean().optional(),
}).refine((value) => (value.discountType ?? "percent") !== "percent" || (value.discountValue ?? 0) <= 100, {
  message: "percentage discount cannot exceed 100",
  path: ["discountValue"],
});
const estimateSettingsSchema = z.object({
  totalDiscountType: z.enum(["percent", "fixed_rsd", "fixed_eur"]),
  totalDiscountValue: z.number().nonnegative(),
}).refine((value) => value.totalDiscountType !== "percent" || value.totalDiscountValue <= 100, {
  message: "percentage discount cannot exceed 100",
  path: ["totalDiscountValue"],
});

export function registerFinanceRoutes(
  app: FastifyInstance,
  ctx: RouteContext,
  service: Finance.FinanceService,
  authorizeProject?: (auth: AuthContext, projectId: string) => Promise<void>
): void {
  // ── FX (admin only) ──
  app.get("/api/finance/fx", async (req) => {
    await ctx.auth(req);
    return service.listFxRates();
  });
  app.put("/api/finance/fx", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.manage");
    const body = fxSchema.parse(req.body);
    return service.setFxRate(body.currency as Finance.FxRateDTO["currency"], body.rateToEUR);
  });

  // ── Accounts ──
  app.get("/api/finance/accounts", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage", "operations.finance.view", "operations.finance.manage", "operations.payroll.view", "operations.payroll.manage");
    const accounts = await service.listAccounts();
    // Operations needs account identities for payment entry, not treasury balances.
    return fullRead(auth) ? accounts : accounts.map(account => ({ ...account, balance: 0 }));
  });
  app.post("/api/finance/accounts", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.manage");
    return service.createAccount(accountSchema.parse(req.body) as { name: string; currency: Finance.AccountDTO["currency"] });
  });
  app.patch<{ Params: { id: string } }>("/api/finance/accounts/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.manage");
    return service.updateAccount(req.params.id, accountUpdateSchema.parse(req.body));
  });

  // ── Transactions ──
  app.get<{ Querystring: { projectId?: string; unitId?: string; includeVoided?: string } }>(
    "/api/finance/transactions",
    async (req) => {
      const auth = await ctx.auth(req);
      requirePermission(auth, "finance.view", "finance.manage", "operations.finance.view", "operations.finance.manage", "operations.payroll.view", "operations.payroll.manage");
      const filter = z.object({ projectId: z.string().uuid().optional(), unitId: z.string().uuid().optional(), includeVoided: z.enum(["true", "false"]).optional() }).parse(req.query);
      if (!fullRead(auth) && !filter.projectId) throw BadRequest("для просмотра операций укажите проект");
      if (filter.projectId) await authorizeProject?.(auth, filter.projectId);
      const rows = await service.listTransactions({ ...filter, includeVoided: filter.includeVoided === "true" });
      if (fullRead(auth)) return rows;
      const payroll = auth.permissions.some(p => p === "operations.payroll.view" || p === "operations.payroll.manage");
      const client = auth.permissions.some(p => p === "operations.finance.view" || p === "operations.finance.manage");
      return rows.filter(row => row.category === "salary"
        ? payroll
        : client && (["prepayment", "debt_settlement"].includes(row.category) || !!row.contractorId));
    }
  );
  app.post("/api/finance/transactions", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.manage", "operations.finance.manage", "operations.payroll.manage");
    const body = txSchema.parse(req.body);
    requireTransactionWrite(auth, body);
    if (body.projectId) await authorizeProject?.(auth, body.projectId);
    return service.createTransaction({ ...body, createdByUserId: auth.userId } as Finance.CreateTransactionInput);
  });
  app.patch<{ Params: { id: string } }>("/api/finance/transactions/:id", async (req) => {
    const auth = await ctx.auth(req);
    const transaction = (await service.listTransactions({ includeVoided: true })).find(item => item.id === req.params.id);
    if (!transaction) throw NotFound("transaction", req.params.id);
    requireTransactionWrite(auth, transaction);
    if (transaction.projectId) await authorizeProject?.(auth, transaction.projectId);
    return service.updateTransaction(req.params.id, txUpdateSchema.parse(req.body), auth.userId);
  });
  app.post<{ Params: { id: string } }>("/api/finance/transactions/:id/void", async (req) => {
    const auth = await ctx.auth(req);
    const transaction = (await service.listTransactions({ includeVoided: true })).find(item => item.id === req.params.id);
    if (!transaction) throw NotFound("transaction", req.params.id);
    requireTransactionWrite(auth, transaction);
    if (transaction.projectId) await authorizeProject?.(auth, transaction.projectId);
    return service.voidTransaction(req.params.id, auth.userId);
  });

  // ── Aggregates ──
  app.get<{ Params: { id: string } }>("/api/finance/projects/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage", "operations.finance.view", "operations.finance.manage");
    await authorizeProject?.(auth, req.params.id);
    return service.projectFinance(req.params.id);
  });
  app.get("/api/finance/debts", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage");
    return service.outstandingDebts();
  });
  app.get<{ Params: { id: string } }>("/api/projects/:id/estimate-lines", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage");
    return service.listProjectEstimateLines(req.params.id);
  });
  app.put<{ Params: { id: string } }>("/api/projects/:id/estimate-lines", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.manage");
    await authorizeProject?.(auth, req.params.id);
    const body = z.object({ lines: z.array(estimateLineSchema), settings: estimateSettingsSchema.optional() }).parse(req.body);
    return service.replaceProjectEstimateLines(req.params.id, body.lines as Finance.SaveProjectEstimateLineInput[], body.settings);
  });
  app.get<{ Params: { id: string } }>("/api/projects/:id/estimate-settings", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage");
    return service.getProjectEstimateSettings(req.params.id);
  });
  app.put<{ Params: { id: string } }>("/api/projects/:id/estimate-settings", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.manage");
    await authorizeProject?.(auth, req.params.id);
    return service.setProjectEstimateSettings(req.params.id, estimateSettingsSchema.parse(req.body));
  });

  app.get("/api/finance/invoice-company", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage");
    return service.getInvoiceCompanySettings();
  });
  app.put("/api/finance/invoice-company", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.manage");
    return service.setInvoiceCompanySettings(invoiceCompanySchema.parse(req.body) as Finance.InvoiceCompanySettingsDTO);
  });
  app.get<{ Params: { id: string } }>("/api/projects/:id/invoice/versions", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage");
    return service.listInvoiceVersions(req.params.id);
  });
  app.post<{ Params: { id: string } }>("/api/projects/:id/invoice/versions", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.manage");
    await authorizeProject?.(auth, req.params.id);
    const body = invoiceVersionSchema.parse(req.body);
    return service.createInvoiceVersion({ ...body, projectId: req.params.id } as Finance.CreateInvoiceVersionInput);
  });
}
