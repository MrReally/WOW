import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Equipment } from "@sever/contracts";
import { UNIT_STATUSES } from "@sever/contracts";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";
import { parseCatalogCsv } from "./csv.js";

const createTypeSchema = z.object({
  name: z.string().min(1),
  trackingMode: z.enum(["serial", "quantity"]),
});

const createModelSchema = z.object({
  typeId: z.string().uuid(),
  name: z.string().min(1),
  manufacturer: z.string().nullable().optional(),
  unitCostEUR: z.number().nonnegative(),
  dailyPriceEUR: z.number().nonnegative(),
  attrs: z.record(z.unknown()).nullable().optional(),
  requiredComponentModelIds: z.array(z.string().uuid()).optional(),
});
const updateModelSchema = z.object({
  name: z.string().min(1).optional(),
  manufacturer: z.string().nullable().optional(),
  unitCostEUR: z.number().nonnegative().optional(),
  dailyPriceEUR: z.number().nonnegative().optional(),
  attrs: z.record(z.unknown()).nullable().optional(),
});

const createUnitSchema = z.object({
  modelId: z.string().uuid(),
  assetTag: z.string().min(1),
  serial: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
const updateUnitSchema = z.object({
  serial: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const issueSchema = z.object({
  projectId: z.string().uuid(),
  unitIds: z.array(z.string().uuid()).min(1),
  note: z.string().optional(),
});

const returnSchema = z.object({
  projectId: z.string().uuid(),
  returnedUnitIds: z.array(z.string().uuid()),
  expectedUnitIds: z.array(z.string().uuid()),
  note: z.string().optional(),
});

const statusSchema = z.object({
  status: z.enum(UNIT_STATUSES as [string, ...string[]]),
  note: z.string().optional(),
});

const stockSchema = z.object({ total: z.number().int().nonnegative() });

const qtyMoveSchema = z.object({
  projectId: z.string().uuid(),
  modelId: z.string().uuid(),
  qty: z.number().int().positive(),
  note: z.string().optional(),
});

const importSchema = z.object({ csv: z.string().min(1) });

const contractorSchema = z.object({ name: z.string().min(1), contacts: z.string().nullable().optional() });
const openRepairSchema = z.object({
  problem: z.string().min(1),
  vendor: z.string().nullable().optional(),
  estCostEUR: z.number().nullable().optional(),
});
const closeRepairSchema = z.object({
  costEUR: z.number().nullable().optional(),
  resolution: z.string().nullable().optional(),
  outcome: z.enum(["repaired", "written_off"]),
});
const toContractorSchema = z.object({
  contractorId: z.string().uuid(),
  reason: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  expectedReturn: z.string().datetime().nullable().optional(),
});
const returnHandoverSchema = z.object({ note: z.string().nullable().optional() });

export function registerEquipmentRoutes(
  app: FastifyInstance,
  ctx: RouteContext,
  service: Equipment.EquipmentService
): void {
  // ── Types ──
  app.get("/api/equipment/types", async (req) => {
    await ctx.auth(req);
    return service.listTypes();
  });
  app.post("/api/equipment/types", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.catalog.manage");
    return service.createType(createTypeSchema.parse(req.body));
  });

  // ── Models ──
  app.get<{ Querystring: { typeId?: string } }>("/api/equipment/models", async (req) => {
    await ctx.auth(req);
    return service.listModels(req.query.typeId);
  });
  app.get<{ Params: { id: string } }>("/api/equipment/models/:id", async (req) => {
    await ctx.auth(req);
    return service.getModel(req.params.id);
  });
  app.get<{ Params: { id: string } }>("/api/equipment/models/:id/stock", async (req) => {
    await ctx.auth(req);
    return service.modelStock(req.params.id);
  });
  app.post("/api/equipment/models", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.catalog.manage");
    return service.createModel(createModelSchema.parse(req.body) as Equipment.CreateModelInput);
  });
  app.patch<{ Params: { id: string } }>("/api/equipment/models/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.catalog.manage");
    return service.updateModel(req.params.id, updateModelSchema.parse(req.body) as Equipment.UpdateModelInput);
  });
  app.put<{ Params: { id: string } }>("/api/equipment/models/:id/stock", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.catalog.manage");
    return service.setModelStockTotal(req.params.id, stockSchema.parse(req.body).total);
  });

  // ── Catalog import (CSV) ──
  app.post("/api/equipment/import", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.import");
    const rows = parseCatalogCsv(importSchema.parse(req.body).csv);
    return service.importCatalog(rows);
  });

  // ── Quantity (cable) moves ──
  app.post("/api/equipment/issue-qty", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.issue");
    const body = qtyMoveSchema.parse(req.body);
    return service.issueQuantity({ ...body, actorId: auth.userId });
  });
  app.post("/api/equipment/return-qty", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.issue");
    const body = qtyMoveSchema.parse(req.body);
    return service.returnQuantity({ ...body, actorId: auth.userId });
  });

  // ── Units ──
  app.get<{ Querystring: { modelId?: string; status?: Equipment.UnitStatus; projectId?: string } }>(
    "/api/equipment/units",
    async (req) => {
      await ctx.auth(req);
      return service.listUnits({
        modelId: req.query.modelId,
        status: req.query.status,
        projectId: req.query.projectId,
      });
    }
  );
  app.get<{ Params: { id: string } }>("/api/equipment/units/:id", async (req) => {
    await ctx.auth(req);
    return service.getUnit(req.params.id);
  });
  app.get<{ Params: { id: string } }>("/api/equipment/units/:id/journal", async (req) => {
    await ctx.auth(req);
    return service.getUnitJournal(req.params.id);
  });
  app.post("/api/equipment/units", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.catalog.manage");
    return service.createUnit(createUnitSchema.parse(req.body));
  });
  app.patch<{ Params: { id: string } }>("/api/equipment/units/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.unit.status");
    return service.updateUnit(req.params.id, updateUnitSchema.parse(req.body));
  });
  app.patch<{ Params: { id: string } }>("/api/equipment/units/:id/status", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.unit.status");
    const body = statusSchema.parse(req.body);
    return service.changeStatus(req.params.id, body.status as Equipment.UnitStatus, auth.userId, body.note);
  });

  // ── Operations (warehouse prepares; tech confirms on phone) ──
  app.post("/api/equipment/issue", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.issue");
    const body = issueSchema.parse(req.body);
    return service.issueUnits({ ...body, actorId: auth.userId });
  });
  app.post("/api/equipment/return", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.issue");
    const body = returnSchema.parse(req.body);
    return service.returnUnits({ ...body, actorId: auth.userId });
  });

  // ── Problems ──
  app.get<{ Querystring: { includeResolved?: string } }>("/api/equipment/problems", async (req) => {
    await ctx.auth(req);
    return service.listProblems({ includeResolved: req.query.includeResolved === "true" });
  });
  app.post<{ Params: { id: string } }>("/api/equipment/problems/:id/resolve", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.issue");
    await service.resolveProblem(req.params.id);
    return { ok: true };
  });

  // ── Contractors ──
  app.get("/api/equipment/contractors", async (req) => {
    await ctx.auth(req);
    return service.listContractors();
  });
  app.post("/api/equipment/contractors", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.catalog.manage");
    return service.createContractor(contractorSchema.parse(req.body));
  });

  // ── Repairs ──
  app.get("/api/equipment/repairs/open", async (req) => {
    await ctx.auth(req);
    return service.listOpenRepairs();
  });
  app.get<{ Params: { id: string } }>("/api/equipment/units/:id/repairs", async (req) => {
    await ctx.auth(req);
    return service.listRepairs(req.params.id);
  });
  app.post<{ Params: { id: string } }>("/api/equipment/units/:id/repair", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.unit.status");
    const body = openRepairSchema.parse(req.body);
    return service.openRepair({ ...body, unitId: req.params.id, actorId: auth.userId });
  });
  app.post<{ Params: { id: string } }>("/api/equipment/repairs/:id/close", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.unit.status");
    const body = closeRepairSchema.parse(req.body);
    return service.closeRepair(req.params.id, { ...body, actorId: auth.userId });
  });

  // ── Contractor handovers ──
  app.get("/api/equipment/handovers/open", async (req) => {
    await ctx.auth(req);
    return service.listOpenHandovers();
  });
  app.get<{ Params: { id: string } }>("/api/equipment/units/:id/handovers", async (req) => {
    await ctx.auth(req);
    return service.listHandovers(req.params.id);
  });
  app.post<{ Params: { id: string } }>("/api/equipment/units/:id/to-contractor", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.unit.status");
    const body = toContractorSchema.parse(req.body);
    return service.sendToContractor({ ...body, unitId: req.params.id, actorId: auth.userId });
  });
  app.post<{ Params: { id: string } }>("/api/equipment/handovers/:id/return", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.unit.status");
    const body = returnHandoverSchema.parse(req.body);
    return service.returnFromContractor(req.params.id, { ...body, actorId: auth.userId });
  });
}
