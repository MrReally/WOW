import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { pool } from "../src/core/db.js";
import { runMigrations } from "../src/core/migrate.js";
import { importApprovedSiteMappings } from "../src/modules/siteIntegration/importApprovedMappings.js";

const approvedMapping = JSON.parse(readFileSync(new URL("../../../docs/site-integration/source-materials/SEVER_site_mapping_FINAL_52_2026-11-18.json", import.meta.url), "utf8"));

describe("approved site mapping importer", () => {
  it("is idempotent and rejects a conflicting approved-ID replacement", async () => {
    await runMigrations();
    const first = await importApprovedSiteMappings(pool, approvedMapping);
    const second = await importApprovedSiteMappings(pool, approvedMapping);
    expect(first.inserted + first.unchanged).toBe(52);
    expect(second).toEqual({ inserted: 0, unchanged: 52 });

    const conflicting = structuredClone(approvedMapping);
    conflicting.mappings[0].siteName = "must not overwrite approved mapping";
    await expect(importApprovedSiteMappings(pool, conflicting)).rejects.toThrow("existing mapping was not overwritten");
  });

  it("serializes identical concurrent imports and preserves every approved component", async () => {
    await runMigrations();
    const [first, second] = await Promise.all([
      importApprovedSiteMappings(pool, approvedMapping),
      importApprovedSiteMappings(pool, approvedMapping),
    ]);
    expect(first.inserted + first.unchanged).toBe(52);
    expect(second.inserted + second.unchanged).toBe(52);
    const totals = await pool.query(`
      SELECT (SELECT count(*)::int FROM site_integration.product_mappings WHERE source='sever-site' AND site_product_id NOT LIKE '%-conflict-%') AS mappings,
             (SELECT count(*)::int FROM site_integration.product_mapping_components c JOIN site_integration.product_mapping_versions v ON v.id=c.mapping_version_id JOIN site_integration.product_mappings m ON m.id=v.mapping_id WHERE m.source='sever-site' AND m.site_product_id NOT LIKE '%-conflict-%') AS components
    `);
    expect(totals.rows[0]).toEqual({ mappings: 52, components: 53 });
    const stored = await pool.query<{ target_id: string; qty_per_site_unit: string }>(`
      SELECT c.target_id::text, c.qty_per_site_unit::text
      FROM site_integration.product_mapping_components c
      JOIN site_integration.product_mapping_versions v ON v.id=c.mapping_version_id
      JOIN site_integration.product_mappings m ON m.id=v.mapping_id
      WHERE m.site_product_id='akg-sr40-ht40' ORDER BY c.component_key
    `);
    const expected = approvedMapping.mappings.find((mapping: { siteProductId: string }) => mapping.siteProductId === "akg-sr40-ht40").components;
    expect(stored.rows.map(row => ({ ...row, qty_per_site_unit: Number(row.qty_per_site_unit) }))).toEqual(expected.map((component: { targetId: string; qtyPerSiteUnit: number }) => ({ target_id: component.targetId, qty_per_site_unit: component.qtyPerSiteUnit })));
  });

  it("serializes conflicting snapshots without a mixed mapping or partial components", async () => {
    await runMigrations();
    for (let round = 0; round < 3; round += 1) {
      const left = structuredClone(approvedMapping);
      const right = structuredClone(approvedMapping);
      for (const mapping of left.mappings) mapping.siteProductId = `${mapping.siteProductId}-conflict-${round}`;
      for (const mapping of right.mappings) mapping.siteProductId = `${mapping.siteProductId}-conflict-${round}`;
      left.mappings[0].siteName = `left snapshot ${round}`;
      right.mappings[0].siteName = `right snapshot ${round}`;
      const firstPool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://sever:sever@localhost:5432/sever_test" });
      const secondPool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://sever:sever@localhost:5432/sever_test" });
      try {
        const result = await Promise.allSettled([
          importApprovedSiteMappings(firstPool, left),
          importApprovedSiteMappings(secondPool, right),
        ]);
        expect(result.filter(item => item.status === "fulfilled")).toHaveLength(1);
        const rejected = result.find((item): item is PromiseRejectedResult => item.status === "rejected");
        expect(rejected?.reason).toBeInstanceOf(Error);
        expect(String(rejected?.reason)).toContain("existing mapping was not overwritten");
        const stored = await pool.query<{ source_document: { siteName: string } }>(`
          SELECT v.source_document FROM site_integration.product_mapping_versions v
          JOIN site_integration.product_mappings m ON m.id=v.mapping_id
          WHERE m.source='sever-site' AND m.site_product_id=$1 AND v.status='published'
        `, [`${approvedMapping.mappings[0].siteProductId}-conflict-${round}`]);
        expect([left.mappings[0].siteName, right.mappings[0].siteName]).toContain(stored.rows[0]?.source_document.siteName);
        const totals = await pool.query<{ mappings: number; components: number }>(`
          SELECT (SELECT count(*)::int FROM site_integration.product_mappings WHERE source='sever-site' AND site_product_id LIKE $1) mappings,
                 (SELECT count(*)::int FROM site_integration.product_mapping_components c JOIN site_integration.product_mapping_versions v ON v.id=c.mapping_version_id JOIN site_integration.product_mappings m ON m.id=v.mapping_id WHERE m.source='sever-site' AND m.site_product_id LIKE $1) components
        `, [`%-conflict-${round}`]);
        expect(totals.rows[0]).toEqual({ mappings: 52, components: 53 });
        const winner = result.find(item => item.status === "fulfilled")!;
        const winningDocument = winner === result[0] ? left : right;
        await expect(importApprovedSiteMappings(pool, winningDocument)).resolves.toEqual({ inserted: 0, unchanged: 52 });
      } finally {
        await firstPool.end();
        await secondPool.end();
      }
    }
  });

  it("rejects a direct service call against the production database before writing", async () => {
    const target = new URL(process.env.DATABASE_URL ?? "postgres://sever:sever@localhost:5432/sever_test");
    target.pathname = "/sever";
    const productionLike = new Pool({ connectionString: target.toString() });
    try {
      await expect(importApprovedSiteMappings(productionLike, approvedMapping)).rejects.toThrow("restricted to the isolated sever_test database");
    } finally {
      await productionLike.end();
    }
  });
});
