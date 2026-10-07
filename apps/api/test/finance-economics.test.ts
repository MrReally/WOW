import { describe, expect, it } from "vitest";
import type { Finance, Projects } from "@sever/contracts";
import { createBillingService, type BillingDeps } from "../src/modules/billing/service.js";

function fixture(options: { transactions?: Partial<Finance.TransactionDTO>[]; items?: Partial<Projects.ContractorItemDTO>[]; status?: string; tracked?: boolean } = {}) {
  const project = { id: "project", status: options.status ?? "awaiting_payment", financeTracked: options.tracked ?? true };
  return createBillingService({
    projects: { getProject: async () => project, listProjects: async () => [project], listReservations: async () => [], listAssignments: async () => [],
      listProjectRoles: async () => [{ id: "role", title: "Engineer", requiredCount: 1, rateEUR: 50 }],
      listContractorItems: async () => options.items ?? [{ id: "item", contractorId: "vendor", qty: 1, priceEUR: 200, costEUR: 100, name: "Rental", paidAt: null }] },
    equipment: { listModels: async () => [], listTypes: async () => [] },
    finance: { listTransactions: async () => options.transactions ?? [], listProjectEstimateLines: async () => [],
      getProjectEstimateSettings: async () => ({ totalDiscountType: "percent", totalDiscountValue: 0 }), listFxRates: async () => [] },
    people: {},
  } as unknown as BillingDeps);
}

describe("one project financial model", () => {
  it("includes crew in the first invoice, before any estimate is saved", async () => {
    const invoice = await fixture().projectInvoice("project");
    expect(invoice.invoiceEUR).toBe(250);
    expect(invoice.costEUR).toBe(150);
    expect(invoice.profitEUR).toBe(100);
  });
  it("settlements do not expense planned contractor and crew costs twice", async () => {
    const invoice = await fixture({ transactions: [
      { kind: "expense", category: "other", contractorId: "vendor", amountEUR: 40 },
      { kind: "expense", category: "salary", assignmentId: "worker", amountEUR: 50 },
      { kind: "expense", category: "repair", amountEUR: 10 },
      { kind: "income", category: "prepayment", amountEUR: 120 },
    ] }).projectInvoice("project");
    expect(invoice.costEUR).toBe(160);
    expect(invoice.profitEUR).toBe(90);
    expect(invoice.dueEUR).toBe(130);
  });
  it("partial contractor payments reduce payables", async () => {
    expect(await fixture({ transactions: [{ kind: "expense", contractorId: "vendor", amountEUR: 40 }] }).contractorDebts()).toEqual([{ contractorId: "vendor", debtEUR: 60 }]);
  });
  it("overpayment never creates negative payables", async () => {
    expect(await fixture({ transactions: [{ kind: "expense", contractorId: "vendor", amountEUR: 150 }] }).contractorDebts()).toEqual([]);
  });
  it("uses actual payments even when a legacy paid flag is stale", async () => {
    expect(await fixture({ items: [{ contractorId: "vendor", qty: 1, costEUR: 100, paidAt: "2026-01-01" }], transactions: [{ kind: "expense", contractorId: "vendor", amountEUR: 40 }] }).contractorDebts()).toEqual([{ contractorId: "vendor", debtEUR: 60 }]);
  });
  it("retains legacy settlements without manufacturing new cash movements", async () => {
    expect(await fixture({ items: [{ contractorId: "vendor", qty: 1, costEUR: 100, paidAt: "2026-01-01" }] }).contractorDebts()).toEqual([]);
  });
  it("restores the full payable after cancellation even if a paid marker is stale", async () => {
    expect(await fixture({ items: [{ contractorId: "vendor", qty: 1, costEUR: 100, paidAt: "2026-01-01" }], transactions: [{ kind: "expense", contractorId: "vendor", amountEUR: 100, voidedAt: "2026-01-02" }] }).contractorDebts()).toEqual([{ contractorId: "vendor", debtEUR: 100 }]);
  });
  it.each(["awaiting_payment", "completed"])("shows debt for %s", async status => {
    expect(await fixture({ status }).outstandingClientDebts()).toEqual([expect.objectContaining({ debtEUR: 250 })]);
  });
  it.each(["draft", "cancelled"])("does not label %s as a collectible debt", async status => {
    expect(await fixture({ status }).outstandingClientDebts()).toEqual([]);
  });
  it("excludes disabled financial tracking", async () => {
    expect(await fixture({ tracked: false }).outstandingClientDebts()).toEqual([]);
    expect(await fixture({ tracked: false }).contractorDebts()).toEqual([]);
  });
});
