import type { SeverModule } from "../../core/module.js";
import type { Pool } from "pg";
import { siteIntegrationMigration } from "./migration.js";
import { importApprovedSiteMappings } from "./importApprovedMappings.js";
import { registerSiteIntegrationRoutes } from "./routes.js";
import { createSiteIntegrationService } from "./service.js";

export function createSiteIntegrationModule(db: Pool): SeverModule<ReturnType<typeof createSiteIntegrationService> & { importApprovedMappings: (value: unknown) => Promise<{ inserted: number; unchanged: number }> }> {
  const receiver = createSiteIntegrationService(db);
  return {
    name: "siteIntegration",
    migration: siteIntegrationMigration,
    service: { ...receiver, importApprovedMappings: value => importApprovedSiteMappings(db, value) },
    registerRoutes: app => registerSiteIntegrationRoutes(app, receiver),
  };
}
