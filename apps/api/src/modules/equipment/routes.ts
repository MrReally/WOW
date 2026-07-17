import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Equipment } from "@sever/contracts";
import { UNIT_STATUSES } from "@sever/contracts";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";
import { parseCatalogCsv } from "./csv.js";

const createTypeSchema = z.object({
  name: z.string().min(1),
  trackingMode: z.enum(["serial", "quantity", "cable"]),
});
const cableSettingsSchema = z.object({
  connectors: z.array(z.string().min(1)).max(200),
  nameFormat: z.array(z.string().min(1)).max(12),
});
const imageSchema=z.string().max(2_000_000).refine(value=>value.startsWith("data:image/png;base64,")||value.startsWith("data:image/jpeg;base64,")||value.startsWith("https://"),"используйте PNG/JPEG до 1,5 МБ");
const connectorSchema=z.object({name:z.string().min(1),designation:z.string().min(1).max(24),imageDataUrl:imageSchema.nullable().optional()});
const updateConnectorSchema=connectorSchema.partial().extend({active:z.boolean().optional()});
const updateTypeSchema = z.object({
  name: z.string().min(1).optional(),
});
const warehouseSchema = z.object({
  name: z.string().min(1),
  address: z.string().nullable().optional(),
});
const updateWarehouseSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
});
const zoneKindSchema = z.enum(["room","rack","shelf","bin","floor","other"]);
const storageZoneSchema = z.object({ warehouseId:z.string().uuid(), parentId:z.string().uuid().nullable().optional(), name:z.string().min(1), code:z.string().min(1), kind:zoneKindSchema, sortOrder:z.number().int().optional() });
const updateStorageZoneSchema = z.object({ parentId:z.string().uuid().nullable().optional(), name:z.string().min(1).optional(), code:z.string().min(1).optional(), kind:zoneKindSchema.optional(), active:z.boolean().optional(), sortOrder:z.number().int().optional() });
const stageSymbolSchema=z.object({shape:z.enum(["circle","square","rectangle","bar","diamond"]),code:z.string().max(16),width:z.number().min(4).max(2000),height:z.number().min(4).max(2000),color:z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional()});
const modelAttrsSchema=z.object({stageSymbol:stageSymbolSchema.optional(),powerW:z.number().nonnegative().max(1_000_000).optional(),dmxChannels:z.union([z.number().int().min(1).max(512),z.string().max(80)]).optional()}).passthrough();

const createModelSchema = z.object({
  typeId: z.string().uuid(),
  name: z.string().min(1),
  manufacturer: z.string().nullable().optional(),
  imageUrl: imageSchema.nullable().optional(),
  unitCostEUR: z.number().nonnegative(),
  dailyPriceEUR: z.number().nonnegative(),
  attrs: modelAttrsSchema.nullable().optional(),
  requiredComponentModelIds: z.array(z.string().uuid()).optional(),
});
const updateModelSchema = z.object({
  typeId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  manufacturer: z.string().nullable().optional(),
  imageUrl: imageSchema.nullable().optional(),
  unitCostEUR: z.number().nonnegative().optional(),
  dailyPriceEUR: z.number().nonnegative().optional(),
  attrs: modelAttrsSchema.nullable().optional(),
  requiredComponentModelIds: z.array(z.string().uuid()).optional(),
});
const modelTrackingSchema = z.object({ trackingMode: z.enum(["serial", "quantity", "cable"]) });
const modelIdParamsSchema = z.object({ id: z.string().uuid() });

