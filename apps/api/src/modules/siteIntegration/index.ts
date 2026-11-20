import type { SeverModule } from "../../core/module.js";
import type { Pool } from "pg";
import { siteIntegrationMigration } from "./migration.js";
import { importApprovedSiteMappings } from "./importApprovedMappings.js";

/** R1 intentionally exposes no receiver or worker API. */
export function createSiteIntegrationModule(db: Pool): SeverModule<{ importApprovedMappings: (value: unknown) => Promise<{ inserted: number; unchanged: number }> }> {
  return {
    name: "siteIntegration",
    migration: siteIntegrationMigration,
    service: { importApprovedMappings: value => importApprovedSiteMappings(db, value) },
    registerRoutes: () => undefined,
  };
}
