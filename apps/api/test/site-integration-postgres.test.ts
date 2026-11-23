import { describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import type { SiteWebhookPayloadDTO } from "@sever/contracts/site-integration";
import { pool } from "../src/core/db.js";
import { runMigrations } from "../src/core/migrate.js";
import { siteIntegrationMigration } from "../src/modules/siteIntegration/migration.js";
import { createSiteIntegrationService } from "../src/modules/siteIntegration/service.js";

async function migrated() {
  await runMigrations();
}

describe.sequential("R1 PostgreSQL invariants", () => {
  it("enforces requested-equipment target, conversion, FK and uniqueness guards", async () => {
    await migrated();
    const ids = await pool.query<{ project_id: string; reservation_id: string; contractor_item_id: string }>(`
      WITH client AS (INSERT INTO projects.clients(name) VALUES ('R1 constraint test') RETURNING id),
      project AS (INSERT INTO projects.projects(name, base_name, client_id, starts_at, ends_at) SELECT 'R1 constraint', 'R1 constraint', id, now(), now() + interval '1 hour' FROM client RETURNING id),
      reservation AS (INSERT INTO projects.reservations(project_id, model_id, qty) SELECT id, gen_random_uuid(), 1 FROM project RETURNING id),
      item AS (INSERT INTO projects.contractor_items(project_id, contractor_id, name) SELECT id, gen_random_uuid(), 'R1 item' FROM project RETURNING id)
      SELECT (SELECT id::text FROM project) project_id, (SELECT id::text FROM reservation) reservation_id, (SELECT id::text FROM item) contractor_item_id
    `);
    const { project_id, reservation_id, contractor_item_id } = ids.rows[0]!;
    const insert = (values: string) => pool.query(`INSERT INTO projects.requested_equipment(project_id, source_import_id, source_site_line_id, source_mapping_component_key, target_kind, target_id, contractor_id, site_quantity, qty_per_site_unit, requested_quantity, review_status, converted_reservation_id, converted_contractor_item_id) VALUES ${values}`);
    await expect(insert(`('${project_id}', gen_random_uuid(), 'bad-kind', '1', 'invalid', gen_random_uuid(), NULL, 1, 1, 1, 'pending_review', NULL, NULL)`)).rejects.toThrow();
    await expect(insert(`('${project_id}', gen_random_uuid(), 'own-with-contractor', '1', 'own_model', gen_random_uuid(), gen_random_uuid(), 1, 1, 1, 'pending_review', NULL, NULL)`)).rejects.toThrow();
    await expect(insert(`('${project_id}', gen_random_uuid(), 'wrong-conversion', '1', 'own_model', gen_random_uuid(), NULL, 1, 1, 1, 'converted', NULL, '${contractor_item_id}')`)).rejects.toThrow();
    await expect(insert(`('${project_id}', gen_random_uuid(), 'unknown-reservation', '1', 'own_model', gen_random_uuid(), NULL, 1, 1, 1, 'converted', gen_random_uuid(), NULL)`)).rejects.toThrow();
    await insert(`('${project_id}', gen_random_uuid(), 'line-1', '1', 'own_model', gen_random_uuid(), NULL, 1, 1, 1, 'converted', '${reservation_id}', NULL)`);
    await expect(insert(`('${project_id}', gen_random_uuid(), 'line-1', '1', 'own_model', gen_random_uuid(), NULL, 1, 1, 1, 'pending_review', NULL, NULL)`)).rejects.toThrow();
    await expect(insert(`('${project_id}', gen_random_uuid(), 'line-2', '1', 'own_model', gen_random_uuid(), NULL, 1, 1, 1, 'converted', '${reservation_id}', NULL)`)).rejects.toThrow();
  });

  it("enforces component/FK uniqueness, immutable quotes, and processing lease state", async () => {
    await migrated();
    const row = await pool.query<{ inbox_id: string; version_id: string }>(`
      WITH inbox AS (INSERT INTO site_integration.inbox(source, environment, external_order_id, raw_payload) VALUES ('r1-db-test', 'test', gen_random_uuid()::text, '{}') RETURNING id),
      mapping AS (INSERT INTO site_integration.product_mappings(source, site_product_id) VALUES ('r1-db-test', gen_random_uuid()::text) RETURNING id),
      version AS (INSERT INTO site_integration.product_mapping_versions(mapping_id, version, accounting_unit, status) SELECT id, 1, 'catalog_unit', 'published' FROM mapping RETURNING id)
      SELECT (SELECT id::text FROM inbox) inbox_id, (SELECT id::text FROM version) version_id
    `);
    const { inbox_id, version_id } = row.rows[0]!;
    await pool.query(`INSERT INTO site_integration.product_mapping_components(mapping_version_id, component_key, target_kind, target_id, qty_per_site_unit, counting_unit) VALUES ('${version_id}', 'one', 'own_model', gen_random_uuid(), 1, 'physical_unit')`);
    await expect(pool.query(`INSERT INTO site_integration.product_mapping_components(mapping_version_id, component_key, target_kind, target_id, qty_per_site_unit, counting_unit) VALUES ('${version_id}', 'one', 'own_model', gen_random_uuid(), 1, 'physical_unit')`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO site_integration.mapping_snapshots(inbox_id, site_line_id, mapping_version_id, snapshot) VALUES (gen_random_uuid(), 'x', '${version_id}', '{}')`)).rejects.toThrow();
    await pool.query(`INSERT INTO site_integration.quote_snapshots(inbox_id, currency, lines, raw_quote) VALUES ('${inbox_id}', 'EUR', '[]', '{}')`);
    await expect(pool.query(`UPDATE site_integration.quote_snapshots SET currency='USD' WHERE inbox_id='${inbox_id}'`)).rejects.toThrow("immutable");
    await expect(pool.query(`DELETE FROM site_integration.quote_snapshots WHERE inbox_id='${inbox_id}'`)).rejects.toThrow("immutable");
    await expect(pool.query(`INSERT INTO site_integration.inbox(source, environment, external_order_id, raw_payload, status, lease_token) VALUES ('r1-db-test', 'test', gen_random_uuid()::text, '{}', 'processing', gen_random_uuid())`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO site_integration.inbox(source, environment, external_order_id, raw_payload, status, lease_expires_at) VALUES ('r1-db-test', 'test', gen_random_uuid()::text, '{}', 'processing', now() + interval '1 minute')`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO site_integration.inbox(source, environment, external_order_id, raw_payload, status) VALUES ('r1-db-test', 'test', gen_random_uuid()::text, '{}', 'processing')`)).rejects.toThrow();
    await expect(pool.query(`UPDATE site_integration.inbox SET status='processing', lease_token=gen_random_uuid(), lease_expires_at=NULL WHERE id='${inbox_id}'`)).rejects.toThrow();
    const leased = await pool.query<{ id: string }>(`INSERT INTO site_integration.inbox(source, environment, external_order_id, raw_payload, status, lease_token, lease_expires_at, attempts, retry_after) VALUES ('r1-db-test', 'test', gen_random_uuid()::text, '{}', 'processing', gen_random_uuid(), now() + interval '1 minute', 0, now()) RETURNING id`);
    await expect(pool.query(`UPDATE site_integration.inbox SET lease_expires_at=NULL WHERE id='${leased.rows[0]!.id}'`)).rejects.toThrow();
    await pool.query(`UPDATE site_integration.inbox SET status='retryable_failure', lease_token=NULL, lease_expires_at=NULL, attempts=attempts+1, retry_after=now() WHERE id='${leased.rows[0]!.id}'`);
    await pool.query(`INSERT INTO site_integration.inbox(source, environment, external_order_id, raw_payload, status, lease_token, lease_expires_at) VALUES ('r1-db-test', 'test', gen_random_uuid()::text, '{}', 'processing', gen_random_uuid(), now() - interval '1 minute')`);
  });

  it("creates one named lease constraint and upgrades legacy inbox schemas atomically", async () => {
    const client = await pool.connect();
    const earlyR1Inbox = `CREATE TABLE site_integration.inbox (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source text NOT NULL, environment text NOT NULL CHECK (environment IN ('test','live')),
      external_order_id text NOT NULL, raw_payload jsonb NOT NULL, payload_digest text,
      status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processing','needs_review','imported','failed')),
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0), lease_token uuid, lease_expires_at timestamptz,
      retry_after timestamptz, last_error text, review_reasons text[] NOT NULL DEFAULT '{}', import_id uuid, project_id uuid,
      received_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(source, environment, external_order_id),
      CHECK ((status = 'processing') = (lease_token IS NOT NULL)),
      CHECK (lease_expires_at IS NULL OR lease_token IS NOT NULL)
    )`;
    const namedConstraintCount = async () => Number((await client.query(`SELECT count(*)::int AS count FROM pg_constraint WHERE conrelid='site_integration.inbox'::regclass AND conname='inbox_processing_requires_lease_check'`)).rows[0]!.count);
    try {
      await client.query("BEGIN; DROP SCHEMA IF EXISTS site_integration CASCADE; CREATE SCHEMA site_integration;");
      await client.query(siteIntegrationMigration);
      expect(await namedConstraintCount()).toBe(1);
      expect((await client.query(`SELECT attnotnull FROM pg_attribute WHERE attrelid='site_integration.inbox'::regclass AND attname='status'`)).rows[0]!.attnotnull).toBe(true);
      await client.query(siteIntegrationMigration);
      expect(await namedConstraintCount()).toBe(1);
      await client.query("ROLLBACK");

      await client.query(`BEGIN; DROP SCHEMA IF EXISTS site_integration CASCADE; CREATE SCHEMA site_integration; ${earlyR1Inbox};`);
      await client.query(`INSERT INTO site_integration.inbox(source, environment, external_order_id, raw_payload, status, lease_token, lease_expires_at) VALUES ('early-r1', 'test', 'valid-lease', '{}', 'processing', gen_random_uuid(), now() + interval '1 minute')`);
      await client.query(siteIntegrationMigration);
      expect(await namedConstraintCount()).toBe(1);
      await client.query(siteIntegrationMigration);
      expect(await namedConstraintCount()).toBe(1);
      await client.query(`UPDATE site_integration.inbox SET status='retryable_failure', lease_token=NULL, lease_expires_at=NULL WHERE source='early-r1'`);
      await client.query("ROLLBACK");

      await client.query(`BEGIN; DROP SCHEMA IF EXISTS site_integration CASCADE; CREATE SCHEMA site_integration; ${earlyR1Inbox};`);
      await client.query(`INSERT INTO site_integration.inbox(source, environment, external_order_id, raw_payload, status, lease_token) VALUES ('early-r1', 'test', 'invalid-lease', '{}', 'processing', gen_random_uuid())`);
      await client.query("SAVEPOINT lease_upgrade_attempt");
      await expect(client.query(siteIntegrationMigration)).rejects.toThrow("processing rows require both lease_token and lease_expires_at");
      await client.query("ROLLBACK TO SAVEPOINT lease_upgrade_attempt");
      expect(await namedConstraintCount()).toBe(0);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("upgrades the actual early-R1 component shape atomically and rejects ambiguity", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DROP SCHEMA IF EXISTS site_integration CASCADE; CREATE SCHEMA site_integration; CREATE TABLE site_integration.product_mappings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source text NOT NULL, site_product_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz, UNIQUE(source, site_product_id)); CREATE TABLE site_integration.product_mapping_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mapping_id uuid NOT NULL REFERENCES site_integration.product_mappings(id), version integer NOT NULL, accounting_unit text NOT NULL, site_unit text NOT NULL DEFAULT 'item', status text NOT NULL DEFAULT 'draft', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(mapping_id, version)); CREATE TABLE site_integration.product_mapping_components(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mapping_version_id uuid NOT NULL REFERENCES site_integration.product_mapping_versions(id), component_key text NOT NULL, model_id uuid, quantity_multiplier numeric(12,4), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(mapping_version_id, component_key));");
      await client.query("WITH m AS (INSERT INTO site_integration.product_mappings(source, site_product_id) VALUES ('early-r1', 'valid') RETURNING id), v AS (INSERT INTO site_integration.product_mapping_versions(mapping_id, version, accounting_unit) SELECT id, 1, 'catalog_unit' FROM m RETURNING id) INSERT INTO site_integration.product_mapping_components(mapping_version_id, component_key, model_id, quantity_multiplier) SELECT id, 'a', gen_random_uuid(), 2 FROM v");
      await client.query(siteIntegrationMigration);
      expect((await client.query("SELECT target_kind, target_id IS NOT NULL AS has_target, qty_per_site_unit FROM site_integration.product_mapping_components")).rows[0]).toMatchObject({ target_kind: "own_model", has_target: true, qty_per_site_unit: "2.0000" });
      await client.query(siteIntegrationMigration);
      await client.query("ROLLBACK");
      await client.query("BEGIN; DROP SCHEMA IF EXISTS site_integration CASCADE; CREATE SCHEMA site_integration; CREATE TABLE site_integration.product_mappings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source text NOT NULL, site_product_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz, UNIQUE(source, site_product_id)); CREATE TABLE site_integration.product_mapping_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mapping_id uuid NOT NULL REFERENCES site_integration.product_mappings(id), version integer NOT NULL, accounting_unit text NOT NULL, site_unit text NOT NULL DEFAULT 'item', status text NOT NULL DEFAULT 'draft', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(mapping_id, version)); CREATE TABLE site_integration.product_mapping_components(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mapping_version_id uuid NOT NULL REFERENCES site_integration.product_mapping_versions(id), component_key text NOT NULL, model_id uuid, quantity_multiplier numeric(12,4), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(mapping_version_id, component_key)); WITH m AS (INSERT INTO site_integration.product_mappings(source, site_product_id) VALUES ('early-r1', 'ambiguous') RETURNING id), v AS (INSERT INTO site_integration.product_mapping_versions(mapping_id, version, accounting_unit) SELECT id, 1, 'catalog_unit' FROM m RETURNING id) INSERT INTO site_integration.product_mapping_components(mapping_version_id, component_key) SELECT id, 'ambiguous' FROM v;");
      await client.query("SAVEPOINT upgrade_attempt");
      await expect(client.query(siteIntegrationMigration)).rejects.toThrow("no unambiguous own-model target");
      await client.query("ROLLBACK TO SAVEPOINT upgrade_attempt");
      expect((await client.query("SELECT to_regclass('site_integration.inbox') AS inbox")).rows[0].inbox).toBeNull();
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });
});

describe.sequential("R2 webhook PostgreSQL invariants", () => {
  it("keeps exact signed bytes, JSONB compatibility, and a matching digest", async () => {
    await migrated();
    const service = createSiteIntegrationService(pool);
    const id = `r2-byte-exact-${randomUUID()}`;
    const rawBody = Buffer.from(`{ "event":"order.created", "id":"${id}", "source":"test" }`);
    const payload: SiteWebhookPayloadDTO = { id, event: "order.created", createdAt: "2026-11-08T12:00:00Z", source: "test", lang: "ru", items: [{ id: "x", name: { sr: "X", ru: "X", en: "X" }, qty: 1, pricePerDay: 1 }], rental: { start: "2026-11-20", end: "2026-11-22", pickupTime: "10:00", returnTime: "10:00", days: 2, discountPercent: 0 }, totals: { perDay: 1, total: 2, currency: "EUR" }, delivery: { type: "pickup", address: "" }, customer: { name: "I", telegram: "", phone: "+381601234567", instagram: "", other: "", preferred: ["whatsapp"] } };
    await service.receiveWebhook({ deliveryId: "r2-byte-delivery", payload, rawBody });
    const stored = await pool.query<{ raw_body: Buffer; payload_digest: string; raw_payload: { id: string; source: string } }>("SELECT raw_body, payload_digest, raw_payload FROM site_integration.inbox WHERE source='sever-website' AND environment='test' AND external_order_id=$1", [id]);
    expect(stored.rows[0]!.raw_body.equals(rawBody)).toBe(true);
    expect(stored.rows[0]!.payload_digest).toBe(createHash("sha256").update(rawBody).digest("hex"));
    expect(stored.rows[0]!.raw_payload).toMatchObject({ id, source: "test" });
  });

  it("serializes duplicate and conflicting concurrent deliveries without overwriting the original", async () => {
    await migrated();
    const service = createSiteIntegrationService(pool);
    const id = `r2-concurrent-${randomUUID()}`;
    const payload: SiteWebhookPayloadDTO = { id, event: "order.created", createdAt: "2026-11-08T12:00:00Z", source: "test", lang: "ru", items: [{ id: "x", name: { sr: "X", ru: "X", en: "X" }, qty: 1, pricePerDay: 1 }], rental: { start: "2026-11-20", end: "2026-11-22", pickupTime: "10:00", returnTime: "10:00", days: 2, discountPercent: 0 }, totals: { perDay: 1, total: 2, currency: "EUR" }, delivery: { type: "pickup", address: "" }, customer: { name: "I", telegram: "", phone: "+381601234567", instagram: "", other: "", preferred: ["whatsapp"] } };
    const raw = Buffer.from(JSON.stringify(payload));
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => service.receiveWebhook({ deliveryId: `r2-concurrent-${index}`, payload, rawBody: raw })));
    expect(results.filter(result => result.outcome === "received")).toHaveLength(1);
    expect(results.filter(result => result.outcome === "duplicate")).toHaveLength(7);
    const conflict = await service.receiveWebhook({ deliveryId: "r2-conflict", payload, rawBody: Buffer.from(JSON.stringify({ ...payload, customer: { ...payload.customer, name: "Changed" } })) });
    expect(conflict.outcome).toBe("conflict");
    expect(Number((await pool.query("SELECT count(*) FROM site_integration.inbox WHERE source='sever-website' AND environment='test' AND external_order_id=$1", [id])).rows[0]!.count)).toBe(1);
  });

  it("isolates the same external ID by environment and rolls back failed inserts", async () => {
    await migrated();
    const service = createSiteIntegrationService(pool);
    const id = `r2-scoped-${randomUUID()}`;
    const base: SiteWebhookPayloadDTO = { id, event: "order.created", createdAt: "2026-11-08T12:00:00Z", source: "test", lang: "ru", items: [{ id: "x", name: { sr: "X", ru: "X", en: "X" }, qty: 1, pricePerDay: 1 }], rental: { start: "2026-11-20", end: "2026-11-22", pickupTime: "10:00", returnTime: "10:00", days: 2, discountPercent: 0 }, totals: { perDay: 1, total: 2, currency: "EUR" }, delivery: { type: "pickup", address: "" }, customer: { name: "I", telegram: "", phone: "+381601234567", instagram: "", other: "", preferred: ["whatsapp"] } };
    await Promise.all([service.receiveWebhook({ deliveryId: "r2-test", payload: base, rawBody: Buffer.from(JSON.stringify(base)) }), service.receiveWebhook({ deliveryId: "r2-live", payload: { ...base, source: "live" }, rawBody: Buffer.from(JSON.stringify({ ...base, source: "live" })) })]);
    expect(Number((await pool.query("SELECT count(*) FROM site_integration.inbox WHERE source='sever-website' AND external_order_id=$1", [id])).rows[0]!.count)).toBe(2);
    const queries: string[] = [];
    const failing = createSiteIntegrationService({ connect: async () => ({ query: async (sql: string) => { queries.push(sql); if (sql.startsWith("INSERT")) throw new Error("insert failed"); return { rowCount: 0, rows: [] }; }, release: () => undefined }) } as never);
    await expect(failing.receiveWebhook({ deliveryId: "r2-failure", payload: base, rawBody: Buffer.from("{}") })).rejects.toThrow("insert failed");
    expect(queries).toEqual(["BEGIN", expect.stringContaining("INSERT INTO site_integration.inbox"), "ROLLBACK"]);
    const commitFailing = createSiteIntegrationService({ connect: async () => ({ query: async (sql: string) => {
      if (sql === "COMMIT") throw new Error("commit failed");
      if (sql.startsWith("INSERT")) return { rowCount: 1, rows: [{ id: "uncommitted" }] };
      return { rowCount: 0, rows: [] };
    }, release: () => undefined }) } as never);
    await expect(commitFailing.receiveWebhook({ deliveryId: "r2-commit-failure", payload: base, rawBody: Buffer.from("{}") })).rejects.toThrow("commit failed");
  });
});
