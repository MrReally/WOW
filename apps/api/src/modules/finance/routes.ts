import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Finance } from "@sever/contracts";
import { CURRENCIES } from "@sever/contracts";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";

const fxSchema = z.object({
  currency: z.enum(CURRENCIES as [string, ...string[]]),
  rateToEUR: z.number().positive(),
});
const accountSchema = z.object({
  name: z.string().min(1),
  currency: z.enum(CURRENCIES as [string, ...string[]]),
});
const txSchema = z.object({
  accountId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  unitId: z.string().uuid().nullable().optional(),
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

export function registerFinanceRoutes(
  app: FastifyInstance,
  ctx: RouteContext,
  service: Finance.FinanceService
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
    requirePermission(auth, "finance.view");
    return service.listAccounts();
  });
  app.post("/api/finance/accounts", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.manage");
    return service.createAccount(accountSchema.parse(req.body) as { name: string; currency: Finance.AccountDTO["currency"] });
  });

  // ── Transactions ──
  app.get<{ Querystring: { projectId?: string; unitId?: string } }>(
    "/api/finance/transactions",
    async (req) => {
      const auth = await ctx.auth(req);
      requirePermission(auth, "finance.view");
      return service.listTransactions({ projectId: req.query.projectId, unitId: req.query.unitId });
    }
  );
  app.post("/api/finance/transactions", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.manage");
    return service.createTransaction(txSchema.parse(req.body) as Finance.CreateTransactionInput);
  });

  // ── Aggregates ──
  app.get<{ Params: { id: string } }>("/api/finance/projects/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view");
    return service.projectFinance(req.params.id);
  });
  app.get("/api/finance/debts", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view");
    return service.outstandingDebts();
  });
}
