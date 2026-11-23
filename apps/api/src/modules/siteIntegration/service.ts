import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { SiteWebhookPayloadDTO } from "@sever/contracts/site-integration";

const SITE_SOURCE = "sever-website";

export type InboxWriteResult =
  | { outcome: "received"; inboxId: string }
  | { outcome: "duplicate"; inboxId: string }
  | { outcome: "conflict"; inboxId: string };

/** R2's only side effect: append one committed inbox entry. */
export function createSiteIntegrationService(db: Pool) {
  return {
    async receiveWebhook(input: { deliveryId: string; payload: SiteWebhookPayloadDTO; rawBody: Buffer }): Promise<InboxWriteResult> {
      const digest = createHash("sha256").update(input.rawBody).digest("hex");
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO site_integration.inbox
             (source, environment, external_order_id, delivery_id, raw_payload, raw_body, payload_digest)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
           ON CONFLICT (source, environment, external_order_id) DO NOTHING
           RETURNING id::text`,
          [SITE_SOURCE, input.payload.source, input.payload.id, input.deliveryId, JSON.stringify(input.payload), input.rawBody, digest],
        );
        if (inserted.rowCount) {
          await client.query("COMMIT");
          return { outcome: "received", inboxId: inserted.rows[0]!.id };
        }
        const existing = await client.query<{ id: string; payload_digest: string | null }>(
          `SELECT id::text, payload_digest FROM site_integration.inbox
           WHERE source=$1 AND environment=$2 AND external_order_id=$3`,
          [SITE_SOURCE, input.payload.source, input.payload.id],
        );
        if (!existing.rowCount) throw new Error("inbox idempotency row disappeared");
        await client.query("COMMIT");
        const row = existing.rows[0]!;
        return row.payload_digest === digest
          ? { outcome: "duplicate", inboxId: row.id }
          : { outcome: "conflict", inboxId: row.id };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
