import { describe, expect, it } from "vitest";
import { createFullExportCsv } from "../src/modules/billing/export.js";

function parseLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"' && quoted && line[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ";" && !quoted) { cells.push(cell); cell = ""; }
    else cell += char;
  }
  cells.push(cell);
  return cells;
}

describe("full project export", () => {
  it("keeps reserve rows, allocates shared payments once, and hides protected project notes", async () => {
    const createdAt = "2026-10-01T10:00:00.000Z";
    const project = {
      id: "project", name: "Project", clientId: "client", status: "confirmed", operationStage: "prep",
      warehouseTurnoverCompletedAt: null, financeTracked: true, venueId: "venue", dressCodeOptionId: null,
      dressCodeLabel: null, dressCodeUniform: false, note: "secret", startsAt: createdAt,
      endsAt: "2026-10-02T10:00:00.000Z", seriesId: null, seriesOccurrenceKey: null,
      seriesTemplateVersion: null, baseName: "Project", createdAt,
    };
    const transaction = {
      id: "payment", accountId: "account", projectId: "project", unitId: null, assignmentId: null,
      contractorId: "vendor", kind: "expense", category: "other", amount: 50, currency: "EUR",
      fxRateToEUR: 1, amountEUR: 50, note: null, createdByUserId: null, updatedByUserId: null,
      updatedAt: null, voidedByUserId: null, voidedAt: null, createdAt,
    };
    const csv = await createFullExportCsv({
      projects: {
        listProjects: async () => [project],
        listClients: async () => [{ id: "client", name: "Client", contacts: "mail", createdAt }],
        listReservations: async () => [
          { id: "gear", projectId: "project", modelId: "model", qty: 1, isReserve: false, startsAt: null, endsAt: null, resolvedUnitIds: [], createdAt },
          { id: "reserve", projectId: "project", modelId: "model", qty: 1, isReserve: true, startsAt: null, endsAt: null, resolvedUnitIds: [], createdAt },
        ],
        listAssignments: async () => [], listProjectRoles: async () => [],
        listContractorItems: async () => [
          { id: "vendor-1", projectId: "project", contractorId: "vendor", kind: "equipment", name: "A", qty: 1, priceEUR: 100, costEUR: 40, note: null, returnedAt: null, paidAt: null, booked: true, createdAt },
          { id: "vendor-2", projectId: "project", contractorId: "vendor", kind: "equipment", name: "B", qty: 1, priceEUR: 100, costEUR: 60, note: null, returnedAt: null, paidAt: null, booked: true, createdAt },
        ],
      },
      equipment: {
        listModels: async () => [{ id: "model", typeId: "type", name: "Lamp", dailyPriceEUR: 100 }],
        listTypes: async () => [{ id: "type", name: "Light" }], listUnits: async () => [], listWarehouses: async () => [],
        listContractors: async () => [{ id: "vendor", name: "Vendor", contacts: null, createdAt }], listJournal: async () => [],
      },
      venues: { list: async () => [{ id: "venue", name: "Hall", address: "Street" }] },
      people: { list: async () => [] },
      finance: {
        listAccounts: async () => [{ id: "account", name: "Cash", currency: "EUR", balance: 0, createdAt }],
        listFxRates: async () => [{ currency: "RSD", rateToEUR: 0.01, updatedAt: createdAt }],
        listProjectEstimateLines: async () => [],
        getProjectEstimateSettings: async () => ({ projectId: "project", totalDiscountType: "percent", totalDiscountValue: 10 }),
        listTransactions: async () => [transaction],
      },
    } as never, false);

    const lines = csv.replace(/^\uFEFF/, "").trim().split("\r\n");
    const headers = parseLine(lines[0]!);
    const records = lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, parseLine(line)[index]])));
    const positions = records.filter((row) => row["Подтип записи"] !== "финансовая операция");
    const contractorRows = positions.filter((row) => row["Подтип записи"] === "подрядчик");
    const reserve = positions.find((row) => row["Запись ID"] === "reserve");

    expect(reserve?.["Резерв (да/нет)"]).toBe("да");
    expect(reserve?.["Прибыль записи, EUR"]).toBe("0");
    expect(contractorRows.reduce((sum, row) => sum + Number(row["Сколько оплачено реально, EUR"]), 0)).toBe(50);
    expect(positions.reduce((sum, row) => sum + Number(row["Доля общей скидки, EUR"] || 0), 0)).toBe(30);
    expect(records.every((row) => row["Заметка проекта"] === "")).toBe(true);
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });
});
