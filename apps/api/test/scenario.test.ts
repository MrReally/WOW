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
let techRoleId = "";

/** Create a tech user with the default role (people API needs a roleId now). */
async function makeTech(name: string) {
  const created = await wiring.people.service.create({
    displayName: name,
    roleId: techRoleId,
    telegramId: `tg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  return created.user;
}

beforeAll(async () => {
  await runMigrations();
  await wiring.people.service.ensureDefaultRoles();
  techRoleId = (await wiring.people.service.getRoleByName("Монтажник"))!.id;
  bus.on("equipment.unit.issued", (e) => void events.push(e));
  bus.on("equipment.unit.returned", (e) => void events.push(e));
  bus.on("equipment.return.incomplete", (e) => void events.push(e));
});

afterAll(async () => {
  await closePool();
});

describe("Tech pickup/return → некомплект", () => {
  it("issues units, journals movement, raises a Problem on partial return", async () => {
    const { equipment, projects } = wiring;

    const tech = await makeTech("Test Tech");

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

  it("tracks cables by quantity (no serials) through issue/return", async () => {
    const { equipment, projects } = wiring;
    const type = await equipment.service.createType({ name: `Cables-${Date.now()}`, trackingMode: "quantity" });
    const model = await equipment.service.createModel({
      typeId: type.id,
      name: "DMX 10m",
      unitCostEUR: 20,
      dailyPriceEUR: 2,
      attrs: { cableType: "DMX", lengthM: 10, connectors: "XLR5" },
    });
    expect(model.trackingMode).toBe("quantity");

    await equipment.service.setModelStockTotal(model.id, 50);
    let stock = await equipment.service.modelStock(model.id);
    expect(stock).toMatchObject({ total: 50, inStock: 50, onProjects: 0 });

    const client = await projects.service.createClient({ name: "Cable Client" });
    const project = await projects.service.createProject({
      name: "Cable Project",
      clientId: client.id,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    stock = await equipment.service.issueQuantity({ projectId: project.id, modelId: model.id, qty: 30, actorId: "00000000-0000-0000-0000-000000000000" });
    expect(stock).toMatchObject({ inStock: 20, onProjects: 30 });

    // Cannot over-issue beyond available stock.
    await expect(
      equipment.service.issueQuantity({ projectId: project.id, modelId: model.id, qty: 25, actorId: "00000000-0000-0000-0000-000000000000" })
    ).rejects.toThrow();

    stock = await equipment.service.returnQuantity({ projectId: project.id, modelId: model.id, qty: 30, actorId: "00000000-0000-0000-0000-000000000000" });
    expect(stock).toMatchObject({ inStock: 50, onProjects: 0 });
  });

  it("imports a catalog from CSV rows (serial units + cable stock)", async () => {
    const { equipment } = wiring;
    const tag = `CSV-${Date.now()}`;
    const result = await equipment.service.importCatalog([
      { type: `ImpFix-${Date.now()}`, trackingMode: "serial", model: "Imp Fixture", unitCostEUR: 100, dailyPriceEUR: 5, assetTag: `${tag}-1` },
      { type: `ImpFix-${Date.now()}`, trackingMode: "serial", model: "Imp Fixture", unitCostEUR: 100, dailyPriceEUR: 5, assetTag: `${tag}-2` },
      { type: `ImpCab-${Date.now()}`, trackingMode: "quantity", model: "Imp Cable", qty: 25, cableType: "DMX", lengthM: 3, connectors: "XLR3" },
    ]);
    expect(result.unitsCreated).toBe(2);
    expect(result.stockUpdated).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it("enforces date ranges, no duplicate assignments, idempotent issue, unique resolve", async () => {
    const { projects, equipment } = wiring;
    const client = await projects.service.createClient({ name: `V-${Date.now()}` });
    const now = Date.now();
    const start = new Date(now).toISOString();
    const end = new Date(now + 3_600_000).toISOString();

    // end must be after start
    await expect(
      projects.service.createProject({ name: "bad", clientId: client.id, startsAt: end, endsAt: start })
    ).rejects.toThrow();

    const project = await projects.service.createProject({ name: "ok", clientId: client.id, startsAt: start, endsAt: end });

    // updateProject changes the window
    const later = new Date(now + 7_200_000).toISOString();
    const updated = await projects.service.updateProject(project.id, { endsAt: later, name: "renamed" });
    expect(updated.name).toBe("renamed");
    expect(updated.endsAt).toBe(later);

    // duplicate assignment rejected
    const tech = await makeTech("T");
    await projects.service.addAssignment({ projectId: project.id, userId: tech.id });
    await expect(projects.service.addAssignment({ projectId: project.id, userId: tech.id })).rejects.toThrow();

    // issue idempotency + cross-project block
    const type = await equipment.service.createType({ name: `IT-${Date.now()}`, trackingMode: "serial" });
    const model = await equipment.service.createModel({ typeId: type.id, name: "M", unitCostEUR: 1, dailyPriceEUR: 1 });
    const u = await equipment.service.createUnit({ modelId: model.id, assetTag: `IU-${Date.now()}` });
    await equipment.service.issueUnits({ projectId: project.id, unitIds: [u.id], actorId: tech.id });
    // issuing again to the same project is a no-op (no throw)
    await equipment.service.issueUnits({ projectId: project.id, unitIds: [u.id], actorId: tech.id });
    // issuing to a different project is blocked
    const other = await projects.service.createProject({ name: "other", clientId: client.id, startsAt: start, endsAt: end });
    await expect(equipment.service.issueUnits({ projectId: other.id, unitIds: [u.id], actorId: tech.id })).rejects.toThrow();

    // resolve uniqueness: a unit already resolved on an overlapping reservation can't be reused
    const u2 = await equipment.service.createUnit({ modelId: model.id, assetTag: `IU2-${Date.now()}` });
    const r1 = await projects.service.createReservation({ projectId: project.id, modelId: model.id, qty: 1, startsAt: start, endsAt: end });
    const r2 = await projects.service.createReservation({ projectId: other.id, modelId: model.id, qty: 1, startsAt: start, endsAt: end });
    await projects.service.resolveReservation(r1.id, [u2.id]);
    await expect(projects.service.resolveReservation(r2.id, [u2.id])).rejects.toThrow();
  });

  it("raises a Problem on overlapping reservations without blocking", async () => {
    const { projects, equipment } = wiring;
    const type = await equipment.service.createType({ name: `Res-${Date.now()}`, trackingMode: "serial" });
    const model = await equipment.service.createModel({ typeId: type.id, name: "Res Model", unitCostEUR: 1, dailyPriceEUR: 1 });
    const client = await projects.service.createClient({ name: "Res Client" });
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 3_600_000).toISOString();

    const p1 = await projects.service.createProject({ name: "P1", clientId: client.id, startsAt: from, endsAt: to });
    const p2 = await projects.service.createProject({ name: "P2", clientId: client.id, startsAt: from, endsAt: to });

    await projects.service.createReservation({ projectId: p1.id, modelId: model.id, qty: 1, startsAt: from, endsAt: to });
    const before = (await projects.service.listProblems()).length;
    // Overlapping reservation for the same model — must succeed AND create a Problem.
    const r2 = await projects.service.createReservation({ projectId: p2.id, modelId: model.id, qty: 1, startsAt: from, endsAt: to });
    expect(r2.id).toBeTruthy();
    const after = await projects.service.listProblems();
    expect(after.length).toBe(before + 1);
    expect(after.some((p) => p.kind === "reservation_conflict")).toBe(true);
  });

  it("notifications: assignment and issuance notify the assigned crew", async () => {
    const { projects, equipment, notifications } = wiring;
    const tech = await makeTech("Notify Tech");
    const lead = await makeTech("Notify Lead");
    const client = await projects.service.createClient({ name: `Notif ${Date.now()}` });
    const project = await projects.service.createProject({
      name: "Notif Project",
      clientId: client.id,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    await projects.service.addAssignment({ projectId: project.id, userId: tech.id });
    let inbox = await notifications.service.listForUser(tech.id);
    expect(inbox.some((n) => n.kind === "assigned" && n.link === `/projects/${project.id}`)).toBe(true);
    expect(await notifications.service.unreadCount(tech.id)).toBeGreaterThan(0);

    // Lead issues equipment → the assigned tech is notified (the actor isn't).
    const type = await equipment.service.createType({ name: `N-${Date.now()}`, trackingMode: "serial" });
    const model = await equipment.service.createModel({ typeId: type.id, name: "N Model", unitCostEUR: 1, dailyPriceEUR: 1 });
    const u = await equipment.service.createUnit({ modelId: model.id, assetTag: `NU-${Date.now()}` });
    await equipment.service.issueUnits({ projectId: project.id, unitIds: [u.id], actorId: lead.id });

    inbox = await notifications.service.listForUser(tech.id);
    expect(inbox.some((n) => n.kind === "issued")).toBe(true);

    // Mark all read clears the count.
    await notifications.service.markAllRead(tech.id);
    expect(await notifications.service.unreadCount(tech.id)).toBe(0);
  });

  it("repairs and contractor handovers: full cycle with status + history", async () => {
    const { equipment } = wiring;
    const tech = await makeTech("Repair Tech");
    const type = await equipment.service.createType({ name: `RC-${Date.now()}`, trackingMode: "serial" });
    const model = await equipment.service.createModel({ typeId: type.id, name: "RC Model", unitCostEUR: 100, dailyPriceEUR: 5 });
    const unit = await equipment.service.createUnit({ modelId: model.id, assetTag: `RC-${Date.now()}` });

    // Repair cycle
    const repair = await equipment.service.openRepair({ unitId: unit.id, problem: "Не зажигается", vendor: "RepairCo", estCostEUR: 50, actorId: tech.id });
    expect((await equipment.service.getUnit(unit.id))?.status).toBe("in_repair");
    const closed = await equipment.service.closeRepair(repair.id, { costEUR: 60, resolution: "Заменён драйвер", outcome: "repaired", actorId: tech.id });
    expect(closed.status).toBe("closed");
    expect((await equipment.service.getUnit(unit.id))?.status).toBe("in_stock");
    expect(await equipment.service.unitRepairCostEUR(unit.id)).toBe(60);
    expect((await equipment.service.listRepairs(unit.id)).length).toBe(1);
    // can't close twice
    await expect(equipment.service.closeRepair(repair.id, { outcome: "repaired", actorId: tech.id })).rejects.toThrow();

    // Contractor handover cycle
    const contractor = await equipment.service.createContractor({ name: "SubRent LLC" });
    const ho = await equipment.service.sendToContractor({ unitId: unit.id, contractorId: contractor.id, reason: "субаренда", actorId: tech.id });
    expect(ho.contractorName).toBe("SubRent LLC");
    expect((await equipment.service.getUnit(unit.id))?.status).toBe("at_contractor");
    expect((await equipment.service.listOpenHandovers()).some((h) => h.id === ho.id)).toBe(true);
    const back = await equipment.service.returnFromContractor(ho.id, { actorId: tech.id });
    expect(back.status).toBe("returned");
    expect((await equipment.service.getUnit(unit.id))?.status).toBe("in_stock");

    // Journal recorded the whole cycle.
    const journal = (await equipment.service.getUnitJournal(unit.id)).map((j) => j.action);
    expect(journal).toEqual(expect.arrayContaining(["sent_to_repair", "back_from_repair", "sent_to_contractor", "back_from_contractor"]));
  });

  it("technical plans: versioning clones elements and tracks the current version", async () => {
    const { plans, projects } = wiring;
    const client = await projects.service.createClient({ name: `Plan Client ${Date.now()}` });
    const project = await projects.service.createProject({
      name: "Plan Project",
      clientId: client.id,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const plan = await plans.service.createPlan({ projectId: project.id, name: "Main stage" });
    expect(plan.version).toBe(1);
    expect(plan.isCurrent).toBe(true);

    await plans.service.addElement({ planId: plan.id, layer: "fixtures", kind: "fixture", label: "MH1", x: 100, y: 80 });
    await plans.service.addElement({ planId: plan.id, layer: "dmx", kind: "power", label: "U1", x: 50, y: 50 });

    const v2 = await plans.service.newVersion(plan.id);
    expect(v2.version).toBe(2);
    expect(v2.isCurrent).toBe(true);
    expect(v2.elements.length).toBe(2); // cloned

    // The current plan for the project is v2.
    const current = await plans.service.getCurrentPlan(project.id);
    expect(current?.id).toBe(v2.id);

    // Roll back to v1 → it becomes current, v2 not.
    const v1 = await plans.service.setCurrent(plan.id);
    expect(v1.isCurrent).toBe(true);
    expect((await plans.service.getCurrentPlan(project.id))?.version).toBe(1);

    // Move + delete element work.
    await plans.service.moveElements(plan.id, [{ id: v1.elements[0]!.id, x: 200, y: 150, rotation: 45 }]);
    const moved = await plans.service.getPlan(plan.id);
    const el = moved!.elements.find((e) => e.id === v1.elements[0]!.id)!;
    expect(el.x).toBe(200);
    expect(el.rotation).toBe(45);
  });
});
