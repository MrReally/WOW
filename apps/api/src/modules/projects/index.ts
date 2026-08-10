import type { Equipment, Projects } from "@sever/contracts";
import type { Sql } from "../../core/db.js";
import type { EventBus } from "../../core/eventBus.js";
import type { SeverModule } from "../../core/module.js";
import { projectsMigration } from "./migration.js";
import { createProjectsService } from "./service.js";
import { registerProjectsRoutes } from "./routes.js";

export function createProjectsModule(
  db: Sql,
  bus: EventBus,
  loadEquipmentUnits: (unitIds: string[]) => Promise<(Equipment.EquipmentUnitDTO | null)[]>
): SeverModule<Projects.ProjectsService> {
  const service = createProjectsService(db, bus, loadEquipmentUnits);
  return {
    name: "projects",
    migration: projectsMigration,
    service,
    registerRoutes: (app, ctx) => registerProjectsRoutes(app, ctx, service),
  };
}
