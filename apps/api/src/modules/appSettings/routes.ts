import type { FastifyInstance } from "fastify";
import { DATE_FORMATS, type AppSettings } from "@sever/contracts";
import { z } from "zod";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";

const schema = z.object({
  dateFormat: z.enum(DATE_FORMATS),
  timeFormat: z.enum(["24h", "12h"]),
});
const dressCodeSchema = z.object({ label: z.string().trim().min(1) });

export function registerAppSettingsRoutes(app: FastifyInstance, ctx: RouteContext, service: AppSettings.AppSettingsService) {
  app.get("/api/app-settings/date-time", async () => service.getDateTimeSettings());
  app.put("/api/app-settings/date-time", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "roles.manage");
    return service.updateDateTimeSettings(schema.parse(req.body));
  });
  app.get<{ Querystring: { includeArchived?: string } }>("/api/app-settings/dress-codes", async (req) => service.listDressCodeOptions(req.query.includeArchived === "true"));
  app.post("/api/app-settings/dress-codes", async (req) => {
    const auth = await ctx.auth(req); requirePermission(auth, "projects.manage");
    return service.createDressCodeOption(dressCodeSchema.parse(req.body));
  });
  app.patch<{ Params: { id: string } }>("/api/app-settings/dress-codes/:id", async (req) => {
    const auth = await ctx.auth(req); requirePermission(auth, "projects.manage");
    return service.updateDressCodeOption(req.params.id, dressCodeSchema.partial().extend({ active: z.boolean().optional(), sortOrder: z.number().int().optional() }).parse(req.body));
  });
}
