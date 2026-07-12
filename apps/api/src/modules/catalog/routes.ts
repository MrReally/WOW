import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Catalog } from "@sever/contracts";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";
const item=z.object({sku:z.string().min(1),name:z.string().min(1),kind:z.enum(["product","item","semi_finished","modifier","equipment_kit"]),groupName:z.string().nullable().optional(),baseUnit:z.string().min(1)});
const packaging=z.object({name:z.string().min(1),coefficient:z.number().positive(),barcode:z.string().nullable(),supplierCode:z.string().nullable(),active:z.boolean().default(true)});
const line=z.object({ingredientItemId:z.string().uuid(),unit:z.string().min(1),grossQty:z.number().nonnegative(),netQty:z.number().nonnegative(),baseQty:z.number().nonnegative()});
const recipe=z.object({version:z.number().int().positive(),validFrom:z.string().datetime(),validTo:z.string().datetime().nullable(),outputQty:z.number().positive(),outputUnit:z.string().min(1),technology:z.string().nullable(),lines:z.array(line)});
export function registerCatalogRoutes(app:FastifyInstance,ctx:RouteContext,service:Catalog.CatalogService){
 app.get("/api/catalog/items",async req=>{await ctx.auth(req);return service.listItems();});
 app.post("/api/catalog/items",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.catalog.manage");return service.createItem(item.parse(req.body));});
 app.get<{Params:{id:string}}>("/api/catalog/items/:id/packaging",async req=>{await ctx.auth(req);return service.listPackaging(req.params.id);});
 app.post<{Params:{id:string}}>("/api/catalog/items/:id/packaging",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.catalog.manage");return service.addPackaging(req.params.id,packaging.parse(req.body));});
 app.get<{Params:{id:string}}>("/api/catalog/items/:id/recipes",async req=>{await ctx.auth(req);return service.listRecipes(req.params.id);});
 app.post<{Params:{id:string}}>("/api/catalog/items/:id/recipes",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"warehouse.catalog.manage");return service.createRecipe(req.params.id,recipe.parse(req.body));});
}
