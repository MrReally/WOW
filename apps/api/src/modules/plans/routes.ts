import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Plans } from "@sever/contracts";
import { PLAN_LAYERS } from "@sever/contracts";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";

const layerEnum = z.enum(PLAN_LAYERS as [string, ...string[]]);
const kindEnum = z.enum(["fixture", "truss", "power", "audio", "label", "cable"]);
const attrsSchema = z.object({
  note: z.string().max(2000).optional(),
  dmxUniverse: z.number().int().min(1).max(64).optional(),
  dmxAddress: z.number().int().min(1).max(512).optional(),
  dmxChannels: z.number().int().min(1).max(512).optional(),
  powerW: z.number().nonnegative().max(1_000_000).optional(),
  requiredOutlets: z.number().int().min(1).max(1000).optional(),
  availableOutlets: z.number().int().min(1).max(1000).optional(),
  voltage: z.number().positive().max(100_000).optional(),
  maxPowerW: z.number().positive().max(10_000_000).optional(),
  circuit: z.string().max(120).optional(),
  cableLengthM: z.number().positive().max(100_000).optional(),
  cableQuantity: z.number().int().min(1).max(1000).optional(),
}).passthrough().superRefine((attrs, ctx) => {
  if (attrs.dmxAddress != null && attrs.dmxChannels != null && attrs.dmxAddress + attrs.dmxChannels - 1 > 512) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dmxChannels"], message: "диапазон DMX выходит за адрес 512" });
  }
});

const createPlanSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1),
  venueId: z.string().uuid().nullable().optional(),
  stageW: z.number().int().positive().optional(),
  stageH: z.number().int().positive().optional(),
});
const updatePlanSchema = z.object({
  name: z.string().min(1).optional(),
  venueId: z.string().uuid().nullable().optional(),
  stageW: z.number().int().positive().optional(),
  stageH: z.number().int().positive().optional(),
});
const addElementSchema = z.object({
  planId: z.string().uuid(),
  layer: layerEnum,
  kind: kindEnum,
  label: z.string().default(""),
  x: z.number(),
  y: z.number(),
  rotation: z.number().optional(),
  w: z.number().nullable().optional(),
  h: z.number().nullable().optional(),
  fromId: z.string().uuid().nullable().optional(),
  toId: z.string().uuid().nullable().optional(),
  modelId: z.string().uuid().nullable().optional(),
  unitId: z.string().uuid().nullable().optional(),
  attrs: attrsSchema.nullable().optional(),
});
const updateElementSchema = z.object({
  layer: layerEnum.optional(),
  label: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  rotation: z.number().optional(),
  w: z.number().nullable().optional(),
  h: z.number().nullable().optional(),
  fromId: z.string().uuid().nullable().optional(),
  toId: z.string().uuid().nullable().optional(),
  modelId: z.string().uuid().nullable().optional(),
  unitId: z.string().uuid().nullable().optional(),
  attrs: attrsSchema.nullable().optional(),
});
const moveSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), x: z.number(), y: z.number(), rotation: z.number().optional() })),
});

export function registerPlansRoutes(app: FastifyInstance, ctx: RouteContext, service: Plans.PlansService): void {
  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/plans", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "plans.view", "plans.manage", "operations.view");
    return service.listPlans(req.params.projectId);
  });
  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/plan", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "plans.view", "plans.manage", "operations.view");
    return service.getCurrentPlan(req.params.projectId);
  });
  app.get<{ Params: { id: string } }>("/api/plans/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "plans.view", "plans.manage", "operations.view");
    return service.getPlan(req.params.id);
  });
  app.post("/api/plans", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "plans.manage");
    return service.createPlan(createPlanSchema.parse(req.body) as Plans.CreatePlanInput);
  });
  app.post<{ Params: { id: string } }>("/api/plans/:id/new-version", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "plans.manage");
    return service.newVersion(req.params.id);
  });
  app.post<{ Params: { id: string } }>("/api/plans/:id/set-current", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "plans.manage");
    return service.setCurrent(req.params.id);
  });
  app.patch<{ Params: { id: string } }>("/api/plans/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "plans.manage");
    return service.updatePlan(req.params.id, updatePlanSchema.parse(req.body));
  });
  app.delete<{ Params: { id: string } }>("/api/plans/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "plans.manage");
    await service.deletePlan(req.params.id);
    return { ok: true };
  });

  // Elements
  app.post("/api/plan-elements", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "plans.manage");
    return service.addElement(addElementSchema.parse(req.body) as Plans.AddElementInput);
  });
  app.patch<{ Params: { id: string } }>("/api/plan-elements/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "plans.manage");
    return service.updateElement(req.params.id, updateElementSchema.parse(req.body) as Plans.UpdateElementInput);
  });
  app.delete<{ Params: { id: string } }>("/api/plan-elements/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "plans.manage");
    await service.deleteElement(req.params.id);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>("/api/plans/:id/move", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "plans.manage");
    await service.moveElements(req.params.id, moveSchema.parse(req.body).items);
    return { ok: true };
  });
}
