import type { Equipment, Operations, Projects } from "@sever/contracts";
import type { Sql } from "../../core/db.js";
import type { SeverModule } from "../../core/module.js";
import { migration } from "./migration.js";
import { createOperationsService } from "./service.js";
import { registerOperationsRoutes } from "./routes.js";
export function createOperationsModule(db:Sql,equipment:Equipment.EquipmentService,projects:Projects.ProjectsService):SeverModule<Operations.OperationsService>{const service=createOperationsService(db,equipment,projects);return{name:"operations",migration,service,registerRoutes:(app,ctx)=>registerOperationsRoutes(app,ctx,service)};}
