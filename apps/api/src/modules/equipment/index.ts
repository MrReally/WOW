import type { Equipment } from "@sever/contracts";
import type { Sql } from "../../core/db.js";
import type { EventBus } from "../../core/eventBus.js";
import type { SeverModule } from "../../core/module.js";
import { equipmentMigration } from "./migration.js";
import { createEquipmentService } from "./service.js";
import { registerEquipmentRoutes } from "./routes.js";

export function createEquipmentModule(
  db: Sql,
  bus: EventBus
): SeverModule<Equipment.EquipmentService> {
  const service = createEquipmentService(db, bus);
  return {
    name: "equipment",
    migration: equipmentMigration,
    service,
    registerRoutes: (app, ctx) => registerEquipmentRoutes(app, ctx, service),
  };
}
