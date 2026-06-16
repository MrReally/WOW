import type { Plans } from "@sever/contracts";
import type { Sql } from "../../core/db.js";
import type { SeverModule } from "../../core/module.js";
import { plansMigration } from "./migration.js";
import { createPlansService } from "./service.js";
import { registerPlansRoutes } from "./routes.js";

export function createPlansModule(db: Sql): SeverModule<Plans.PlansService> {
  const service = createPlansService(db);
  return {
    name: "plans",
    migration: plansMigration,
    service,
    registerRoutes: (app, ctx) => registerPlansRoutes(app, ctx, service),
  };
}
