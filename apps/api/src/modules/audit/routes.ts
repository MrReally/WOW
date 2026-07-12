import type { FastifyInstance } from "fastify";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";
import type { Audit } from "@sever/contracts";

export function registerAuditRoutes(app:FastifyInstance,ctx:RouteContext,service:Audit.AuditService) {
  app.get<{Querystring:{limit?:string}}>("/api/audit",async req=>{const auth=await ctx.auth(req);requirePermission(auth,"roles.manage");return service.list(Number(req.query.limit)||500);});
}
