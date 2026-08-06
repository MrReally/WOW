import { describe, expect, it } from "vitest";
import { createBillingService, type BillingDeps } from "../src/modules/billing/service.js";

describe("billing reserve equipment", () => {
  it("keeps reserve reservations out of the client invoice", async () => {
    const start = "2026-07-17T10:00:00.000Z";
    const end = "2026-07-19T10:00:00.000Z";
    const billing = createBillingService({
      projects: {
        getProject: async () => ({ id: "project", startsAt: start, endsAt: end }),
        listReservations: async () => [
          { id: "billed", modelId: "model", qty: 2, isReserve: false, startsAt: start, endsAt: end },
          { id: "reserve", modelId: "model", qty: 1, isReserve: true, startsAt: start, endsAt: end },
        ],
        listAssignments: async () => [],
        listProjectRoles: async () => [],
        listContractorItems: async () => [],
        listProjects: async () => [],
      },
      equipment: {
        listModels: async () => [{ id: "model", typeId: "type", name: "Fixture", dailyPriceEUR: 100 }],
        listTypes: async () => [{ id: "type", name: "Light" }],
        listContractors: async () => [],
      },
      finance: { listTransactions: async () => [], listProjectEstimateLines: async () => [] },
      people: {},
    } as unknown as BillingDeps);

    const invoice = await billing.projectInvoice("project");

    expect(invoice.rentalLines.map((line) => line.refId)).toEqual(["billed"]);
    expect(invoice.rentalEUR).toBe(400);
    expect(invoice.invoiceEUR).toBe(400);
  });

  it("replaces hidden source positions with one combined manual position", async () => {
    const start = "2026-07-17T10:00:00.000Z";
    const end = "2026-07-18T10:00:00.000Z";
    const now = new Date().toISOString();
    const billing = createBillingService({
      projects: {
        getProject: async () => ({ id: "project", startsAt: start, endsAt: end }),
        listReservations: async () => [
          { id: "courier", modelId: "courier-model", qty: 1, isReserve: false, startsAt: start, endsAt: end },
          { id: "installer", modelId: "installer-model", qty: 1, isReserve: false, startsAt: start, endsAt: end },
        ],
        listAssignments: async () => [],
        listProjectRoles: async () => [],
        listContractorItems: async () => [],
        listProjects: async () => [],
      },
      equipment: {
        listModels: async () => [
          { id: "courier-model", typeId: "type", name: "Курьер", dailyPriceEUR: 20 },
          { id: "installer-model", typeId: "type", name: "Монтажник", dailyPriceEUR: 40 },
        ],
        listTypes: async () => [{ id: "type", name: "Услуги" }],
        listContractors: async () => [],
      },
      finance: {
        listTransactions: async () => [],
        listProjectEstimateLines: async () => [
          { id: "saved-courier", projectId: "project", source: "equipment", sourceRefId: "courier", section: "Услуги", name: "Курьер", qty: 1, priceEUR: 20, costEUR: 20, comment: "", hidden: true, sortOrder: 0, createdAt: now, updatedAt: now },
          { id: "saved-installer", projectId: "project", source: "equipment", sourceRefId: "installer", section: "Услуги", name: "Монтажник", qty: 1, priceEUR: 40, costEUR: 40, comment: "", hidden: true, sortOrder: 1, createdAt: now, updatedAt: now },
          { id: "combined", projectId: "project", source: "manual", sourceRefId: null, section: "Услуги", name: "Монтаж + доставка", qty: 1, priceEUR: 60, costEUR: 60, comment: "", hidden: false, sortOrder: 2, createdAt: now, updatedAt: now },
        ],
      },
      people: {},
    } as unknown as BillingDeps);

    const invoice = await billing.projectInvoice("project");

    expect(invoice.rentalLines.map((line) => line.label)).toEqual(["Монтаж + доставка"]);
    expect(invoice.invoiceEUR).toBe(60);
    expect(invoice.costEUR).toBe(60);
    expect(invoice.profitEUR).toBe(0);
  });
});
