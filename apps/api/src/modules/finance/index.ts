import type { Finance } from "@sever/contracts";
import type { Sql } from "../../core/db.js";
import type { EventBus } from "../../core/eventBus.js";
import type { SeverModule } from "../../core/module.js";
import { financeMigration } from "./migration.js";
import { createFinanceService } from "./service.js";
import { registerFinanceRoutes } from "./routes.js";

export function createFinanceModule(
  db: Sql,
  bus: EventBus
): SeverModule<Finance.FinanceService> {
  const service = createFinanceService(db, bus);
  return {
    name: "finance",
    migration: financeMigration,
    service,
    registerRoutes: (app, ctx) => registerFinanceRoutes(app, ctx, service),
  };
}
