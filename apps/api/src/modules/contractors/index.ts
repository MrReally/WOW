import type { Contractors } from "@sever/contracts";
import type { Sql } from "../../core/db.js";
import type { SeverModule } from "../../core/module.js";
import { contractorsMigration } from "./migration.js";
import { registerContractorsRoutes } from "./routes.js";
import { createContractorsService } from "./service.js";

export function createContractorsModule(db: Sql): SeverModule<Contractors.ContractorsService> {
  const service = createContractorsService(db);
  return { name:"contractors", migration:contractorsMigration, service, registerRoutes:(app, ctx) => registerContractorsRoutes(app, ctx, service) };
}
