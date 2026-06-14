import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { People } from "@sever/contracts";
import { ROLES } from "@sever/contracts";
import type { RouteContext } from "../../core/module.js";
import { requireRole } from "../../core/auth.js";

const createSchema = z.object({
  telegramId: z.string().min(1),
  displayName: z.string().min(1),
  role: z.enum(ROLES as [string, ...string[]]),
  hourlyRateEUR: z.number().nullable().optional(),
});

const updateSchema = z.object({
  displayName: z.string().min(1).optional(),
  role: z.enum(ROLES as [string, ...string[]]).optional(),
  hourlyRateEUR: z.number().nullable().optional(),
  active: z.boolean().optional(),
});

export function registerPeopleRoutes(
  app: FastifyInstance,
  ctx: RouteContext,
  service: People.PeopleService
): void {
  app.get("/api/people/me", async (req) => {
    const auth = await ctx.auth(req);
    const user = await service.getById(auth.userId);
    return user;
  });

  app.get("/api/people", async (req) => {
    await ctx.auth(req);
    return service.list();
  });

  app.post("/api/people", async (req) => {
    const auth = await ctx.auth(req);
    requireRole(auth, "admin");
    const input = createSchema.parse(req.body) as People.CreateUserInput;
    return service.create(input);
  });

  app.patch<{ Params: { id: string } }>("/api/people/:id", async (req) => {
    const auth = await ctx.auth(req);
    requireRole(auth, "admin");
    const input = updateSchema.parse(req.body) as People.UpdateUserInput;
    return service.update(req.params.id, input);
  });
}
