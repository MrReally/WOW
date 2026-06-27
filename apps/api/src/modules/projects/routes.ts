import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Projects } from "@sever/contracts";
import { PROJECT_CHECKLIST_GROUPS, PROJECT_STATUSES, PROJECT_TASK_STATUSES } from "@sever/contracts";
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
const operationStageSchema = z.object({ stage: z.enum(PROJECT_CHECKLIST_GROUPS as [string, ...string[]]) });
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
const taskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  assigneeId: z.string().uuid().nullable().optional(),
  timingId: z.string().uuid().nullable().optional(),
});
const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(PROJECT_TASK_STATUSES as [string, ...string[]]).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  timingId: z.string().uuid().nullable().optional(),
});
const checklistSchema = z.object({
  projectId: z.string().uuid(),
  group: z.enum(PROJECT_CHECKLIST_GROUPS as [string, ...string[]]),
  title: z.string().min(1),
});
const updateChecklistSchema = z.object({
  group: z.enum(PROJECT_CHECKLIST_GROUPS as [string, ...string[]]).optional(),
  title: z.string().min(1).optional(),
  done: z.boolean().optional(),
});
const contractorItemSchema = z.object({
  projectId: z.string().uuid(),
  contractorId: z.string().uuid(),
  kind: z.enum(["equipment", "delivery", "setup"]).optional(),
  name: z.string().min(1),
  qty: z.number().int().positive(),
  priceEUR: z.number().nonnegative(),
  costEUR: z.number().nonnegative(),
  note: z.string().nullable().optional(),
});
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
      // Field techs see only their own projects; managers and warehouse staff
      // (who issue/return gear and manage reservations) see all of them.
      const seesAll = auth.permissions.includes("projects.manage") || auth.permissions.includes("projects.reservation.manage");
      if (req.query.mine === "true" && auth.isOwner && auth.operationsShowAllProjects) {
        return service.listProjects({ status: req.query.status });
      }
      if (req.query.mine === "true" || !seesAll) {
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
  app.patch<{ Params: { id: string } }>("/api/projects/:id/operation-stage", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "operations.view", "projects.timing.manage", "projects.manage");
    const body = operationStageSchema.parse(req.body);
    return service.setOperationStage(req.params.id, body.stage as Projects.ProjectChecklistGroup);
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
  app.delete<{ Params: { id: string } }>("/api/reservations/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.reservation.manage");
    await service.deleteReservation(req.params.id);
    return { ok: true };
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

  app.get<{ Params: { id: string } }>("/api/projects/:id/tasks", async (req) => {
    const auth = await ctx.auth(req);
    const seesAll =
      auth.permissions.includes("projects.timing.viewAll") ||
      auth.permissions.includes("projects.timing.manage") ||
      auth.permissions.includes("projects.manage");
    return service.listTasks(req.params.id, seesAll ? undefined : { forUserId: auth.userId });
  });
  app.post<{ Params: { id: string } }>("/api/projects/:id/tasks", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.timing.manage", "projects.manage");
    const raw = req.body && typeof req.body === "object" ? req.body : {};
    const body = taskSchema.parse({ ...raw, projectId: req.params.id });
    return service.createTask(body as Projects.CreateProjectTaskInput);
  });
  app.patch<{ Params: { id: string } }>("/api/project-tasks/:id", async (req) => {
    const auth = await ctx.auth(req);
    const body = updateTaskSchema.parse(req.body);
    if (body.status && Object.keys(body).length === 1) {
      requirePermission(auth, "operations.view", "projects.timing.manage", "projects.manage");
    } else {
      requirePermission(auth, "projects.timing.manage", "projects.manage");
    }
    return service.updateTask(req.params.id, body as Projects.UpdateProjectTaskInput);
  });
  app.delete<{ Params: { id: string } }>("/api/project-tasks/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.timing.manage", "projects.manage");
    await service.deleteTask(req.params.id);
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id/checklist", async (req) => {
    await ctx.auth(req);
    return service.listChecklist(req.params.id);
  });
  app.post<{ Params: { id: string } }>("/api/projects/:id/checklist", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.timing.manage", "projects.manage");
    const raw = req.body && typeof req.body === "object" ? req.body : {};
    const body = checklistSchema.parse({ ...raw, projectId: req.params.id });
    return service.createChecklistItem(body as Projects.CreateProjectChecklistItemInput);
  });
  app.patch<{ Params: { id: string } }>("/api/project-checklist/:id", async (req) => {
    const auth = await ctx.auth(req);
    const body = updateChecklistSchema.parse(req.body);
    if (body.done !== undefined && Object.keys(body).length === 1) {
      requirePermission(auth, "operations.view", "projects.timing.manage", "projects.manage");
    } else {
      requirePermission(auth, "projects.timing.manage", "projects.manage");
    }
    return service.updateChecklistItem(req.params.id, { ...body, actorId: auth.userId } as Projects.UpdateProjectChecklistItemInput);
  });
  app.delete<{ Params: { id: string } }>("/api/project-checklist/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.timing.manage", "projects.manage");
    await service.deleteChecklistItem(req.params.id);
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
  app.delete<{ Params: { id: string } }>("/api/assignments/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.assignment.manage");
    await service.removeAssignment(req.params.id);
    return { ok: true };
  });

  // ── Contractor equipment (subrent) ──
  app.get<{ Params: { id: string } }>("/api/projects/:id/contractor-items", async (req) => {
    await ctx.auth(req);
    return service.listContractorItems(req.params.id);
  });
  app.get<{ Params: { id: string } }>("/api/contractors/:id/items", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.reservation.manage", "finance.view");
    return service.listContractorItemsByContractor(req.params.id);
  });
  app.get("/api/contractor-items/open", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.reservation.manage", "finance.view", "apex.view");
    return service.listOpenContractorItems();
  });
  app.post("/api/contractor-items", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.reservation.manage");
    return service.addContractorItem(contractorItemSchema.parse(req.body) as Projects.AddContractorItemInput);
  });
  app.delete<{ Params: { id: string } }>("/api/contractor-items/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.reservation.manage");
    await service.removeContractorItem(req.params.id);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>("/api/contractor-items/:id/return", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "projects.reservation.manage");
    return service.returnContractorItem(req.params.id);
  });
  app.get("/api/contractor-debts", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "finance.view", "finance.manage");
    return service.contractorDebts();
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
