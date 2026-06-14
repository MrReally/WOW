import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/core/migrate.js";
import { closePool } from "../src/core/db.js";
import { EventBus, type DomainEvent } from "../src/core/eventBus.js";
import { createModules } from "../src/registry.js";

// Scenario #7 from the architecture addendum:
//   warehouse prepares -> tech confirms pickup -> journal -> partial return
//   -> некомплект Problem (not a block) -> Apex shows it.
//
// This doubles as a contract test: it exercises modules only through their
// public services + the event bus, never their internals.

const bus = new EventBus();
const events: DomainEvent[] = [];
const wiring = createModules(bus);

beforeAll(async () => {
  await runMigrations();
  bus.on("equipment.unit.issued", (e) => void events.push(e));
  bus.on("equipment.unit.returned", (e) => void events.push(e));
  bus.on("equipment.return.incomplete", (e) => void events.push(e));
});

afterAll(async () => {
  await closePool();
});

describe("Tech pickup/return → некомплект", () => {
  it("issues units, journals movement, raises a Problem on partial return", async () => {
    const { people, equipment, projects } = wiring;

    const tech = await people.service.create({
      telegramId: `tech-${Date.now()}`,
      displayName: "Test Tech",
      role: "tech",
    });

    const type = await equipment.service.createType({ name: `T-${Date.now()}`, trackingMode: "serial" });
    const model = await equipment.service.createModel({
      typeId: type.id,
      name: "Test Fixture",
      unitCostEUR: 1000,
      dailyPriceEUR: 50,
    });
    const u1 = await equipment.service.createUnit({ modelId: model.id, assetTag: `A-${Date.now()}-1` });
    const u2 = await equipment.service.createUnit({ modelId: model.id, assetTag: `A-${Date.now()}-2` });

    const client = await projects.service.createClient({ name: "Test Client" });
    const project = await projects.service.createProject({
      name: "Test Project",
      clientId: client.id,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    // Tech confirms pickup of both units.
    const issued = await equipment.service.issueUnits({
      projectId: project.id,
      unitIds: [u1.id, u2.id],
      actorId: tech.id,
    });
    expect(issued.every((u) => u.status === "on_project")).toBe(true);
    expect(await equipment.service.countUnitsOnProject(project.id)).toBe(2);

    // Journal recorded the issue with actor + project.
    const journal1 = await equipment.service.getUnitJournal(u1.id);
    expect(journal1.map((e) => e.action)).toContain("issued");
    expect(journal1.find((e) => e.action === "issued")?.actorId).toBe(tech.id);

    // Partial return: only u1 comes back, u2 is missing.
    const result = await equipment.service.returnUnits({
      projectId: project.id,
      returnedUnitIds: [u1.id],
      expectedUnitIds: [u1.id, u2.id],
      actorId: tech.id,
    });
    expect(result.returned).toEqual([u1.id]);
    expect(result.missing).toEqual([u2.id]);
    expect(result.problemId).not.toBeNull();

    // Returned unit is back in stock; missing unit was NOT blocked from staying out.
    expect((await equipment.service.getUnit(u1.id))?.status).toBe("in_stock");
    expect((await equipment.service.getUnit(u2.id))?.status).toBe("on_project");

    // A Problem is visible to Apex.
    const problems = await equipment.service.listProblems();
    expect(problems.some((p) => p.kind === "incomplete_return")).toBe(true);

    // Events fired across the bus.
    expect(events.some((e) => e.type === "equipment.unit.issued")).toBe(true);
    expect(events.some((e) => e.type === "equipment.return.incomplete")).toBe(true);
  });

  it("freezes FX snapshot on transactions and never recalculates", async () => {
    const { finance } = wiring;
    await finance.service.setFxRate("RSD", 0.0085);
    const account = await finance.service.createAccount({ name: `RSD-${Date.now()}`, currency: "RSD" });

    const tx = await finance.service.createTransaction({
      accountId: account.id,
      kind: "income",
      category: "prepayment",
      amount: 10000,
      currency: "RSD",
    });
    expect(tx.fxRateToEUR).toBe(0.0085);
    expect(tx.amountEUR).toBe(85);

    // Change the rate afterwards — the old transaction must keep its snapshot.
    await finance.service.setFxRate("RSD", 0.02);
    const again = (await finance.service.listTransactions()).find((t) => t.id === tx.id)!;
    expect(again.amountEUR).toBe(85);
  });
});