const createUnitSchema = z.object({
  modelId: z.string().uuid(),
  assetTag: z.string().min(1),
  serial: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  zoneId: z.string().uuid().nullable().optional(),
});
const updateUnitSchema = z.object({
  modelId: z.string().uuid().optional(),
  assetTag: z.string().min(1).optional(),
  serial: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  zoneId: z.string().uuid().nullable().optional(),
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

const stockSchema = z.object({ total: z.number().int().nonnegative(), zoneId:z.string().uuid().nullable().optional() });

const qtyMoveSchema = z.object({
  projectId: z.string().uuid(),
  modelId: z.string().uuid(),
  warehouseId: z.string().uuid().nullable().optional(),
  qty: z.number().int().positive(),
  note: z.string().optional(),
});
const qtyServiceSchema = z.object({
  modelId: z.string().uuid(),
  warehouseId: z.string().uuid().nullable().optional(),
  qty: z.number().int().positive(),
  note: z.string().nullable().optional(),
  costEUR: z.number().nullable().optional(),
});
const qtyTransferSchema = z.object({
  modelId: z.string().uuid(),
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  qty: z.number().int().positive(),
  note: z.string().optional(),
});
const unitTransferSchema = z.object({
  warehouseId: z.string().uuid(),
  zoneId: z.string().uuid().nullable().optional(),
  note: z.string().nullable().optional(),
});

const importSchema = z.object({ csv: z.string().min(1) });

const contractorSchema = z.object({ name: z.string().min(1), contacts: z.string().nullable().optional() });
const updateContractorSchema = z.object({
  name: z.string().min(1).optional(),
  contacts: z.string().nullable().optional(),
});
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
  costEUR: z.number().nullable().optional(),
  expectedReturn: z.string().datetime().nullable().optional(),
});
const returnHandoverSchema = z.object({ note: z.string().nullable().optional() });

