import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { AuthContext, Finance, Permission } from "@sever/contracts";
import { registerFinanceRoutes } from "../src/modules/finance/routes.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";
const assignmentId = "33333333-3333-4333-8333-333333333333";
const payment = { accountId, projectId, kind: "income", category: "prepayment", amount: 20, currency: "EUR" };

async function request(permissions: Permission[], method: "GET" | "POST", url: string, payload?: object, authorizeProject?: (auth: AuthContext, projectId: string) => Promise<void>) {
  const app = Fastify();
  const createTransaction = vi.fn(async (input: unknown) => input);
  const listTransactions = vi.fn(async () => [{ id: "payroll", category: "salary" }, { id: "client", category: "prepayment" }]);
  const listAccounts = vi.fn(async () => [{ id: accountId, name: "Bank", currency: "EUR", balance: 500 }]);
  app.setErrorHandler((error, _req, reply) => reply.code((error as { status?: number }).status ?? 400).send({ message: error.message }));
  registerFinanceRoutes(app, { auth: async () => ({ permissions, userId: assignmentId } as AuthContext) }, { createTransaction, listTransactions, listAccounts } as unknown as Finance.FinanceService, authorizeProject);
  const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
  await app.close();
  return { response, createTransaction, listTransactions };
}

describe("finance permission boundaries", () => {
  it("checks access to a project before returning or writing transactions", async () => {
    const deny = vi.fn(async () => { throw Object.assign(new Error("Нет доступа"), { status: 403 }); });
    const read = await request(["operations.finance.view"], "GET", `/api/finance/transactions?projectId=${projectId}`, undefined, deny);
    expect(read.response.statusCode).toBe(403);
    expect(read.listTransactions).not.toHaveBeenCalled();
    const write = await request(["operations.finance.manage"], "POST", "/api/finance/transactions", payment, deny);
    expect(write.response.statusCode).toBe(403);
    expect(write.createTransaction).not.toHaveBeenCalled();
  });
  it("rejects client receipts from payroll-only managers before writing", async () => {
    const result = await request(["operations.payroll.manage"], "POST", "/api/finance/transactions", payment);
    expect(result.response.statusCode).toBe(403);
    expect(result.createTransaction).not.toHaveBeenCalled();
  });
  it("rejects payroll from client-payment managers", async () => {
    const result = await request(["operations.finance.manage"], "POST", "/api/finance/transactions", { ...payment, kind: "expense", category: "salary", assignmentId });
    expect(result.response.statusCode).toBe(403);
    expect(result.createTransaction).not.toHaveBeenCalled();
  });
  it("permits linked payroll and records the authenticated author", async () => {
    const result = await request(["operations.payroll.manage"], "POST", "/api/finance/transactions", { ...payment, kind: "expense", category: "salary", assignmentId, createdByUserId: accountId });
    expect(result.response.statusCode).toBe(200);
    expect(result.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ createdByUserId: assignmentId }));
  });
  it("requires project scope for operations readers", async () => {
    const result = await request(["operations.finance.view"], "GET", "/api/finance/transactions");
    expect(result.response.statusCode).toBe(400);
    expect(result.listTransactions).not.toHaveBeenCalled();
  });
  it("hides treasury balances from operations account selectors", async () => {
    const limited = await request(["operations.finance.view"], "GET", "/api/finance/accounts");
    expect(limited.response.json()[0].balance).toBe(0);
    const full = await request(["finance.view"], "GET", "/api/finance/accounts");
    expect(full.response.json()[0].balance).toBe(500);
  });
  it.each([
    ["operations.finance.view", "client"], ["operations.payroll.view", "payroll"],
  ] as const)("limits %s to its transaction category", async (permission, id) => {
    const result = await request([permission], "GET", `/api/finance/transactions?projectId=${projectId}`);
    expect(result.response.json().map((row: { id: string }) => row.id)).toEqual([id]);
  });
  it("allows finance managers to read the complete register", async () => {
    const result = await request(["finance.manage"], "GET", "/api/finance/transactions");
    expect(result.response.statusCode).toBe(200);
    expect(result.response.json()).toHaveLength(2);
  });
});
