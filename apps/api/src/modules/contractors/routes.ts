import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Contractors } from "@sever/contracts";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";

const contractorQuery = z.object({ contractorId: z.string().uuid().optional() });
const personSchema = z.object({ contractorId:z.string().uuid(), firstName:z.string().trim().min(1), lastName:z.string().trim().min(1), patronymic:z.string().trim().nullable().optional(), phone:z.string().trim().nullable().optional(), telegram:z.string().trim().nullable().optional(), documentNumber:z.string().trim().nullable().optional(), photoUrl:z.string().trim().nullable().optional() });
const vehicleSchema = z.object({ contractorId:z.string().uuid(), make:z.string().trim().min(1), model:z.string().trim().min(1), color:z.string().trim().nullable().optional(), plateNumber:z.string().trim().min(1) });
const equipmentSchema = z.object({ contractorId:z.string().uuid(), name:z.string().trim().min(1), availableQty:z.number().int().nonnegative().optional(), defaultCostEUR:z.number().nonnegative().nullable().optional(), maxQty:z.number().int().nonnegative().nullable().optional(), dryRentalCostEUR:z.number().nonnegative().nullable().optional(), deliveredCostEUR:z.number().nonnegative().nullable().optional(), warehouseId:z.string().uuid().nullable().optional(), note:z.string().trim().nullable().optional() });
const warehouseSchema = z.object({ contractorId:z.string().uuid(), name:z.string().trim().min(1), address:z.string().trim().nullable().optional(), latitude:z.number().min(-90).max(90).nullable().optional(), longitude:z.number().min(-180).max(180).nullable().optional(), comment:z.string().trim().nullable().optional(), secretComment:z.string().trim().nullable().optional() });
const canRead = (auth: Parameters<typeof requirePermission>[0]) => requirePermission(auth, "people.view", "projects.assignment.manage", "projects.reservation.manage", "warehouse.catalog.manage", "finance.view");
const canWrite = (auth: Parameters<typeof requirePermission>[0]) => requirePermission(auth, "projects.assignment.manage", "projects.reservation.manage", "warehouse.catalog.manage");

export function registerContractorsRoutes(app: FastifyInstance, ctx: RouteContext, service: Contractors.ContractorsService) {
  app.get<{Querystring:{contractorId?:string}}>("/api/contractors/people", async req => { const auth=await ctx.auth(req); canRead(auth); return service.listPeople(contractorQuery.parse(req.query).contractorId); });
  app.post("/api/contractors/people", async req => { const auth=await ctx.auth(req); canWrite(auth); return service.createPerson(personSchema.parse(req.body)); });
  app.get<{Querystring:{contractorId?:string}}>("/api/contractors/vehicles", async req => { const auth=await ctx.auth(req); canRead(auth); return service.listVehicles(contractorQuery.parse(req.query).contractorId); });
  app.post("/api/contractors/vehicles", async req => { const auth=await ctx.auth(req); canWrite(auth); return service.createVehicle(vehicleSchema.parse(req.body)); });
  app.get<{Querystring:{contractorId?:string}}>("/api/contractors/equipment", async req => { const auth=await ctx.auth(req); canRead(auth); return service.listEquipment(contractorQuery.parse(req.query).contractorId); });
  app.post("/api/contractors/equipment", async req => { const auth=await ctx.auth(req); canWrite(auth); return service.createEquipment(equipmentSchema.parse(req.body)); });
  app.patch<{Params:{id:string}}>("/api/contractors/equipment/:id", async req => { const auth=await ctx.auth(req); canWrite(auth); return service.updateEquipment(req.params.id,equipmentSchema.omit({contractorId:true}).partial().parse(req.body)); });
  app.get<{Querystring:{contractorId?:string}}>("/api/contractors/warehouses", async req => { const auth=await ctx.auth(req); canRead(auth); const rows=await service.listWarehouses(contractorQuery.parse(req.query).contractorId); return auth.permissions.includes("contractors.secret.view") ? rows : rows.map(row=>({...row,secretComment:null})); });
  app.post("/api/contractors/warehouses", async req => { const auth=await ctx.auth(req); canWrite(auth); const body=warehouseSchema.parse(req.body); return service.createWarehouse({ ...body, secretComment:auth.permissions.includes("contractors.secret.view")?body.secretComment:null }); });
  app.patch<{Params:{id:string}}>("/api/contractors/warehouses/:id", async req => { const auth=await ctx.auth(req); canWrite(auth); const body=warehouseSchema.omit({contractorId:true}).partial().parse(req.body); return service.updateWarehouse(req.params.id, auth.permissions.includes("contractors.secret.view")?body:{...body,secretComment:undefined}); });
}
