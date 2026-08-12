import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Operations } from "@sever/contracts";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";
const uuid=z.string().uuid();
const quantityLine=z.object({modelId:uuid,warehouseId:uuid.nullable().optional(),qty:z.number().int().positive()});
const issuePayload=z.object({kind:z.literal("issue"),projectId:uuid,unitIds:z.array(uuid),quantityLines:z.array(quantityLine).optional(),note:z.string().nullable().optional()});
const returnPayload=z.object({kind:z.literal("return"),projectId:uuid,returnedUnitIds:z.array(uuid),expectedUnitIds:z.array(uuid),quantityLines:z.array(quantityLine).optional(),note:z.string().nullable().optional()});
const payload=z.discriminatedUnion("kind",[
 issuePayload,
 returnPayload,
 z.object({kind:z.literal("transfer"),unitId:uuid,warehouseId:uuid,note:z.string().nullable().optional()}),
 z.object({kind:z.literal("inventory"),warehouseId:uuid.nullable().optional(),lines:z.array(z.object({unitId:uuid,present:z.boolean()})).min(1),note:z.string().nullable().optional()})
]).superRefine((value,ctx)=>{
 if(value.kind==="issue"&&value.unitIds.length===0&&!value.quantityLines?.length)ctx.addIssue({code:z.ZodIssueCode.custom,message:"добавьте оборудование"});
 if(value.kind==="return"&&value.expectedUnitIds.length===0&&!value.quantityLines?.length)ctx.addIssue({code:z.ZodIssueCode.custom,message:"добавьте оборудование"});
});
const documentInput=z.intersection(payload,z.object({documentAt:z.string().datetime({offset:true}).optional()}));
const quickIssue=issuePayload.omit({kind:true});
const quickReturn=returnPayload.omit({kind:true});
export function registerOperationsRoutes(app:FastifyInstance,ctx:RouteContext,service:Operations.OperationsService){
 app.get("/api/operations/documents",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.view");return service.list();});
 app.get<{Params:{id:string}}>("/api/operations/documents/:id/history",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.view");return service.history(req.params.id);});
 app.post("/api/operations/documents",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.issue","warehouse.catalog.manage");const {documentAt,...body}=documentInput.parse(req.body);return service.create(body as Operations.OperationPayload,auth.userId,documentAt);});
 app.post("/api/operations/issue",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.issue");const body=payload.parse({kind:"issue",...quickIssue.parse(req.body)});const document=await service.create(body,auth.userId);return service.post(document.id,auth.userId);});
 app.post("/api/operations/return",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.issue");const body=payload.parse({kind:"return",...quickReturn.parse(req.body)});const document=await service.create(body,auth.userId);return service.post(document.id,auth.userId);});
 app.patch<{Params:{id:string}}>("/api/operations/documents/:id",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.issue","warehouse.catalog.manage");const {documentAt,...body}=documentInput.parse(req.body);return service.update(req.params.id,body as Operations.OperationPayload,auth.userId,documentAt);});
 app.post<{Params:{id:string}}>("/api/operations/documents/:id/post",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.issue","warehouse.catalog.manage");return service.post(req.params.id,auth.userId);});
 app.post<{Params:{id:string}}>("/api/operations/documents/:id/reverse",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.issue","warehouse.catalog.manage");return service.reverse(req.params.id,auth.userId);});
}
