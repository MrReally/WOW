import type { People } from "@sever/contracts";
import type { Sql } from "../../core/db.js";
import type { EventBus } from "../../core/eventBus.js";
import type { SeverModule } from "../../core/module.js";
import { peopleMigration } from "./migration.js";
import { createPeopleService } from "./service.js";
import { registerPeopleRoutes } from "./routes.js";

export function createPeopleModule(
  db: Sql,
  bus: EventBus
): SeverModule<People.PeopleService> {
  const service = createPeopleService(db, bus);
  return {
    name: "people",
    migration: peopleMigration,
    service,
    registerRoutes: (app, ctx) => registerPeopleRoutes(app, ctx, service),
  };
}
