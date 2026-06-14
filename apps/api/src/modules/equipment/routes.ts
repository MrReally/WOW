import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Equipment } from "@sever/contracts";
import { UNIT_STATUSES } from "@sever/contracts";
import type { RouteContext } from "../../core/module.js";
import { requireRole } from "../../core/auth.js";

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

const createUnitSchema = z.object({
  modelId: z.string().uuid(),
  assetTag: z.string().min(1),
  serial: z.string().nullable().optional(),
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
    requireRole(auth, "admin", "warehouse");
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
    requireRole(auth, "admin", "warehouse");
    return service.createModel(createModelSchema.parse(req.body) as Equipment.CreateModelInput);
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
    requireRole(auth, "admin", "warehouse");
    return service.createUnit(createUnitSchema.parse(req.body));
  });
  app.patch<{ Params: { id: string } }>("/api/equipment/units/:id/status", async (req) => {
    const auth = await ctx.auth(req);
    requireRole(auth, "admin", "warehouse");
    const body = statusSchema.parse(req.body);
    return service.changeStatus(req.params.id, body.status as Equipment.UnitStatus, auth.userId, body.note);
  });

  // ── Operations (warehouse prepares; tech confirms on phone) ──
  app.post("/api/equipment/issue", async (req) => {
    const auth = await ctx.auth(req);
    requireRole(auth, "admin", "warehouse", "tech");
    const body = issueSchema.parse(req.body);
    return service.issueUnits({ ...body, actorId: auth.userId });
  });
  app.post("/api/equipment/return", async (req) => {
    const auth = await ctx.auth(req);
    requireRole(auth, "admin", "warehouse", "tech");
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
    requireRole(auth, "admin", "warehouse");
    await service.resolveProblem(req.params.id);
    return { ok: true };
  });
}
