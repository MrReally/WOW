import type { Sql } from "../../core/db.js";
import type { SeverModule } from "../../core/module.js";
import type { Catalog } from "@sever/contracts";
import { migration } from "./migration.js";
import { createCatalogService } from "./service.js";
import { registerCatalogRoutes } from "./routes.js";
export function createCatalogModule(db:Sql):SeverModule<Catalog.CatalogService>{const service=createCatalogService(db);return{name:"catalog",migration,service,registerRoutes:(app,ctx)=>registerCatalogRoutes(app,ctx,service)};}