export function registerEquipmentRoutes(
  app: FastifyInstance,
  ctx: RouteContext,
  service: Equipment.EquipmentService
): void {
  const canViewCosts = (auth: Awaited<ReturnType<RouteContext["auth"]>>) =>
    auth.isOwner || auth.permissions.includes("warehouse.costs.view");
  const hideRepairCost = (repair: Equipment.RepairDTO): Equipment.RepairDTO => ({ ...repair, estCostEUR: null, costEUR: null });
  const hideHandoverCost = (handover: Equipment.HandoverDTO): Equipment.HandoverDTO => ({ ...handover, costEUR: null });

  app.get("/api/equipment/cable-settings", async (req) => {
    await ctx.auth(req);
    return service.getCableSettings();
  });
  app.put("/api/equipment/cable-settings", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.catalog.manage");
    return service.updateCableSettings(cableSettingsSchema.parse(req.body));
  });
  app.get<{Querystring:{includeArchived?:string}}>("/api/equipment/cable-connectors",async req=>{await ctx.auth(req);return service.listCableConnectors(req.query.includeArchived==="true");});
  app.post("/api/equipment/cable-connectors",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.catalog.manage");return service.createCableConnector(connectorSchema.parse(req.body));});
  app.patch<{Params:{id:string}}>("/api/equipment/cable-connectors/:id",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.catalog.manage");return service.updateCableConnector(req.params.id,updateConnectorSchema.parse(req.body));});

  // ── Warehouses ──
  app.get("/api/equipment/warehouses", async (req) => {
    await ctx.auth(req);
    return service.listWarehouses();
  });
  app.post("/api/equipment/warehouses", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.catalog.manage");
    return service.createWarehouse(warehouseSchema.parse(req.body));
  });
  app.patch<{ Params: { id: string } }>("/api/equipment/warehouses/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.catalog.manage");
    return service.updateWarehouse(req.params.id, updateWarehouseSchema.parse(req.body));
  });
  app.get<{ Querystring:{warehouseId?:string} }>("/api/equipment/storage-zones", async req=>{await ctx.auth(req);return service.listStorageZones(req.query.warehouseId);});
  app.post("/api/equipment/storage-zones", async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.catalog.manage");return service.createStorageZone(storageZoneSchema.parse(req.body));});
  app.patch<{Params:{id:string}}>("/api/equipment/storage-zones/:id", async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.catalog.manage");return service.updateStorageZone(req.params.id,updateStorageZoneSchema.parse(req.body));});

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
  app.patch<{ Params: { id: string } }>("/api/equipment/types/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.catalog.manage");
    return service.updateType(req.params.id, updateTypeSchema.parse(req.body));
  });

  // ── Models ──
  app.get<{ Querystring: { typeId?: string } }>("/api/equipment/models", async (req) => {
    await ctx.auth(req);
    return service.listModels(req.query.typeId);
  });
  app.get<{ Params: { id: string } }>("/api/equipment/models/:id", async (req) => {
    const { id } = modelIdParamsSchema.parse(req.params);
    await ctx.auth(req);
    return service.getModel(id);
  });
  app.get<{ Params: { id: string }; Querystring: { warehouseId?: string } }>("/api/equipment/models/:id/stock", async (req) => {
    const { id } = modelIdParamsSchema.parse(req.params);
    await ctx.auth(req);
    return service.modelStock(id, req.query.warehouseId);
  });
  app.post("/api/equipment/models", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.catalog.manage");
    return service.createModel(createModelSchema.parse(req.body) as Equipment.CreateModelInput);
  });
  app.patch<{ Params: { id: string } }>("/api/equipment/models/:id", async (req) => {
    const { id } = modelIdParamsSchema.parse(req.params);
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.catalog.manage");
    return service.updateModel(id, updateModelSchema.parse(req.body) as Equipment.UpdateModelInput);
  });
  app.patch<{ Params: { id: string } }>("/api/equipment/models/:id/tracking-mode", async (req) => {
    const { id } = modelIdParamsSchema.parse(req.params);
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.model.convert");
    const body = modelTrackingSchema.parse(req.body);
    return service.setModelTrackingMode(id, body.trackingMode);
  });
  app.delete<{ Params: { id: string } }>("/api/equipment/models/:id", async (req) => {
    const { id } = modelIdParamsSchema.parse(req.params);
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.model.delete");
    await service.deleteModel(id);
    return { ok: true };
  });
  app.put<{ Params: { id: string } }>("/api/equipment/models/:id/stock", async (req) => {
    const { id } = modelIdParamsSchema.parse(req.params);
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.catalog.manage");
    const body=stockSchema.parse(req.body);
    return service.setModelStockTotal(id, body.total, (req.query as { warehouseId?: string }).warehouseId, body.zoneId);
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
  app.post("/api/equipment/transfer-qty", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.catalog.manage");
    const body = qtyTransferSchema.parse(req.body);
    return service.transferQuantity({ ...body, actorId: auth.userId });
  });
  app.post("/api/equipment/repair-qty", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.unit.status");
    const body = qtyServiceSchema.parse(req.body);
    return service.sendQuantityToRepair({ ...body, costEUR: canViewCosts(auth) ? body.costEUR : null, actorId: auth.userId });
  });
  app.post("/api/equipment/service-qty", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.unit.status");
    const body = qtyServiceSchema.parse(req.body);
    return service.sendQuantityToContractor({ ...body, costEUR: canViewCosts(auth) ? body.costEUR : null, actorId: auth.userId });
  });

  // ── Units ──
  app.get<{ Querystring: { modelId?: string; status?: Equipment.UnitStatus; projectId?: string; warehouseId?: string } }>(
    "/api/equipment/units",
    async (req) => {
      await ctx.auth(req);
      return service.listUnits({
        modelId: req.query.modelId,
        status: req.query.status,
        projectId: req.query.projectId,
        warehouseId: req.query.warehouseId,
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
  app.get<{ Querystring: { limit?: string; projectId?: string; warehouseId?: string } }>("/api/equipment/journal", async (req) => {
    await ctx.auth(req);
    return service.listJournal({
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      projectId: req.query.projectId,
      warehouseId: req.query.warehouseId,
    });
  });
  app.get<{ Params: { id: string } }>("/api/people/:id/equipment-journal", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "people.view", "people.manage");
    return service.getJournalByActor(req.params.id);
  });
  app.post("/api/equipment/units", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.catalog.manage");
    return service.createUnit(createUnitSchema.parse(req.body));
  });
  app.patch<{ Params: { id: string } }>("/api/equipment/units/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.catalog.manage", "warehouse.unit.status");
    return service.updateUnit(req.params.id, updateUnitSchema.parse(req.body));
  });
  app.patch<{ Params: { id: string } }>("/api/equipment/units/:id/status", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.unit.status");
    const body = statusSchema.parse(req.body);
    return service.changeStatus(req.params.id, body.status as Equipment.UnitStatus, auth.userId, body.note);
  });
  app.post<{ Params: { id: string } }>("/api/equipment/units/:id/transfer", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.catalog.manage");
    const body = unitTransferSchema.parse(req.body);
    return service.transferUnit(req.params.id, body.warehouseId, auth.userId, body.note ?? null, body.zoneId);
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
  app.patch<{ Params: { id: string } }>("/api/equipment/contractors/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.catalog.manage");
    return service.updateContractor(req.params.id, updateContractorSchema.parse(req.body));
  });

  // ── Repairs ──
  app.get("/api/equipment/repairs/open", async (req) => {
    const auth = await ctx.auth(req);
    const rows = await service.listOpenRepairs();
    return canViewCosts(auth) ? rows : rows.map(hideRepairCost);
  });
  app.get<{ Params: { id: string } }>("/api/equipment/units/:id/repairs", async (req) => {
    const auth = await ctx.auth(req);
    const rows = await service.listRepairs(req.params.id);
    return canViewCosts(auth) ? rows : rows.map(hideRepairCost);
  });
  app.post<{ Params: { id: string } }>("/api/equipment/units/:id/repair", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.unit.status");
    const body = openRepairSchema.parse(req.body);
    const row = await service.openRepair({ ...body, estCostEUR: canViewCosts(auth) ? body.estCostEUR : null, unitId: req.params.id, actorId: auth.userId });
    return canViewCosts(auth) ? row : hideRepairCost(row);
  });
  app.post<{ Params: { id: string } }>("/api/equipment/repairs/:id/close", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.unit.status");
    const body = closeRepairSchema.parse(req.body);
    const row = await service.closeRepair(req.params.id, { ...body, costEUR: canViewCosts(auth) ? body.costEUR : null, actorId: auth.userId });
    return canViewCosts(auth) ? row : hideRepairCost(row);
  });

  // ── Contractor handovers ──
  app.get("/api/equipment/handovers/open", async (req) => {
    const auth = await ctx.auth(req);
    const rows = await service.listOpenHandovers();
    return canViewCosts(auth) ? rows : rows.map(hideHandoverCost);
  });
  app.get<{ Params: { id: string } }>("/api/equipment/units/:id/handovers", async (req) => {
    const auth = await ctx.auth(req);
    const rows = await service.listHandovers(req.params.id);
    return canViewCosts(auth) ? rows : rows.map(hideHandoverCost);
  });
  app.post<{ Params: { id: string } }>("/api/equipment/units/:id/to-contractor", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.unit.status");
    const body = toContractorSchema.parse(req.body);
    const row = await service.sendToContractor({ ...body, costEUR: canViewCosts(auth) ? body.costEUR : null, unitId: req.params.id, actorId: auth.userId });
    return canViewCosts(auth) ? row : hideHandoverCost(row);
  });
  app.post<{ Params: { id: string } }>("/api/equipment/handovers/:id/return", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "warehouse.unit.status");
    const body = returnHandoverSchema.parse(req.body);
    const row = await service.returnFromContractor(req.params.id, { ...body, actorId: auth.userId });
    return canViewCosts(auth) ? row : hideHandoverCost(row);
  });
}
