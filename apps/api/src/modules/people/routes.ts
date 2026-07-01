import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { People } from "@sever/contracts";
import { ALL_PERMISSIONS } from "@sever/contracts";
import type { RouteContext } from "../../core/module.js";
import { requirePermission, bearerToken, verifyTelegramInitData } from "../../core/auth.js";
import { Unauthorized, Forbidden } from "../../core/errors.js";
import { env } from "../../env.js";

const permissionEnum = z.enum(ALL_PERMISSIONS as [string, ...string[]]);

const bootstrapSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1),
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const changePwSchema = z.object({ newPassword: z.string().min(6), currentPassword: z.string().optional() });
const myPreferencesSchema = z.object({ operationsShowAllProjects: z.boolean().optional() });

const createUserSchema = z.object({
  displayName: z.string().min(1),
  roleId: z.string().uuid(),
  email: z.string().email().nullable().optional(),
  telegramId: z.string().min(1).nullable().optional(),
  hourlyRateEUR: z.number().nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  patronymic: z.string().nullable().optional(),
  nickname: z.string().nullable().optional(),
  documentNumber: z.string().nullable().optional(),
  documentPhotoUrl: z.string().nullable().optional(),
  languages: z.string().nullable().optional(),
  about: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  usePhotoAsAvatar: z.boolean().optional(),
  birthDate: z.string().nullable().optional(),
});
const updateUserSchema = z.object({
  displayName: z.string().min(1).optional(),
  roleId: z.string().uuid().optional(),
  email: z.string().email().nullable().optional(),
  telegramId: z.string().min(1).nullable().optional(),
  hourlyRateEUR: z.number().nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  patronymic: z.string().nullable().optional(),
  nickname: z.string().nullable().optional(),
  documentNumber: z.string().nullable().optional(),
  documentPhotoUrl: z.string().nullable().optional(),
  languages: z.string().nullable().optional(),
  about: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  usePhotoAsAvatar: z.boolean().optional(),
  birthDate: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

const createRoleSchema = z.object({ name: z.string().min(1), permissions: z.array(permissionEnum) });
const updateRoleSchema = z.object({ name: z.string().min(1).optional(), permissions: z.array(permissionEnum).optional() });
const applicationStatusSchema = z.enum(["pending", "accepted", "rejected", "all"]);
const acceptApplicationSchema = z.object({ roleId: z.string().uuid() });

export function registerPeopleRoutes(
  app: FastifyInstance,
  ctx: RouteContext,
  service: People.PeopleService
): void {
  // ── Auth (no session required) ──
  app.get("/api/auth/setup-status", async () => ({ needsBootstrap: (await service.countUsers()) === 0 }));
  app.post("/api/auth/bootstrap", async (req) => service.bootstrapOwner(bootstrapSchema.parse(req.body)));
  app.post("/api/auth/login", async (req) => {
    const body = loginSchema.parse(req.body);
    return service.loginWithPassword(body.email, body.password);
  });
  // Telegram Mini App: exchange verified initData for a session token.
  app.post("/api/auth/telegram", async (req) => {
    const { initData } = z.object({ initData: z.string().min(1) }).parse(req.body);
    if (!env.auth.telegramBotToken) throw Forbidden("Telegram-вход не настроен");
    const tg = verifyTelegramInitData(initData, env.auth.telegramBotToken);
    if (!tg) throw Unauthorized("недействительные данные Telegram");
    const name = [tg.first_name, tg.last_name].filter(Boolean).join(" ") || tg.username || String(tg.id);
    const su = await service.resolveTelegramUser(String(tg.id), name);
    if (!su) throw Forbidden("этот Telegram не привязан к аккаунту — попросите администратора");
    const token = await service.issueToken(su.user.id);
    return { token, user: su.user, permissions: su.permissions, mustChangePassword: su.user.mustChangePassword };
  });
  app.post("/api/auth/logout", async (req) => {
    const token = bearerToken(req);
    if (token) await service.logout(token);
    return { ok: true };
  });
  app.post("/api/auth/change-password", async (req) => {
    const auth = await ctx.auth(req);
    const body = changePwSchema.parse(req.body);
    await service.changePassword(auth.userId, body.newPassword, body.currentPassword);
    return { ok: true };
  });

  app.get("/api/people/me", async (req) => {
    const auth = await ctx.auth(req);
    const user = await service.getById(auth.userId);
    return { user, permissions: auth.permissions, isOwner: auth.isOwner };
  });
  app.patch("/api/people/me/preferences", async (req) => {
    const auth = await ctx.auth(req);
    const body = myPreferencesSchema.parse(req.body);
    if (body.operationsShowAllProjects && !auth.isOwner) {
      throw Forbidden("эта настройка доступна только владельцу");
    }
    const user = await service.updateMyPreferences(auth.userId, body as People.UpdateMyPreferencesInput);
    return { user, permissions: auth.permissions, isOwner: auth.isOwner };
  });

  // ── Users ──
  app.get("/api/people", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "people.view", "people.manage");
    return service.list();
  });
  app.post("/api/people", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "people.manage");
    return service.create(createUserSchema.parse(req.body) as People.CreateUserInput);
  });
  app.patch<{ Params: { id: string } }>("/api/people/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "people.manage");
    return service.update(req.params.id, updateUserSchema.parse(req.body) as People.UpdateUserInput);
  });
  app.post<{ Params: { id: string } }>("/api/people/:id/reset-password", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "people.manage");
    return service.resetPassword(req.params.id);
  });
  app.get<{ Querystring: { status?: People.CrewApplicationStatus | "all" } }>("/api/crew-applications", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "people.applications.review", "people.manage");
    const status = req.query.status ? applicationStatusSchema.parse(req.query.status) : "pending";
    return service.listApplications(status);
  });
  app.post<{ Params: { id: string } }>("/api/crew-applications/:id/accept", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "people.applications.review", "people.manage");
    const body = acceptApplicationSchema.parse(req.body);
    return service.acceptApplication(req.params.id, { roleId: body.roleId, reviewedByUserId: auth.userId });
  });
  app.post<{ Params: { id: string } }>("/api/crew-applications/:id/reject", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "people.applications.review", "people.manage");
    return service.rejectApplication(req.params.id, auth.userId);
  });

  // ── Roles ──
  app.get("/api/roles", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "roles.manage", "people.manage");
    return service.listRoles();
  });
  app.post("/api/roles", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "roles.manage");
    return service.createRole(createRoleSchema.parse(req.body) as People.CreateRoleInput);
  });
  app.patch<{ Params: { id: string } }>("/api/roles/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "roles.manage");
    return service.updateRole(req.params.id, updateRoleSchema.parse(req.body) as People.UpdateRoleInput);
  });
  app.delete<{ Params: { id: string } }>("/api/roles/:id", async (req) => {
    const auth = await ctx.auth(req);
    requirePermission(auth, "roles.manage");
    await service.deleteRole(req.params.id);
    return { ok: true };
  });
}
