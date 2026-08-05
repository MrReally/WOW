import type { Sql } from "../../core/db.js";
import type { SeverModule } from "../../core/module.js";
import type { Transport } from "@sever/contracts";
import { transportMigration } from "./migration.js";
import { createTransportService } from "./service.js";
import { registerTransportRoutes } from "./routes.js";

export function createTransportModule(db: Sql): SeverModule<Transport.TransportService> {
  const service = createTransportService(db);
  return { name: "transport", migration: transportMigration, service, registerRoutes: (app, ctx) => registerTransportRoutes(app, ctx, service) };
}
