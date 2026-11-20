import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SITE_IMPORT_STATUSES, isSiteImportStatus, normalizePhoneIdentity, parseSiteWebhookPayload, resolveEuropeBelgradeLocalDateTime } from "@sever/contracts/site-integration";
import type { SiteInboxDTO } from "@sever/contracts/site-integration";
import { siteIntegrationMigration } from "../src/modules/siteIntegration/migration.js";
import { projectsMigration } from "../src/modules/projects/migration.js";
import { parseApprovedSiteMappingDocument } from "../src/modules/siteIntegration/importApprovedMappings.js";

const approvedMapping = JSON.parse(readFileSync(new URL("../../../docs/site-integration/source-materials/SEVER_site_mapping_FINAL_52_2026-11-18.json", import.meta.url), "utf8"));

describe("R1 site-integration contracts", () => {
  it("accepts exactly the database inbox statuses", () => {
    const inboxStatusCheck = siteIntegrationMigration.match(/ADD CONSTRAINT inbox_status_check CHECK \(status IN \(([^)]+)\)\)/);
    expect(inboxStatusCheck).not.toBeNull();
    const databaseStatuses = inboxStatusCheck![1]!.match(/'([^']+)'/g)!.map(status => status.slice(1, -1));
    expect(SITE_IMPORT_STATUSES).toEqual(databaseStatuses);

    const retryableFailure: SiteInboxDTO["status"] = "retryable_failure";
    expect(isSiteImportStatus(retryableFailure)).toBe(true);
    for (const status of databaseStatuses) {
      const inboxStatus: SiteInboxDTO["status"] = status as SiteInboxDTO["status"];
      expect(isSiteImportStatus(inboxStatus)).toBe(true);
    }
    expect(isSiteImportStatus("unknown_status")).toBe(false);
  });

  it("resolves Europe/Belgrade winter and summer local wall times", () => {
    expect(resolveEuropeBelgradeLocalDateTime("2026-01-15", "14:10")).toMatchObject({ status: "resolved", instant: "2026-01-15T13:10:00.000Z" });
    expect(resolveEuropeBelgradeLocalDateTime("2026-07-15", "14:10")).toMatchObject({ status: "resolved", instant: "2026-07-15T12:10:00.000Z" });
  });

  it("requires review rather than guessing at both DST boundaries", () => {
    expect(resolveEuropeBelgradeLocalDateTime("2026-03-29", "02:30")).toMatchObject({ status: "needs_review", reason: "invalid_local_datetime", instant: null });
    expect(resolveEuropeBelgradeLocalDateTime("2026-10-25", "02:30")).toMatchObject({ status: "needs_review", reason: "ambiguous_local_datetime", instant: null });
  });

  it("normalizes only valid exact phone identities", () => {
    expect(normalizePhoneIdentity("+381 60 123-4567")).toBe("+381601234567");
    expect(normalizePhoneIdentity("not a phone")).toBeNull();
  });

  it("validates the original webhook body while preserving unknown fields", () => {
    const payload = parseSiteWebhookPayload({
      id: "ord_1", event: "order.created", createdAt: "2026-11-08T12:00:00Z", source: "test", lang: "ru",
      items: [{ id: "x32", name: { sr: "X32", ru: "X32", en: "X32" }, qty: 1, pricePerDay: 50 }],
      rental: { start: "2026-11-20", end: "2026-11-22", pickupTime: "10:00", returnTime: "10:00", days: 2, discountPercent: 0 },
      totals: { perDay: 50, total: 100, currency: "EUR" }, delivery: { type: "pickup", address: "" },
      customer: { name: "Ivan", telegram: "", phone: "+381601234567", instagram: "", other: "", preferred: ["whatsapp"] }, futureSiteField: true,
    });
    expect(payload.futureSiteField).toBe(true);
    expect(() => parseSiteWebhookPayload({ ...payload, source: "staging" })).toThrow("source");
  });

  it("contains the DB-level idempotency, recovery, quote and conversion guards", () => {
    expect(siteIntegrationMigration).toContain("UNIQUE(source, environment, external_order_id)");
    expect(siteIntegrationMigration).toContain("lease_expires_at");
    expect(siteIntegrationMigration).toContain("quote_snapshots is immutable");
    expect(siteIntegrationMigration).toContain("qty_per_site_unit > 0");
    expect(siteIntegrationMigration).toContain("target_kind IN ('own_model','contractor_catalog')");
    expect(projectsMigration).toContain("projects_one_project_per_source_import");
    expect(projectsMigration).toContain("UNIQUE(project_id, source_site_line_id, source_mapping_component_key)");
    expect(projectsMigration).toContain("UNIQUE(converted_reservation_id)");
  });

  it("validates the approved 52-product mapping, including pairs, bundle and hidden product", () => {
    const document = parseApprovedSiteMappingDocument(approvedMapping);
    const components = document.mappings.flatMap(mapping => mapping.components);
    expect(new Set(document.mappings.map(mapping => mapping.siteProductId)).size).toBe(52);
    expect(components).toHaveLength(53);
    expect(components.filter(component => component.targetKind === "own_model")).toHaveLength(38);
    expect(components.filter(component => component.targetKind === "contractor_catalog")).toHaveLength(15);
    expect(document.mappings.find(mapping => mapping.siteProductId === "ddj-flx10")?.siteHidden).toBe(true);
    expect(document.mappings.find(mapping => mapping.siteProductId === "akg-sr40-ht40")?.components).toHaveLength(2);
    expect(document.mappings.find(mapping => mapping.siteProductId === "rcf-art-745")?.components[0]).toMatchObject({ qtyPerSiteUnit: 1, catalogEntryRepresentsBundle: true, countingUnit: "catalog_entry" });
    expect(() => parseApprovedSiteMappingDocument({ ...approvedMapping, mappings: approvedMapping.mappings.slice(1) })).toThrow();
  });
});
