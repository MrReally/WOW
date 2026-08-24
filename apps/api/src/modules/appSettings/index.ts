import type { AppSettings } from "@sever/contracts";
import type { Sql } from "../../core/db.js";
import type { SeverModule } from "../../core/module.js";
import { appSettingsMigration } from "./migration.js";
import { registerAppSettingsRoutes } from "./routes.js";
import { createAppSettingsService } from "./service.js";

export function createAppSettingsModule(db: Sql): SeverModule<AppSettings.AppSettingsService> {
  const service = createAppSettingsService(db);
  return {
    name: "app-settings",
    migration: appSettingsMigration,
    service,
    registerRoutes: (app, ctx) => registerAppSettingsRoutes(app, ctx, service),
  };
}
