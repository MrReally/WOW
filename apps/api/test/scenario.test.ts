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
    const type = await equipment.service.createType({ name: `Cables-${Date.now()}`, trackingMode: "cable" });
    const model = await equipment.service.createModel({
      typeId: type.id,
      name: "DMX 10m",
      unitCostEUR: 20,
      dailyPriceEUR: 2,
      attrs: { cableType: "DMX", lengthM: 10, sideAConnector: "XLR 5 pin male", sideAQty: 1, sideBConnector: "XLR 5 pin female", sideBQty: 1 },
    });
    expect(model.trackingMode).toBe("cable");

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

    await expect(
      equipment.service.returnQuantity({ projectId: project.id, modelId: model.id, qty: 31, actorId: "00000000-0000-0000-0000-000000000000" })
    ).rejects.toThrow(/only 30 issued/);

    stock = await equipment.service.returnQuantity({ projectId: project.id, modelId: model.id, qty: 30, actorId: "00000000-0000-0000-0000-000000000000" });
    expect(stock).toMatchObject({ inStock: 50, onProjects: 0 });

    await expect(
      equipment.service.returnQuantity({ projectId: project.id, modelId: model.id, qty: 1, actorId: "00000000-0000-0000-0000-000000000000" })
    ).rejects.toThrow(/only 0 issued/);
  });

  it("imports a catalog from CSV rows (serial units + cable stock)", async () => {
    const { equipment } = wiring;
    const tag = `CSV-${Date.now()}`;
    const result = await equipment.service.importCatalog([
      { type: `ImpFix-${Date.now()}`, trackingMode: "serial", model: "Imp Fixture", unitCostEUR: 100, dailyPriceEUR: 5, assetTag: `${tag}-1` },
      { type: `ImpFix-${Date.now()}`, trackingMode: "serial", model: "Imp Fixture", unitCostEUR: 100, dailyPriceEUR: 5, assetTag: `${tag}-2` },
      { type: `ImpCab-${Date.now()}`, trackingMode: "cable", model: "Imp Cable", qty: 25, cableType: "DMX", lengthM: 3, sideAConnector: "XLR 3 pin male", sideAQty: 1, sideBConnector: "XLR 3 pin female", sideBQty: 1 },
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

  it("only loss problems can be manually hidden from Apex", async () => {
    const { equipment } = wiring;
    const tech = await makeTech("Loss Tech");
    const type = await equipment.service.createType({ name: `Loss-${Date.now()}`, trackingMode: "serial" });
    const model = await equipment.service.createModel({ typeId: type.id, name: "Loss Model", unitCostEUR: 1, dailyPriceEUR: 1 });
    const unit = await equipment.service.createUnit({ modelId: model.id, assetTag: `LOST-${Date.now()}` });

    await equipment.service.changeStatus(unit.id, "lost", tech.id, "missing after event");
    const loss = (await equipment.service.listProblems()).find((p) => p.kind === "unit_lost" && p.refs.unitId === unit.id);
    expect(loss).toBeTruthy();
    await equipment.service.resolveProblem(loss!.id);
    expect((await equipment.service.listProblems()).some((p) => p.id === loss!.id)).toBe(false);

    const client = await wiring.projects.service.createClient({ name: `Hide ${Date.now()}` });
    const project = await wiring.projects.service.createProject({
      name: "Hide Project",
      clientId: client.id,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const u1 = await equipment.service.createUnit({ modelId: model.id, assetTag: `HIDE-${Date.now()}-1` });
    const u2 = await equipment.service.createUnit({ modelId: model.id, assetTag: `HIDE-${Date.now()}-2` });
    await equipment.service.issueUnits({ projectId: project.id, unitIds: [u1.id, u2.id], actorId: tech.id });
    const ret = await equipment.service.returnUnits({
      projectId: project.id,
      returnedUnitIds: [u1.id],
      expectedUnitIds: [u1.id, u2.id],
      actorId: tech.id,
    });
    await expect(equipment.service.resolveProblem(ret.problemId!)).rejects.toThrow(/only loss/);
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

  it("notification preferences mute delivery per kind", async () => {
    const { projects, notifications } = wiring;
    const tech = await makeTech("Pref Tech");
    const client = await projects.service.createClient({ name: `Pref ${Date.now()}` });
    const mk = (n: string) =>
      projects.service.createProject({
        name: n, clientId: client.id,
        startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      });

    // Default: everything on.
    expect(await notifications.service.isEnabled(tech.id, "assigned")).toBe(true);

    // Mute "assigned" → being added to a project no longer notifies.
    await notifications.service.setPrefs(tech.id, { assigned: false, stage: true, issued: true, returned: true, problem: true, info: true });
    expect(await notifications.service.isEnabled(tech.id, "assigned")).toBe(false);
    const p1 = await mk("Pref P1");
    await projects.service.addAssignment({ projectId: p1.id, userId: tech.id });
    expect((await notifications.service.listForUser(tech.id)).some((n) => n.kind === "assigned")).toBe(false);

    // Re-enable → a new assignment notifies again.
    await notifications.service.setPrefs(tech.id, { assigned: true, stage: true, issued: true, returned: true, problem: true, info: true });
    const p2 = await mk("Pref P2");
    await projects.service.addAssignment({ projectId: p2.id, userId: tech.id });
    expect((await notifications.service.listForUser(tech.id)).some((n) => n.kind === "assigned")).toBe(true);
  });

  it("advanced notification preferences deliver warehouse transfer events to observers", async () => {
    const { people, equipment, notifications } = wiring;
    const observerRole = await people.service.createRole({
      name: `Observer ${Date.now()}`,
      permissions: ["notifications.advanced"],
    });
    const observer = (await people.service.create({
      displayName: "Observer Owner",
      roleId: observerRole.id,
      telegramId: `observer-${Date.now()}`,
    })).user;
    const actor = await makeTech("Transfer Actor");

    expect(await notifications.service.isAdvancedEnabled(observer.id, "equipment.unit.transferred")).toBe(false);
    await notifications.service.setAdvancedPrefs(observer.id, {
      "project.assigned": false,
      "project.unassigned": false,
      "project.invited": false,
      "project.invite.responded": false,
      "project.ping.created": false,
      "project.ping.confirmed": false,
      "project.ping.declined": false,
      "project.operation_stage.changed": false,
      "equipment.units.issued": false,
      "equipment.unit.returned": false,
      "equipment.return.incomplete": false,
      "equipment.unit.transferred": true,
      "people.user.created": false,
      "people.application.submitted": false,
    });

    const from = await equipment.service.createWarehouse({ name: `From ${Date.now()}` });
    const to = await equipment.service.createWarehouse({ name: `To ${Date.now()}` });
    const type = await equipment.service.createType({ name: `TR-${Date.now()}`, trackingMode: "serial" });
    const model = await equipment.service.createModel({ typeId: type.id, name: "Transfer Model", unitCostEUR: 1, dailyPriceEUR: 1 });
    const unit = await equipment.service.createUnit({ modelId: model.id, assetTag: `TR-${Date.now()}`, warehouseId: from.id });

    await equipment.service.transferUnit(unit.id, to.id, actor.id);
    const inbox = await notifications.service.listForUser(observer.id);
    expect(inbox.some((n) => n.title === "Перемещение между складами" && n.body.includes(`${from.name} → ${to.name}`))).toBe(true);
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

    await plans.service.addElement({ planId: plan.id, layer: "light", kind: "fixture", label: "MH1", x: 100, y: 80 });
    await plans.service.addElement({ planId: plan.id, layer: "sound", kind: "fixture", label: "U1", x: 50, y: 50 });

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

  it("plan cables: a new version remaps cable endpoints to the cloned elements", async () => {
    const { plans, projects } = wiring;
    const client = await projects.service.createClient({ name: `Cable Client ${Date.now()}` });
    const project = await projects.service.createProject({
      name: "Cable Project", clientId: client.id,
      startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const plan = await plans.service.createPlan({ projectId: project.id, name: "Cabled stage" });
    const a = await plans.service.addElement({ planId: plan.id, layer: "light", kind: "fixture", label: "MH1", x: 100, y: 80 });
    const b = await plans.service.addElement({ planId: plan.id, layer: "light", kind: "fixture", label: "MH2", x: 200, y: 80 });
    await plans.service.addElement({ planId: plan.id, layer: "dmx", kind: "cable", label: "DMX1", x: 150, y: 80, fromId: a.id, toId: b.id });

    const v2 = await plans.service.newVersion(plan.id);
    const cable = v2.elements.find((e) => e.kind === "cable")!;
    const ids = new Set(v2.elements.map((e) => e.id));
    // Endpoints point at the cloned elements in v2, not the originals from v1.
    expect(cable.fromId && ids.has(cable.fromId)).toBe(true);
    expect(cable.toId && ids.has(cable.toId)).toBe(true);
    expect(cable.fromId).not.toBe(a.id);
    expect(cable.toId).not.toBe(b.id);
  });

  it("technical plans reject corrupt geometry and connections and cascade dependent cables", async () => {
    const { plans, projects } = wiring;
    const client = await projects.service.createClient({ name: `Plan hardening ${Date.now()}` });
    const project = await projects.service.createProject({ name: "Hardened plan", clientId: client.id, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString() });
    const otherProject = await projects.service.createProject({ name: "Other plan", clientId: client.id, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString() });
    const plan = await plans.service.createPlan({ projectId: project.id, name: "Main", stageW: 400, stageH: 300 });
    const otherPlan = await plans.service.createPlan({ projectId: otherProject.id, name: "Other" });
    const fixture = await plans.service.addElement({ planId: plan.id, layer: "light", kind: "fixture", label: "BAR1", x: 50, y: 50, attrs: { dmxUniverse: 1, dmxAddress: 1, dmxChannels: 16, powerW: 240, requiredOutlets: 1 } });
    const power = await plans.service.addElement({ planId: plan.id, layer: "power", kind: "power", label: "PWR", x: 100, y: 100, attrs: { availableOutlets: 6, maxPowerW: 3500 } });
    const foreign = await plans.service.addElement({ planId: otherPlan.id, layer: "light", kind: "fixture", label: "FOREIGN", x: 20, y: 20 });

    await expect(plans.service.addElement({ planId: plan.id, layer: "light", kind: "fixture", label: "outside", x: 401, y: 10 })).rejects.toThrow(/пределах сцены/);
    await expect(plans.service.addElement({ planId: plan.id, layer: "light", kind: "fixture", label: "dmx overflow", x: 10, y: 10, attrs: { dmxAddress: 510, dmxChannels: 4 } })).rejects.toThrow(/512/);
    await expect(plans.service.addElement({ planId: plan.id, layer: "dmx", kind: "cable", label: "missing", x: 10, y: 10 })).rejects.toThrow(/обе точки/);
    await expect(plans.service.addElement({ planId: plan.id, layer: "dmx", kind: "cable", label: "self", x: 10, y: 10, fromId: fixture.id, toId: fixture.id })).rejects.toThrow(/самим собой/);
    await expect(plans.service.addElement({ planId: plan.id, layer: "light", kind: "cable", label: "wrong layer", x: 10, y: 10, fromId: fixture.id, toId: power.id })).rejects.toThrow(/слое DMX/);
    await expect(plans.service.addElement({ planId: plan.id, layer: "power", kind: "cable", label: "foreign", x: 10, y: 10, fromId: power.id, toId: foreign.id })).rejects.toThrow(/этому плану/);

    const cable = await plans.service.addElement({ planId: plan.id, layer: "power", kind: "cable", label: "Schuko", x: 75, y: 75, fromId: power.id, toId: fixture.id, attrs: { cableLengthM: 10, cableQuantity: 1 } });
    await expect(plans.service.updateElement(cable.id, { fromId: cable.id })).rejects.toThrow(/другому кабелю/);
    await expect(plans.service.moveElements(plan.id, [{ id: foreign.id, x: 20, y: 20 }])).rejects.toThrow(/другого плана/);
    await expect(plans.service.moveElements(plan.id, [{ id: fixture.id, x: 20, y: 20 }, { id: fixture.id, x: 30, y: 30 }])).rejects.toThrow(/более одного раза/);
    await expect(plans.service.updatePlan(plan.id, { stageW: 40 })).rejects.toThrow(/переместите элементы/);

    const version = await plans.service.newVersion(plan.id);
    expect(version.elements.find((element) => element.label === "BAR1")?.attrs).toMatchObject({ dmxAddress: 1, powerW: 240 });
    const versionFixture = version.elements.find((element) => element.label === "BAR1")!;
    await plans.service.deleteElement(versionFixture.id);
    const afterDelete = await plans.service.getPlan(version.id);
    expect(afterDelete?.elements.some((element) => element.fromId === versionFixture.id || element.toId === versionFixture.id)).toBe(false);
  });

  it("timing assignees: whole timing vs only-my-events filtering", async () => {
    const { projects } = wiring;
    const alice = await makeTech("Alice Timing");
    const bob = await makeTech("Bob Timing");
    const client = await projects.service.createClient({ name: `Timing ${Date.now()}` });
    const project = await projects.service.createProject({
      name: "Timing Project", clientId: client.id,
      startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const t1 = await projects.service.addTiming({
      projectId: project.id, title: "Монтаж", startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(), assigneeIds: [alice.id],
    });
    await projects.service.addTiming({
      projectId: project.id, title: "Саундчек", startsAt: new Date(Date.now() + 3_600_000).toISOString(),
      endsAt: new Date(Date.now() + 7_200_000).toISOString(), assigneeIds: [bob.id],
    });

    const all = await projects.service.listTimings(project.id);
    expect(all.length).toBe(2);
    expect(all.find((t) => t.id === t1.id)?.assigneeIds).toEqual([alice.id]);

    const onlyAlice = await projects.service.listTimings(project.id, { forUserId: alice.id });
    expect(onlyAlice.map((t) => t.title)).toEqual(["Монтаж"]);

    // Re-assigning both to a block makes it visible to both.
    await projects.service.setTimingAssignees(t1.id, [alice.id, bob.id]);
    const bobView = await projects.service.listTimings(project.id, { forUserId: bob.id });
    expect(bobView.some((t) => t.id === t1.id)).toBe(true);
  });

  it("invitations: invite → accept/decline via the bot handler path", async () => {
    const { projects } = wiring;
    const inviter = await makeTech("Inviter");
    const guest = await makeTech("Guest");
    const stranger = await makeTech("Stranger");
    const client = await projects.service.createClient({ name: `Invite ${Date.now()}` });
    const project = await projects.service.createProject({
      name: "Invite Project", clientId: client.id,
      startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const role = await projects.service.createProjectRole({ projectId: project.id, title: "Световик", requiredCount: 1, rateEUR: 150 });
    const invited = await projects.service.addAssignment({
      projectId: project.id, roleId: role.id, userId: guest.id, invite: true, invitedByUserId: inviter.id,
    });
    expect(invited.status).toBe("invited");
    expect(invited.roleId).toBe(role.id);
    expect(invited.rateEUR).toBe(150);
    // Pending invite isn't "my project" yet.
    expect((await projects.service.listProjectsForUser(guest.id)).some((p) => p.id === project.id)).toBe(false);

    // Someone else can't answer for the guest.
    await expect(projects.service.respondToInvite(invited.id, true, stranger.id)).rejects.toThrow();

    const accepted = await projects.service.respondToInvite(invited.id, true, guest.id);
    expect(accepted.status).toBe("accepted");
    expect(accepted.respondedAt).toBeTruthy();
    // Now it shows up as the guest's project.
    expect((await projects.service.listProjectsForUser(guest.id)).some((p) => p.id === project.id)).toBe(true);
  });

  it("project roles: one staffing slot can have several candidates and one planned cost", async () => {
    const { projects, billing } = wiring;
    const inviter = await makeTech("Role Inviter");
    const first = await makeTech("Role First");
    const second = await makeTech("Role Second");
    const client = await projects.service.createClient({ name: `Role ${Date.now()}` });
    const project = await projects.service.createProject({
      name: "Role Project", clientId: client.id,
      startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const role = await projects.service.createProjectRole({ projectId: project.id, title: "Шеф монтажа", requiredCount: 1, rateEUR: 200 });

    const a = await projects.service.addAssignment({ projectId: project.id, roleId: role.id, userId: first.id, invite: true, invitedByUserId: inviter.id });
    const b = await projects.service.addAssignment({ projectId: project.id, roleId: role.id, userId: second.id, invite: true, invitedByUserId: inviter.id });
    expect((await billing.projectInvoice(project.id)).laborEUR).toBe(200);

    await projects.service.respondToInvite(a.id, true, first.id);
    expect((await projects.service.getAssignment(b.id))?.status).toBe("cancelled");
    expect((await billing.projectInvoice(project.id)).laborEUR).toBe(200);
    await expect(projects.service.addAssignment({ projectId: project.id, roleId: role.id, userId: second.id, invite: true, invitedByUserId: inviter.id })).rejects.toThrow();
  });

  it("project roles: a person can be invited to several roles but accept only one", async () => {
    const { projects } = wiring;
    const inviter = await makeTech("Multi Role Inviter");
    const person = await makeTech("Multi Role Person");
    const client = await projects.service.createClient({ name: `Multi Role ${Date.now()}` });
    const project = await projects.service.createProject({
      name: "Multi Role Project", clientId: client.id,
      startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const chief = await projects.service.createProjectRole({ projectId: project.id, title: "Шеф монтажа", requiredCount: 1, rateEUR: 200 });
    const tech = await projects.service.createProjectRole({ projectId: project.id, title: "Монтажник", requiredCount: 1, rateEUR: 100 });
    const a = await projects.service.addAssignment({ projectId: project.id, roleId: chief.id, userId: person.id, invite: true, invitedByUserId: inviter.id });
    const b = await projects.service.addAssignment({ projectId: project.id, roleId: tech.id, userId: person.id, invite: true, invitedByUserId: inviter.id });

    await projects.service.respondToInvite(a.id, true, person.id);
    expect((await projects.service.getAssignment(a.id))?.status).toBe("accepted");
    expect((await projects.service.getAssignment(b.id))?.status).toBe("cancelled");
  });

  it("project roles: direct additions cannot overfill and reducing seats cancels pending invites", async () => {
    const { projects, billing } = wiring;
    const inviter = await makeTech("Seats Inviter");
    const first = await makeTech("Seats First");
    const second = await makeTech("Seats Second");
    const third = await makeTech("Seats Third");
    const client = await projects.service.createClient({ name: `Seats ${Date.now()}` });
    const project = await projects.service.createProject({
      name: "Seats Project", clientId: client.id,
      startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const role = await projects.service.createProjectRole({ projectId: project.id, title: "Монтажник", requiredCount: 2, rateEUR: 100 });

    await projects.service.addAssignment({ projectId: project.id, roleId: role.id, userId: first.id });
    await projects.service.addAssignment({ projectId: project.id, roleId: role.id, userId: second.id });
    await expect(projects.service.addAssignment({ projectId: project.id, roleId: role.id, userId: third.id })).rejects.toThrow();
    expect((await billing.projectInvoice(project.id)).laborEUR).toBe(200);

    const reserve = await projects.service.createProjectRole({ projectId: project.id, title: "Резерв", requiredCount: 2, rateEUR: 80 });
    const pending = await projects.service.addAssignment({ projectId: project.id, roleId: reserve.id, userId: third.id, invite: true, invitedByUserId: inviter.id });
    await projects.service.updateProjectRole(reserve.id, { requiredCount: 1 });
    expect((await projects.service.getAssignment(pending.id))?.status).toBe("invited");

    await projects.service.addAssignment({ projectId: project.id, roleId: reserve.id, userId: inviter.id });
    expect((await projects.service.getAssignment(pending.id))?.status).toBe("cancelled");
    expect((await billing.projectInvoice(project.id)).laborEUR).toBe(280);
  });

  it("project invoice: rental billed from reservations, costs from crew rates", async () => {
    const { projects, equipment, billing } = wiring;
    const guest = await makeTech("Invoice Crew");
    const client = await projects.service.createClient({ name: `Invoice ${Date.now()}` });
    const start = new Date().toISOString();
    const end = new Date(Date.now() + 2 * 86_400_000).toISOString(); // 2 days
    const project = await projects.service.createProject({ name: "Invoice Project", clientId: client.id, startsAt: start, endsAt: end });

    const type = await equipment.service.createType({ name: `INV-${Date.now()}`, trackingMode: "serial" });
    const model = await equipment.service.createModel({ typeId: type.id, name: "Inv Fixture", unitCostEUR: 500, dailyPriceEUR: 100 });
    await projects.service.createReservation({ projectId: project.id, modelId: model.id, qty: 2, startsAt: start, endsAt: end });
    const reserve = await projects.service.createReservation({ projectId: project.id, modelId: model.id, qty: 1, isReserve: true, startsAt: start, endsAt: end });
    expect(reserve.isReserve).toBe(true);
    const role = await projects.service.createProjectRole({ projectId: project.id, title: "Свет", requiredCount: 1, rateEUR: 150 });
    await projects.service.addAssignment({ projectId: project.id, roleId: role.id, userId: guest.id });

    const inv = await billing.projectInvoice(project.id);
    expect(inv.days).toBe(2);
    expect(inv.rentalEUR).toBe(400); // 100 €/сут × 2 шт × 2 сут
    expect(inv.rentalLines).toHaveLength(1); // reserve gear is prepared but not billed
    expect(inv.invoiceEUR).toBe(400);
    expect(inv.laborEUR).toBe(150);
    expect(inv.costEUR).toBe(150);
    expect(inv.profitEUR).toBe(250);
    expect(inv.dueEUR).toBe(400); // nothing paid yet

    // Add contractor (subrent) gear: billed to the client, costs us money owed.
    const contractor = await equipment.service.createContractor({ name: `Sub ${Date.now()}` });
    await projects.service.addContractorItem({ projectId: project.id, contractorId: contractor.id, name: "Sub MH", qty: 2, priceEUR: 80, costEUR: 50 });
    const inv2 = await billing.projectInvoice(project.id);
    expect(inv2.rentalEUR).toBe(560); // 400 + 80×2 contractor
    expect(inv2.contractorCostEUR).toBe(100); // 50×2
    expect(inv2.costEUR).toBe(250); // 150 labor + 100 contractor
    expect(inv2.profitEUR).toBe(310); // 560 − 250
    const owed = await projects.service.contractorDebts();
    expect(owed.find((d) => d.contractorId === contractor.id)?.debtEUR).toBe(100);
  });

  it("edits a unit assignment and the shared model/type data", async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const firstType = await wiring.equipment.service.createType({ name: `Edit source ${suffix}`, trackingMode: "serial" });
    const secondType = await wiring.equipment.service.createType({ name: `Edit target ${suffix}`, trackingMode: "serial" });
    const firstModel = await wiring.equipment.service.createModel({ typeId: firstType.id, name: `Old model ${suffix}`, unitCostEUR: 100, dailyPriceEUR: 10 });
    const secondModel = await wiring.equipment.service.createModel({ typeId: secondType.id, name: `Second model ${suffix}`, unitCostEUR: 200, dailyPriceEUR: 20 });
    const unit = await wiring.equipment.service.createUnit({ modelId: firstModel.id, assetTag: `EDIT-${suffix}` });

    const editedModel = await wiring.equipment.service.updateModel(firstModel.id, { typeId: secondType.id, name: `Updated model ${suffix}`, manufacturer: "SEVER Test", unitCostEUR: 150, dailyPriceEUR: 15 });
    expect(editedModel.typeId).toBe(secondType.id);
    expect(editedModel.name).toContain("Updated model");
    expect(editedModel.manufacturer).toBe("SEVER Test");

    const editedUnit = await wiring.equipment.service.updateUnit(unit.id, { modelId: secondModel.id, serial: "SERIAL-EDITED", notes: "Проверено" });
    expect(editedUnit.modelId).toBe(secondModel.id);
    expect(editedUnit.serial).toBe("SERIAL-EDITED");
    expect(editedUnit.notes).toBe("Проверено");
  });

  it("keeps optional hierarchical storage zones consistent for units and counted stock", async () => {
    const suffix=String(Date.now());
    const warehouse=await wiring.equipment.service.createWarehouse({name:`Zone warehouse ${suffix}`});
    const room=await wiring.equipment.service.createStorageZone({warehouseId:warehouse.id,name:"Room",code:`R-${suffix}`,kind:"room"});
    const shelf=await wiring.equipment.service.createStorageZone({warehouseId:warehouse.id,parentId:room.id,name:"Shelf",code:`S-${suffix}`,kind:"shelf"});
    const type=await wiring.equipment.service.createType({name:`Zone serial ${suffix}`,trackingMode:"serial"});
    const model=await wiring.equipment.service.createModel({typeId:type.id,name:`Zone model ${suffix}`,unitCostEUR:1,dailyPriceEUR:1});
    const unit=await wiring.equipment.service.createUnit({modelId:model.id,assetTag:`ZONE-${suffix}`,warehouseId:warehouse.id,zoneId:shelf.id});
    expect(unit.zoneId).toBe(shelf.id);
    const zoneActor=await makeTech(`Zone tech ${suffix}`);
    const moved=await wiring.equipment.service.transferUnit(unit.id,warehouse.id,zoneActor.id,"same warehouse, other address",room.id);
    expect(moved.zoneId).toBe(room.id);
    await expect(wiring.equipment.service.updateStorageZone(room.id,{parentId:shelf.id})).rejects.toThrow(/циклическую/);
    const otherWarehouse=await wiring.equipment.service.createWarehouse({name:`Other zone warehouse ${suffix}`});
    const foreignZone=await wiring.equipment.service.createStorageZone({warehouseId:otherWarehouse.id,name:"Foreign",code:`F-${suffix}`,kind:"rack"});
    await expect(wiring.equipment.service.updateUnit(unit.id,{zoneId:foreignZone.id})).rejects.toThrow(/не относится/);
    await expect(wiring.equipment.service.transferUnit(unit.id,warehouse.id,zoneActor.id,"same address",room.id)).rejects.toThrow(/другой склад или зону/);

    const cableType=await wiring.equipment.service.createType({name:`Zone cables ${suffix}`,trackingMode:"cable"});
    const cable=await wiring.equipment.service.createModel({typeId:cableType.id,name:`Zone cable ${suffix}`,unitCostEUR:1,dailyPriceEUR:1,attrs:{cableType:"DMX",lengthM:5,sideAConnector:"XLR5",sideAQty:1,sideBConnector:"XLR5",sideBQty:1}});
    const stock=await wiring.equipment.service.setModelStockTotal(cable.id,12,warehouse.id,shelf.id);
    expect(stock.zoneId).toBe(shelf.id);
    expect(stock.total).toBe(12);
  });

  it("raises and resolves a non-blocking kit completeness problem", async () => {
    const suffix=String(Date.now());
    const actor=await makeTech(`Kit tech ${suffix}`);
    const serialType=await wiring.equipment.service.createType({name:`Kit serial ${suffix}`,trackingMode:"serial"});
    const qtyType=await wiring.equipment.service.createType({name:`Kit qty ${suffix}`,trackingMode:"quantity"});
    const router=await wiring.equipment.service.createModel({typeId:serialType.id,name:`Router ${suffix}`,unitCostEUR:1,dailyPriceEUR:1});
    const power=await wiring.equipment.service.createModel({typeId:qtyType.id,name:`Power ${suffix}`,unitCostEUR:1,dailyPriceEUR:1});
    await wiring.equipment.service.setModelStockTotal(power.id,10);
    const mixer=await wiring.equipment.service.createModel({typeId:serialType.id,name:`Mixer ${suffix}`,unitCostEUR:1,dailyPriceEUR:1,requiredComponentModelIds:[router.id,power.id]});
    const mixerUnit=await wiring.equipment.service.createUnit({modelId:mixer.id,assetTag:`MIX-${suffix}`});
    const routerUnit=await wiring.equipment.service.createUnit({modelId:router.id,assetTag:`RTR-${suffix}`});
    const client=await wiring.projects.service.createClient({name:`Kit client ${suffix}`});
    const project=await wiring.projects.service.createProject({name:`Kit project ${suffix}`,clientId:client.id,startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()});
    await wiring.equipment.service.issueUnits({projectId:project.id,unitIds:[mixerUnit.id],actorId:actor.id});
    expect((await wiring.equipment.service.listProblems()).some(p=>p.kind==="kit_incomplete"&&p.refs.projectId===project.id)).toBe(true);
    await wiring.equipment.service.issueUnits({projectId:project.id,unitIds:[routerUnit.id],actorId:actor.id});
    await wiring.equipment.service.issueQuantity({projectId:project.id,modelId:power.id,qty:1,actorId:actor.id});
    expect((await wiring.equipment.service.listProblems()).some(p=>p.kind==="kit_incomplete"&&p.refs.projectId===project.id)).toBe(false);
    await wiring.equipment.service.returnQuantity({projectId:project.id,modelId:power.id,qty:1,actorId:actor.id});
    expect((await wiring.equipment.service.listProblems()).some(p=>p.kind==="kit_incomplete"&&p.refs.projectId===project.id)).toBe(true);
    await wiring.equipment.service.issueQuantity({projectId:project.id,modelId:power.id,qty:1,actorId:actor.id});
    await wiring.equipment.service.returnUnits({projectId:project.id,returnedUnitIds:[mixerUnit.id,routerUnit.id],expectedUnitIds:[mixerUnit.id,routerUnit.id],actorId:actor.id});
    expect((await wiring.equipment.service.listProblems()).some(p=>p.kind==="kit_incomplete"&&p.refs.projectId===project.id)).toBe(false);
  });

  it("catalog keeps packaging conversions and effective recipe versions", async () => {
    const suffix = Date.now();
    const rum = await wiring.catalog.service.createItem({ sku: `RUM-${suffix}`, name: "Rum", kind: "product", baseUnit: "l" });
    const cola = await wiring.catalog.service.createItem({ sku: `COLA-${suffix}`, name: "Cola", kind: "product", baseUnit: "l" });
    const drink = await wiring.catalog.service.createItem({ sku: `DRINK-${suffix}`, name: "Rum & Cola", kind: "item", baseUnit: "serving" });
    const bottle = await wiring.catalog.service.addPackaging(rum.id, { name: "Bottle 0.7 l", coefficient: 0.7, barcode: `BAR-${suffix}`, supplierCode: null, active: true });
    expect(bottle.coefficient).toBe(0.7);
    const recipe = await wiring.catalog.service.createRecipe(drink.id, {
      version: 1, validFrom: new Date().toISOString(), validTo: null, outputQty: 1, outputUnit: "serving", technology: null,
      lines: [
        { ingredientItemId: rum.id, unit: "l", grossQty: 0.05, netQty: 0.05, baseQty: 0.05 },
        { ingredientItemId: cola.id, unit: "l", grossQty: 0.15, netQty: 0.15, baseQty: 0.15 },
      ],
    });
    expect(recipe.lines).toHaveLength(2);
    expect((await wiring.catalog.service.listRecipes(drink.id))[0]?.version).toBe(1);
  });

  it("operation documents persist draft, post and reversal lifecycle", async () => {
    const tech = await makeTech("Document Tech");
    const type = await wiring.equipment.service.createType({ name: `DOC-${Date.now()}`, trackingMode: "serial" });
    const model = await wiring.equipment.service.createModel({ typeId: type.id, name: "Document Fixture", unitCostEUR: 100, dailyPriceEUR: 10 });
    const unit = await wiring.equipment.service.createUnit({ modelId: model.id, assetTag: `DOC-U-${Date.now()}` });
    const client = await wiring.projects.service.createClient({ name: `Document Client ${Date.now()}` });
    const project = await wiring.projects.service.createProject({ name: "Document Project", clientId: client.id, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString() });
    const draft = await wiring.operations.service.create({ kind: "issue", projectId: project.id, unitIds: [unit.id] }, tech.id);
    expect(draft.status).toBe("draft");
    expect(draft.version).toBe(1);
    const edited=await wiring.operations.service.update(draft.id,{kind:"issue",projectId:project.id,unitIds:[unit.id],note:"Проверено перед выдачей"},tech.id);
    expect(edited.version).toBe(2);
    expect(edited.payload.note).toBe("Проверено перед выдачей");
    expect((await wiring.operations.service.history(draft.id)).map(item=>item.action)).toEqual(["edited","created"]);
    expect((await wiring.equipment.service.getUnit(unit.id))?.status).toBe("in_stock");
    const posted = await wiring.operations.service.post(draft.id, tech.id);
    expect(posted.status).toBe("posted");
    expect(posted.version).toBe(3);
    expect((await wiring.equipment.service.getUnit(unit.id))?.status).toBe("on_project");
    const reversed = await wiring.operations.service.reverse(draft.id, tech.id);
    expect(reversed.status).toBe("reversed");
    expect((await wiring.operations.service.history(draft.id)).map(item=>item.action)).toEqual(["reversed","posted","edited","created"]);
    expect((await wiring.equipment.service.getUnit(unit.id))?.status).toBe("in_stock");
    await expect(wiring.operations.service.post(draft.id, tech.id)).rejects.toThrow(/only draft/);
  });
});
