import type { Sql } from "../../core/db.js";
import type { SeverModule } from "../../core/module.js";
import { auditMigration } from "./migration.js";
import { createAuditService } from "./service.js";
import { registerAuditRoutes } from "./routes.js";

export function createAuditModule(db:Sql):SeverModule<ReturnType<typeof createAuditService>> { const service=createAuditService(db); return {name:"audit",migration:auditMigration,service,registerRoutes:(app,ctx)=>registerAuditRoutes(app,ctx,service)}; }
