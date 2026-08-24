import type { FastifyInstance } from "fastify";
import { DATE_FORMATS, type AppSettings } from "@sever/contracts";
import { z } from "zod";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";

const schema = z.object({
  dateFormat: z.enum(DATE_FORMATS),
  timeFormat: z.enum(["24h", "12h"]),
});

export function registerAppSettingsRoutes(app: FastifyInstance, ctx: RouteContext, service: AppSettings.AppSettingsService) {
  app.get("/api/app-settings/date-time", async () => service.getDateTimeSettings());
  app.put("/api/app-settings/date-time", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "roles.manage");
    return service.updateDateTimeSettings(schema.parse(req.body));
  });
}
