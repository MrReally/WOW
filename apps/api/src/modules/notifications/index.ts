import type { FastifyInstance } from "fastify";
import type { Notifications } from "@sever/contracts";
import { ADVANCED_NOTIFICATION_EVENTS, NOTIFICATION_KINDS } from "@sever/contracts";
import { one, query, type Sql } from "../../core/db.js";
import type { SeverModule } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";

const migration = `
CREATE SCHEMA IF NOT EXISTS notifications;
CREATE TABLE IF NOT EXISTS notifications.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,          -- opaque people id
  kind       text NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL,
  link       text,
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notif_user_idx ON notifications.notifications(user_id, read, created_at DESC);

-- Per-user delivery preferences. A row means an explicit choice; absence = on.
CREATE TABLE IF NOT EXISTS notifications.prefs (
  user_id uuid NOT NULL,
  kind    text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, kind)
);
`;

interface Row {
  id: string;
  user_id: string;
  kind: Notifications.NotificationKind;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: Date;
}
const toDTO = (r: Row): Notifications.NotificationDTO => ({
  id: r.id,
  userId: r.user_id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  link: r.link,
  read: r.read,
  createdAt: r.created_at.toISOString(),
});

function createService(db: Sql): Notifications.NotificationsService {
  const advKey = (event: Notifications.AdvancedNotificationEvent) => `advanced:${event}`;
  return {
    async listForUser(userId, opts) {
      const limit = Math.min(opts?.limit ?? 50, 100);
      const rows = await query<Row>(
        db,
        opts?.unreadOnly
          ? `SELECT * FROM notifications.notifications WHERE user_id=$1 AND read=false ORDER BY created_at DESC LIMIT ${limit}`
          : `SELECT * FROM notifications.notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT ${limit}`,
        [userId]
      );
      return rows.map(toDTO);
    },
    async unreadCount(userId) {
      const row = await one<{ n: string }>(db, `SELECT count(*)::text AS n FROM notifications.notifications WHERE user_id=$1 AND read=false`, [userId]);
      return Number(row?.n ?? 0);
    },
    async create(input) {
      const row = await one<Row>(
        db,
        `INSERT INTO notifications.notifications (user_id, kind, title, body, link) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [input.userId, input.kind, input.title, input.body, input.link ?? null]
      );
      return toDTO(row!);
    },
    async markRead(id, userId) {
      await query(db, `UPDATE notifications.notifications SET read=true WHERE id=$1 AND user_id=$2`, [id, userId]);
    },
    async markAllRead(userId) {
      await query(db, `UPDATE notifications.notifications SET read=true WHERE user_id=$1 AND read=false`, [userId]);
    },

    async getPrefs(userId) {
      const rows = await query<{ kind: string; enabled: boolean }>(
        db,
        `SELECT kind, enabled FROM notifications.prefs WHERE user_id=$1`,
        [userId]
      );
      const set = new Map(rows.map((r) => [r.kind, r.enabled]));
      const out = {} as Notifications.NotificationPrefs;
      for (const k of NOTIFICATION_KINDS) out[k] = set.get(k) ?? true; // default on
      return out;
    },
    async setPrefs(userId, prefs) {
      for (const k of NOTIFICATION_KINDS) {
        const enabled = prefs[k] ?? true;
        await query(
          db,
          `INSERT INTO notifications.prefs (user_id, kind, enabled) VALUES ($1,$2,$3)
           ON CONFLICT (user_id, kind) DO UPDATE SET enabled=EXCLUDED.enabled`,
          [userId, k, enabled]
        );
      }
      return this.getPrefs(userId);
    },
    async isEnabled(userId, kind) {
      const row = await one<{ enabled: boolean }>(
        db,
        `SELECT enabled FROM notifications.prefs WHERE user_id=$1 AND kind=$2`,
        [userId, kind]
      );
      return row?.enabled ?? true; // default on
    },
    async getAdvancedPrefs(userId) {
      const rows = await query<{ kind: string; enabled: boolean }>(
        db,
        `SELECT kind, enabled FROM notifications.prefs WHERE user_id=$1 AND kind LIKE 'advanced:%'`,
        [userId]
      );
      const set = new Map(rows.map((r) => [r.kind.replace(/^advanced:/, ""), r.enabled]));
      const out = {} as Notifications.AdvancedNotificationPrefs;
      for (const k of ADVANCED_NOTIFICATION_EVENTS) out[k] = set.get(k) ?? false; // default off
      return out;
    },
    async setAdvancedPrefs(userId, prefs) {
      for (const k of ADVANCED_NOTIFICATION_EVENTS) {
        const enabled = prefs[k] ?? false;
        await query(
          db,
          `INSERT INTO notifications.prefs (user_id, kind, enabled) VALUES ($1,$2,$3)
           ON CONFLICT (user_id, kind) DO UPDATE SET enabled=EXCLUDED.enabled`,
          [userId, advKey(k), enabled]
        );
      }
      return this.getAdvancedPrefs(userId);
    },
    async isAdvancedEnabled(userId, event) {
      const row = await one<{ enabled: boolean }>(
        db,
        `SELECT enabled FROM notifications.prefs WHERE user_id=$1 AND kind=$2`,
        [userId, advKey(event)]
      );
      return row?.enabled ?? false;
    },
  };
}

export function createNotificationsModule(db: Sql): SeverModule<Notifications.NotificationsService> {
  const service = createService(db);
  return {
    name: "notifications",
    migration,
    service,
    registerRoutes: (app: FastifyInstance, ctx) => {
      app.get<{ Querystring: { unread?: string } }>("/api/notifications", async (req) => {
        const auth = await ctx.auth(req);
        return service.listForUser(auth.userId, { unreadOnly: req.query.unread === "true" });
      });
      app.get("/api/notifications/unread-count", async (req) => {
        const auth = await ctx.auth(req);
        return { count: await service.unreadCount(auth.userId) };
      });
      app.post<{ Params: { id: string } }>("/api/notifications/:id/read", async (req) => {
        const auth = await ctx.auth(req);
        await service.markRead(req.params.id, auth.userId);
        return { ok: true };
      });
      app.post("/api/notifications/read-all", async (req) => {
        const auth = await ctx.auth(req);
        await service.markAllRead(auth.userId);
        return { ok: true };
      });
      app.get("/api/notifications/preferences", async (req) => {
        const auth = await ctx.auth(req);
        return service.getPrefs(auth.userId);
      });
      app.put("/api/notifications/preferences", async (req) => {
        const auth = await ctx.auth(req);
        return service.setPrefs(auth.userId, (req.body ?? {}) as Notifications.NotificationPrefs);
      });
      app.get("/api/notifications/advanced-preferences", async (req) => {
        const auth = await ctx.auth(req);
        requirePermission(auth, "notifications.advanced");
        return service.getAdvancedPrefs(auth.userId);
      });
      app.put("/api/notifications/advanced-preferences", async (req) => {
        const auth = await ctx.auth(req);
        requirePermission(auth, "notifications.advanced");
        return service.setAdvancedPrefs(auth.userId, (req.body ?? {}) as Notifications.AdvancedNotificationPrefs);
      });
    },
  };
}
