import type { Pool, PoolClient } from "pg";
import { z } from "zod";

const uuid = z.string().uuid();
const componentSchema = z.object({
  targetKind: z.enum(["own_model", "contractor_catalog"]),
  targetId: uuid,
  contractorId: uuid.optional(),
  qtyPerSiteUnit: z.number().finite().positive(),
  countingUnit: z.enum(["physical_unit", "catalog_entry"]),
  representedPhysicalQtyPerCatalogUnit: z.number().finite().positive().optional(),
  catalogEntryRepresentsBundle: z.boolean().optional(),
}).passthrough().superRefine((component, context) => {
  if (component.targetKind === "contractor_catalog" && !component.contractorId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "contractor_catalog requires contractorId" });
  }
  if (component.targetKind === "own_model" && component.contractorId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "own_model must not include contractorId" });
  }
  if (component.catalogEntryRepresentsBundle && component.countingUnit !== "catalog_entry") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "a bundle must be a catalog_entry" });
  }
});

const mappingSchema = z.object({
  siteProductId: z.string().trim().min(1),
  siteName: z.string().trim().min(1),
  siteCategory: z.string().trim().min(1),
  siteDailyPriceEUR: z.number().finite().nonnegative(),
  siteHidden: z.boolean(),
  components: z.array(componentSchema).min(1),
  reviewStatus: z.literal("user_approved_and_snapshot_id_verified"),
}).passthrough();

const documentSchema = z.object({
  schema: z.literal("sever_site_product_mapping_handoff_v1"),
  status: z.literal("final_user_approved_read_only_handoff_not_imported"),
  summary: z.object({
    websiteProducts: z.literal(52),
    mappedProducts: z.literal(52),
    unmappedProducts: z.literal(0),
  }).passthrough(),
  mappings: z.array(mappingSchema).length(52),
}).passthrough();

export type ApprovedSiteMappingDocument = z.infer<typeof documentSchema>;

export function parseApprovedSiteMappingDocument(value: unknown): ApprovedSiteMappingDocument {
  const document = documentSchema.parse(value);
  const ids = new Set<string>();
  let componentCount = 0;
  for (const mapping of document.mappings) {
    if (ids.has(mapping.siteProductId)) throw new Error(`Duplicate siteProductId: ${mapping.siteProductId}`);
    ids.add(mapping.siteProductId);
    componentCount += mapping.components.length;
  }
  if (componentCount !== 53) throw new Error(`Expected 53 mapping components, received ${componentCount}`);
  return document;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface ApprovedMappingImportResult {
  inserted: number;
  unchanged: number;
}

async function assertTestDatabase(client: PoolClient): Promise<void> {
  // This is intentionally inside the service. A caller cannot bypass it by
  // skipping the CLI or by naming a production URL "sever_test".
  const result = await client.query<{ database: string }>("SELECT current_database() AS database");
  if (result.rows[0]?.database !== "sever_test") {
    throw new Error("Approved R1 mapping importer is restricted to the isolated sever_test database");
  }
}

/**
 * Imports only the owner-approved R1 handoff. It never updates a mapping: an
 * existing but different version is a diagnostic conflict requiring review.
 */
export async function importApprovedSiteMappings(db: Pool, value: unknown): Promise<ApprovedMappingImportResult> {
  const document = parseApprovedSiteMappingDocument(value);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await assertTestDatabase(client);
    // A document-level transaction lock makes the read/compare/insert sequence
    // atomic even for two Pool clients importing it at exactly the same time.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('site-integration:approved-mapping-import'))");
    let inserted = 0;
    let unchanged = 0;
    for (const mapping of document.mappings) {
      const current = await client.query<{ id: string; source_document: unknown }>(`
        SELECT m.id, v.source_document
        FROM site_integration.product_mappings m
        JOIN site_integration.product_mapping_versions v ON v.mapping_id=m.id AND v.status='published'
        WHERE m.source=$1 AND m.site_product_id=$2
      `, ["sever-site", mapping.siteProductId]);
      if (current.rowCount) {
        if (stableJson(current.rows[0]!.source_document) !== stableJson(mapping)) {
          throw new Error(`Mapping conflict for ${mapping.siteProductId}; existing mapping was not overwritten`);
        }
        unchanged += 1;
        continue;
      }
      const mappingRow = await client.query<{ id: string }>(`
        INSERT INTO site_integration.product_mappings(source, site_product_id)
        VALUES ($1, $2) RETURNING id
      `, ["sever-site", mapping.siteProductId]);
      const accountingUnit = mapping.components.length > 1
        ? "component"
        : mapping.components[0]!.catalogEntryRepresentsBundle ? "catalog_pair" : "catalog_unit";
      const versionRow = await client.query<{ id: string }>(`
        INSERT INTO site_integration.product_mapping_versions(mapping_id, version, accounting_unit, status, source_document)
        VALUES ($1, 1, $2, 'published', $3::jsonb) RETURNING id
      `, [mappingRow.rows[0]!.id, accountingUnit, JSON.stringify(mapping)]);
      for (const [index, component] of mapping.components.entries()) {
        await client.query(`
          INSERT INTO site_integration.product_mapping_components(
            mapping_version_id, component_key, target_kind, target_id,
            contractor_id, qty_per_site_unit, counting_unit,
            represented_physical_qty_per_catalog_unit, catalog_entry_represents_bundle
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          versionRow.rows[0]!.id,
          `${index + 1}:${component.targetKind}:${component.targetId}`,
          component.targetKind,
          component.targetId,
          component.contractorId ?? null,
          component.qtyPerSiteUnit,
          component.countingUnit,
          component.representedPhysicalQtyPerCatalogUnit ?? null,
          component.catalogEntryRepresentsBundle ?? false,
        ]);
      }
      inserted += 1;
    }
    await client.query("COMMIT");
    return { inserted, unchanged };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type SiteIntegrationSqlClient = PoolClient;
