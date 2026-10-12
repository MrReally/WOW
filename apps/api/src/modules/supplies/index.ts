import type { Supplies } from "@sever/contracts";
import type { Sql } from "../../core/db.js";
import type { SeverModule } from "../../core/module.js";
import { suppliesMigration } from "./migration.js";
import { registerSuppliesRoutes } from "./routes.js";
import { createSuppliesService } from "./service.js";

export function createSuppliesModule(db:Sql,itemExists:(id:string)=>Promise<boolean>,warehouseExists:(id:string)=>Promise<boolean>):SeverModule<Supplies.SuppliesService>{
  const service=createSuppliesService(db,itemExists,warehouseExists);
  return{name:"supplies",migration:suppliesMigration,service,registerRoutes:(app,ctx)=>registerSuppliesRoutes(app,ctx,service)};
}
