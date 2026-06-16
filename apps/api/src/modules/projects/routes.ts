import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Projects } from "@sever/contracts";
import { PROJECT_STATUSES } from "@sever/contracts";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";

const clientSchema = z.object({
  name: z.string().min(1),
  contacts: z.string().nullable().optional(),
});
const projectSchema = z.object({
  name: z.string().min(1),
  clientId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  venueId: z.string().uuid().nullable().optional(),
});
const statusSchema = z.object({ status: z.enum(PROJECT_STATUSES as [string, ...string[]]) });
const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  clientId: z.string().uuid().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  venueId: z.string().uuid().nullable().optional(),
});
const reservationSchema = z.object({
  projectId: z.string().uuid(),
  modelId: z.string().uuid(),
  qty: z.number().int().positive(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});
const resolveSchema = z.object({ unitIds: z.array(z.string().uuid()) });
const timingSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  assigneeIds: z.array(z.string().uuid()).optional(),
});
const timingAssigneesSchema = z.object({ userIds: z.array(z.string().uuid()) });
const assignmentSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  roleNote: z.string().nullable().optional(),
  rateEUR: z.number().nonnegative().nullable().optional(),
  invite: z.boolean().optional(),
});

export function registerProjectsRoutes(
  app: FastifyInstance,
  ctx: RouteContext,
  service: Projects.ProjectsService
): void {
  // ── Clients ──
  app.get("/api/clients", async (req) => {
    await ctx.auth(req);
    return service.listClients();
  });
  app.post("/api/clients", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "clients.manage");
    return service.createClient(clientSchema.parse(req.body));
  });

  // ── Projects ──
  app.get<{ Querystring: { status?: Projects.ProjectStatus; mine?: string } }>(
    "/api/projects",
    async (req) => {
      const auth = await ctx.auth(req);
      // People who can't manage projects (field techs) see only their own.
      if (req.query.mine === "true" || !auth.permissions.includes("projects.manage")) {
        return service.listProjectsForUser(auth.userId);
      }
      return service.listProjects({ status: req.query.status });
    }
  );
  app.get<{ Params: { id: string } }>("/api/projects/:id", async (req) => {
    await ctx.auth(req);
    return service.getProject(req.params.id);
  });
  app.post("/api/projects", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.manage");
    return service.createProject(projectSchema.parse(req.body) as Projects.CreateProjectInput);
  });
  app.patch<{ Params: { id: string } }>("/api/projects/:id/status", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.manage");
    const body = statusSchema.parse(req.body);
    return service.setStatus(req.params.id, body.status as Projects.ProjectStatus);
  });
  app.patch<{ Params: { id: string } }>("/api/projects/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.manage");
    return service.updateProject(req.params.id, updateProjectSchema.parse(req.body) as Projects.UpdateProjectInput);
  });

  // ── Reservations ──
  app.get<{ Params: { id: string } }>("/api/projects/:id/reservations", async (req) => {
    await ctx.auth(req);
    return service.listReservations(req.params.id);
  });
  app.post("/api/reservations", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.reservation.manage");
    return service.createReservation(reservationSchema.parse(req.body) as Projects.CreateReservationInput);
  });
  app.post<{ Params: { id: string } }>("/api/reservations/:id/resolve", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.reservation.manage");
    return service.resolveReservation(req.params.id, resolveSchema.parse(req.body).unitIds);
  });

  // ── Timings + assignments ──
  app.get<{ Params: { id: string } }>("/api/projects/:id/timings", async (req) => {
    const auth = await ctx.auth(req);
    // Whoever can see the whole timing (or manage it) gets every block;
    // everyone else sees only the blocks they're personally on.
    const seesAll =
      auth.permissions.includes("projects.timing.viewAll") || auth.permissions.includes("projects.timing.manage");
    return service.listTimings(req.params.id, seesAll ? undefined : { forUserId: auth.userId });
  });
  app.post("/api/timings", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.timing.manage");
    return service.addTiming(timingSchema.parse(req.body));
  });
  app.put<{ Params: { id: string } }>("/api/timings/:id/assignees", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.timing.manage");
    return service.setTimingAssignees(req.params.id, timingAssigneesSchema.parse(req.body).userIds);
  });
  app.delete<{ Params: { id: string } }>("/api/timings/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.timing.manage");
    await service.deleteTiming(req.params.id);
    return { ok: true };
  });
  app.get<{ Params: { id: string } }>("/api/projects/:id/assignments", async (req) => {
    await ctx.auth(req);
    return service.listAssignments(req.params.id);
  });
  app.post("/api/assignments", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.assignment.manage");
    const body = assignmentSchema.parse(req.body);
    return service.addAssignment({ ...body, invitedByUserId: auth.userId } as Projects.AddAssignmentInput);
  });

  // ── Problems ──
  app.get<{ Querystring: { includeResolved?: string } }>("/api/projects-problems", async (req) => {
    await ctx.auth(req);
    return service.listProblems({ includeResolved: req.query.includeResolved === "true" });
  });
  app.post<{ Params: { id: string } }>("/api/projects-problems/:id/resolve", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.reservation.manage");
    await service.resolveProblem(req.params.id);
    return { ok: true };
  });
}
