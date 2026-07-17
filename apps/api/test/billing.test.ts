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
      finance: { listTransactions: async () => [] },
      people: {},
    } as unknown as BillingDeps);

    const invoice = await billing.projectInvoice("project");

    expect(invoice.rentalLines.map((line) => line.refId)).toEqual(["billed"]);
    expect(invoice.rentalEUR).toBe(400);
    expect(invoice.invoiceEUR).toBe(400);
  });
});
