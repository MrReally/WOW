import type { FastifyInstance } from "fastify";
import type { Supplies } from "@sever/contracts";
import { z } from "zod";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";

const uuid=z.string().uuid(),qty=z.number().finite().nonnegative(),positive=z.number().finite().positive();
const settings=z.object({itemId:uuid,warehouseId:uuid,minimumQty:qty,maximumQty:qty,incomingQty:qty.optional()});
const container=z.object({itemId:uuid,warehouseId:uuid,label:z.string().trim().min(1),capacityLiters:positive,initialLiters:qty.optional(),note:z.string().trim().nullable().optional()});
const level=z.object({fillPercent:z.number().min(0).max(100),note:z.string().trim().nullable().optional()});
const movement=z.object({itemId:uuid,warehouseId:uuid,containerId:uuid.nullable().optional(),action:z.enum(["consume","adjust","write_off"]),quantity:z.number().finite().refine(v=>v!==0,"quantity must not be zero"),projectId:uuid.nullable().optional(),note:z.string().trim().nullable().optional()});
const receipt=z.object({itemId:uuid,warehouseId:uuid,containerId:uuid.nullable().optional(),quantity:positive,packageCount:positive.nullable().optional(),packageLabel:z.string().trim().nullable().optional(),supplierName:z.string().trim().nullable().optional(),currency:z.enum(["EUR","USD","RSD","RUB","GBP"]),totalPrice:qty,fxRateToEUR:positive,note:z.string().trim().nullable().optional(),receivedAt:z.string().datetime().optional()});

export function registerSuppliesRoutes(app:FastifyInstance,ctx:RouteContext,service:Supplies.SuppliesService){
  app.get<{Querystring:{warehouseId?:string}}>("/api/supplies/stock",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"supplies.view");return service.listStock(req.query.warehouseId);});
  app.put("/api/supplies/settings",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"supplies.catalog.manage");return service.setSettings(settings.parse(req.body));});
  app.get<{Querystring:{itemId?:string;warehouseId?:string}}>("/api/supplies/containers",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"supplies.view");return service.listContainers(req.query.itemId,req.query.warehouseId);});
  app.post("/api/supplies/containers",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"supplies.catalog.manage");return service.createContainer(container.parse(req.body),auth.userId);});
  app.patch<{Params:{id:string}}>("/api/supplies/containers/:id/level",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"supplies.move");const body=level.parse(req.body);return service.setContainerLevel(req.params.id,body.fillPercent,auth.userId,body.note);});
  app.get<{Querystring:{itemId?:string;warehouseId?:string;limit?:string}}>("/api/supplies/movements",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"supplies.view");return service.listMovements({itemId:req.query.itemId,warehouseId:req.query.warehouseId,limit:Number(req.query.limit)||200});});
  app.post("/api/supplies/movements",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"supplies.move");return service.createMovement(movement.parse(req.body),auth.userId);});
  app.get<{Querystring:{itemId?:string}}>("/api/supplies/receipts",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"supplies.view");return service.listReceipts(req.query.itemId);});
  app.post("/api/supplies/receipts",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"supplies.purchase.manage");return service.createReceipt(receipt.parse(req.body),auth.userId);});
}
