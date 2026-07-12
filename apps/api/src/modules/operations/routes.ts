import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Operations } from "@sever/contracts";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";
const uuid=z.string().uuid();
const payload=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("issue"),projectId:uuid,unitIds:z.array(uuid).min(1),note:z.string().nullable().optional()}),
 z.object({kind:z.literal("return"),projectId:uuid,returnedUnitIds:z.array(uuid),expectedUnitIds:z.array(uuid).min(1),note:z.string().nullable().optional()}),
 z.object({kind:z.literal("transfer"),unitId:uuid,warehouseId:uuid,note:z.string().nullable().optional()}),
 z.object({kind:z.literal("inventory"),warehouseId:uuid.nullable().optional(),lines:z.array(z.object({unitId:uuid,present:z.boolean()})).min(1),note:z.string().nullable().optional()})
]);
export function registerOperationsRoutes(app:FastifyInstance,ctx:RouteContext,service:Operations.OperationsService){
 app.get("/api/operations/documents",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.view");return service.list();});
 app.post("/api/operations/documents",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.issue","warehouse.catalog.manage");return service.create(payload.parse(req.body),auth.userId);});
 app.post<{Params:{id:string}}>("/api/operations/documents/:id/post",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.issue","warehouse.catalog.manage");return service.post(req.params.id,auth.userId);});
 app.post<{Params:{id:string}}>("/api/operations/documents/:id/reverse",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.issue","warehouse.catalog.manage");return service.reverse(req.params.id,auth.userId);});
}
