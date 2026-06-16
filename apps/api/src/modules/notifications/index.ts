import type { FastifyInstance } from "fastify";
import type { Notifications } from "@sever/contracts";
import { one, query, type Sql } from "../../core/db.js";
import type { SeverModule } from "../../core/module.js";

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
    },
  };
}
