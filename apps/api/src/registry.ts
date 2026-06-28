// Composition root. Wires modules together: each module gets the shared db pool
// and event bus, and exposes its public service. Cross-module references use
// only those public services (never internals) — the same way separate services
// would call each other. This file is the one place that knows the whole graph.

import { pool } from "./core/db.js";
import { EventBus } from "./core/eventBus.js";
import type { RouteContext } from "./core/module.js";
import type { FastifyInstance } from "fastify";

import { createPeopleModule } from "./modules/people/index.js";
import { createEquipmentModule } from "./modules/equipment/index.js";
import { createProjectsModule } from "./modules/projects/index.js";
import { createFinanceModule } from "./modules/finance/index.js";
import { createVenuesModule } from "./modules/venues/index.js";
import { createPlansModule } from "./modules/plans/index.js";
import { createNotificationsModule } from "./modules/notifications/index.js";
import { createApexService } from "./modules/apex/service.js";
import { registerApexRoutes } from "./modules/apex/routes.js";
import { createBillingService } from "./modules/billing/service.js";
import { registerBillingRoutes } from "./modules/billing/routes.js";
import { editTelegramMessage, sendTelegramMessage } from "./core/telegram.js";
import type { Notifications } from "@sever/contracts";
import type { DomainEvent } from "./core/eventBus.js";

export function createModules(bus: EventBus = new EventBus()) {
  const people = createPeopleModule(pool, bus);
  const equipment = createEquipmentModule(pool, bus);
  const projects = createProjectsModule(pool, bus);
  const finance = createFinanceModule(pool, bus);
  const venues = createVenuesModule(pool);
  const plans = createPlansModule(pool);
  const notifications = createNotificationsModule(pool);

  const apex = createApexService({
    equipment: equipment.service,
    projects: projects.service,
    finance: finance.service,
    people: people.service,
  });

  const billing = createBillingService({
    equipment: equipment.service,
    projects: projects.service,
    finance: finance.service,
    people: people.service,
  });

  // ── Notifications: react to domain events, deliver in-app + Telegram ──
  // This is the canonical cross-module reaction, wired here (never inside a
  // module). In-app always; Telegram only when a bot token is configured.
  async function notify(userId: string, n: Omit<Notifications.CreateNotificationInput, "userId">) {
    // Respect the recipient's per-kind preference (defaults to on).
    if (!(await notifications.service.isEnabled(userId, n.kind))) return;
    await notifications.service.create({ userId, ...n });
    const user = await people.service.getById(userId);
    await sendTelegramMessage(user?.telegramId ?? null, `<b>${n.title}</b>\n${n.body}`);
  }

  const publicName = (user: { nickname?: string | null; displayName?: string | null } | null | undefined, fallback = "Человек") =>
    user?.nickname?.trim() || user?.displayName?.trim() || fallback;

  const fmtActor = async (actorId?: string | null) => {
    if (!actorId) return "Система";
    const actor = await people.service.getById(actorId);
    return actor?.isSystem ? "Система" : publicName(actor, "Неизвестно");
  };

  const stageLabel: Record<string, string> = {
    prep: "Подготовка",
    pickup: "Забор",
    delivery: "Доставка",
    mount: "Монтаж",
    show: "Событие",
    dismantle: "Демонтаж",
    return: "Возврат",
  };

  async function advancedMessage(event: DomainEvent): Promise<{ title: string; body: string; link?: string | null } | null> {
    switch (event.type) {
      case "project.assigned": {
        const [project, user] = await Promise.all([projects.service.getProject(event.projectId), people.service.getById(event.userId)]);
        return { title: "Назначение на проект", body: `${publicName(user)} · ${project?.name ?? event.projectId}`, link: `/projects/${event.projectId}` };
      }
      case "project.unassigned": {
        const [project, user] = await Promise.all([projects.service.getProject(event.projectId), people.service.getById(event.userId)]);
        return { title: "Сняли с проекта", body: `${publicName(user)} · ${project?.name ?? event.projectId}`, link: `/projects/${event.projectId}` };
      }
      case "project.invited": {
        const [project, user] = await Promise.all([projects.service.getProject(event.projectId), people.service.getById(event.userId)]);
        return { title: "Приглашение в проект", body: `${publicName(user)} · ${project?.name ?? event.projectId}`, link: `/projects/${event.projectId}` };
      }
      case "project.invite.responded": {
        const [project, user] = await Promise.all([projects.service.getProject(event.projectId), people.service.getById(event.userId)]);
        return { title: event.accepted ? "Приглашение принято" : "Приглашение отклонено", body: `${publicName(user)} · ${project?.name ?? event.projectId}`, link: `/projects/${event.projectId}` };
      }
      case "project.invite.cancelled": {
        const [project, user] = await Promise.all([projects.service.getProject(event.projectId), people.service.getById(event.userId)]);
        return { title: "Приглашение отменено", body: `${publicName(user)} · ${project?.name ?? event.projectId}`, link: `/projects/${event.projectId}` };
      }
      case "project.operation_stage.changed": {
        const project = await projects.service.getProject(event.projectId);
        return {
          title: "Этап проекта",
          body: `${project?.name ?? event.projectId} · ${event.fromStage ? `${stageLabel[event.fromStage]} → ` : ""}${stageLabel[event.toStage]} · ${await fmtActor(event.actorId)}`,
          link: `/operations/projects/${event.projectId}`,
        };
      }
      case "equipment.units.issued": {
        const project = await projects.service.getProject(event.projectId);
        return { title: "Выдача оборудования", body: `${event.count} ед. · ${project?.name ?? event.projectId} · ${await fmtActor(event.actorId)}`, link: `/projects/${event.projectId}` };
      }
      case "equipment.unit.returned": {
        const [project, unit] = await Promise.all([projects.service.getProject(event.projectId), equipment.service.getUnit(event.unitId)]);
        return { title: event.complete ? "Возврат оборудования" : "Возврат с некомплектом", body: `${unit?.assetTag ?? event.unitId} · ${project?.name ?? event.projectId} · ${await fmtActor(event.actorId)}`, link: `/projects/${event.projectId}` };
      }
      case "equipment.return.incomplete": {
        const project = await projects.service.getProject(event.projectId);
        return { title: "Некомплект", body: `${event.missingUnitIds.length} ед. · ${project?.name ?? event.projectId}`, link: `/projects/${event.projectId}` };
      }
      case "equipment.unit.transferred": {
        const [unit, warehouses] = await Promise.all([equipment.service.getUnit(event.unitId), equipment.service.listWarehouses()]);
        const wh = (id: string | null) => warehouses.find((w) => w.id === id)?.name ?? "—";
        return { title: "Перемещение между складами", body: `${unit?.assetTag ?? event.unitId} · ${wh(event.fromWarehouseId)} → ${wh(event.toWarehouseId)} · ${await fmtActor(event.actorId)}`, link: `/warehouse/units/${event.unitId}` };
      }
      case "people.user.created": {
        const user = await people.service.getById(event.userId);
        if (user?.isSystem) return null;
        return { title: "Новый пользователь", body: publicName(user, event.userId), link: "/settings" };
      }
      default:
        return null;
    }
  }

  bus.onAny(async (event) => {
    const msg = await advancedMessage(event);
    if (!msg) return;
    const recipients = await people.service.listWithPermission("notifications.advanced");
    for (const user of recipients) {
      if (!(await notifications.service.isAdvancedEnabled(user.id, event.type as Notifications.AdvancedNotificationEvent))) continue;
      await notifications.service.create({ userId: user.id, kind: "info", title: msg.title, body: msg.body, link: msg.link ?? null });
      await sendTelegramMessage(user.telegramId, `<b>${msg.title}</b>\n${msg.body}`);
    }
  });

  bus.on("project.assigned", async (e) => {
    const project = await projects.service.getProject(e.projectId);
    if (!project) return;
    await notify(e.userId, {
      kind: "assigned",
      title: "Вас назначили на проект",
      body: project.name,
      link: `/projects/${e.projectId}`,
    });
  });

  bus.on("project.unassigned", async (e) => {
    const project = await projects.service.getProject(e.projectId);
    if (!project) return;
    await notify(e.userId, {
      kind: "info",
      title: "Вас сняли с проекта",
      body: project.name,
      link: `/projects/${e.projectId}`,
    });
  });

  // ── Invitations: deliver an accept/decline message to the invited person ──
  const padDatePart = (n: number) => String(n).padStart(2, "0");
  const fmtDateTime = (iso: string) => {
    const d = new Date(iso);
    return `${padDatePart(d.getDate())}/${padDatePart(d.getMonth() + 1)}/${d.getFullYear()} ${padDatePart(d.getHours())}:${padDatePart(d.getMinutes())}`;
  };

  bus.on("project.invited", async (e) => {
    const [project, user, assignment] = await Promise.all([
      projects.service.getProject(e.projectId),
      people.service.getById(e.userId),
      projects.service.getAssignment(e.assignmentId),
    ]);
    if (!project || !assignment) return;
    if (!(await notifications.service.isEnabled(e.userId, "assigned"))) return;
    // In-app record so it shows in their inbox too.
    await notifications.service.create({
      userId: e.userId,
      kind: "assigned",
      title: "Приглашение на проект",
      body: project.name,
      link: `/projects/${e.projectId}`,
    });
    const rate = assignment.rateEUR != null ? `${assignment.rateEUR} €` : "по договорённости";
    const lines = [
      `<b>Приглашение на проект</b>`,
      `«${project.name}»`,
      `🗓 ${fmtDateTime(project.startsAt)} — ${fmtDateTime(project.endsAt)}`,
      `🎚 Роль: ${assignment.roleNote ?? "—"}`,
      `💶 Ставка: ${rate}`,
    ];
    const sent = await sendTelegramMessage(user?.telegramId ?? null, lines.join("\n"), {
      inlineKeyboard: [
        [
          { text: "✅ Принять", callbackData: `inv:accept:${e.assignmentId}` },
          { text: "❌ Отклонить", callbackData: `inv:decline:${e.assignmentId}` },
        ],
      ],
    });
    if (sent) await projects.service.recordAssignmentTelegramMessage(e.assignmentId, sent.chatId, sent.messageId);
  });

  bus.on("project.invite.responded", async (e) => {
    const assignment = await projects.service.getAssignment(e.assignmentId);
    if (!assignment?.invitedByUserId) return;
    const [project, who] = await Promise.all([
      projects.service.getProject(e.projectId),
      people.service.getById(e.userId),
    ]);
    await notify(assignment.invitedByUserId, {
      kind: e.accepted ? "info" : "problem",
      title: e.accepted ? "Приглашение принято" : "Приглашение отклонено",
      body: `${publicName(who)} ${e.accepted ? "принял" : "отклонил"} участие в «${project?.name ?? ""}»`,
      link: `/projects/${e.projectId}`,
    });
  });

  bus.on("project.invite.cancelled", async (e) => {
    const [project, assignment] = await Promise.all([
      projects.service.getProject(e.projectId),
      projects.service.getAssignment(e.assignmentId),
    ]);
    const roleNote = assignment?.roleNote ?? e.roleNote;
    const role = roleNote ? `«${roleNote}»` : "эта роль";
    const body = e.reason === "already_assigned"
      ? `Вы уже участвуете в проекте «${project?.name ?? ""}» в другой роли. Это приглашение отменено.`
      : e.reason === "role_removed"
        ? `Роль ${role} в проекте «${project?.name ?? ""}» удалена. Это приглашение отменено.`
        : `На роль ${role} в проекте «${project?.name ?? ""}» уже найдено нужное количество людей. Это приглашение отменено.`;
    await editTelegramMessage(assignment?.telegramChatId ?? e.telegramChatId ?? null, assignment?.telegramMessageId ?? e.telegramMessageId ?? null, body);
  });

  bus.on("project.operation_stage.changed", async (e) => {
    const [project, assignees, actor] = await Promise.all([
      projects.service.getProject(e.projectId),
      projects.service.listAssignments(e.projectId),
      e.actorId ? people.service.getById(e.actorId) : Promise.resolve(null),
    ]);
    if (!project) return;
    const actorName = actor?.isSystem ? "Система" : publicName(actor, "Система");
    const body = `${e.fromStage ? `${stageLabel[e.fromStage]} → ` : ""}${stageLabel[e.toStage]} · ${actorName}`;
    const recipientIds = [...new Set(
      assignees
        .filter((a) => a.status === "added" || a.status === "accepted")
        .map((a) => a.userId)
        .filter((id) => id !== e.actorId)
    )];
    for (const userId of recipientIds) {
      await notify(userId, {
        kind: "stage",
        title: project.name,
        body,
        link: `/operations/projects/${e.projectId}`,
      });
    }
  });

  bus.on("equipment.units.issued", async (e) => {
    const [project, assignees] = await Promise.all([
      projects.service.getProject(e.projectId),
      projects.service.listAssignments(e.projectId),
    ]);
    if (!project) return;
    for (const a of assignees) {
      if (a.userId === e.actorId) continue; // don't notify the person doing it
      await notify(a.userId, {
        kind: "issued",
        title: "Оборудование выдано",
        body: `${e.count} ед. на проект «${project.name}»`,
        link: `/projects/${e.projectId}`,
      });
    }
  });

  bus.on("equipment.return.incomplete", async (e) => {
    const [project, assignees] = await Promise.all([
      projects.service.getProject(e.projectId),
      projects.service.listAssignments(e.projectId),
    ]);
    if (!project) return;
    for (const a of assignees) {
      await notify(a.userId, {
        kind: "problem",
        title: "Некомплект при возврате",
        body: `${e.missingUnitIds.length} ед. не вернулись с «${project.name}»`,
        link: `/projects/${e.projectId}`,
      });
    }
  });

  // Telegram inline-button taps (invite accept/decline) route through here. The
  // bot stays decoupled — it knows nothing about assignments, just calls this.
  async function handleTelegramCallback(data: string, fromChatId: string): Promise<string | null> {
    const m = data.match(/^inv:(accept|decline):(.+)$/);
    if (!m) return null;
    const accept = m[1] === "accept";
    const assignmentId = m[2]!;
    const assignment = await projects.service.getAssignment(assignmentId);
    if (!assignment) return "Приглашение не найдено.";
    const user = await people.service.getById(assignment.userId);
    if (!user || user.telegramId !== fromChatId) return "Это приглашение адресовано не вам.";
    if (assignment.status === "accepted" || assignment.status === "declined" || assignment.status === "cancelled") {
      if (assignment.status === "accepted") return "✅ Вы уже приняли это приглашение.";
      if (assignment.status === "declined") return "❌ Вы уже отклонили участие.";
      const project = await projects.service.getProject(assignment.projectId);
      const role = assignment.roleNote ? `«${assignment.roleNote}»` : "эту роль";
      return `Приглашение отменено: на ${role} в проекте «${project?.name ?? ""}» уже найден человек.`;
    }
    const updated = await projects.service.respondToInvite(assignmentId, accept, assignment.userId);
    const project = await projects.service.getProject(assignment.projectId);
    if (updated.status === "cancelled") {
      const assignments = await projects.service.listAssignments(assignment.projectId);
      const alreadyInProject = assignments.some((a) => a.userId === assignment.userId && a.id !== assignment.id && (a.status === "added" || a.status === "accepted"));
      if (alreadyInProject) {
        return `Приглашение отменено: вы уже участвуете в проекте «${project?.name ?? ""}» в другой роли.`;
      }
      const role = updated.roleNote ? `«${updated.roleNote}»` : "эту роль";
      return `Приглашение отменено: на ${role} в проекте «${project?.name ?? ""}» уже найден человек.`;
    }
    return accept
      ? `✅ Вы приняли участие в проекте «${project?.name ?? ""}». Детали — в приложении.`
      : `❌ Вы отклонили участие в проекте «${project?.name ?? ""}».`;
  }

  const modules = [people, equipment, projects, finance, venues, plans, notifications];

  return { bus, people, equipment, projects, finance, venues, plans, notifications, apex, billing, modules, handleTelegramCallback };
}

export type Wiring = ReturnType<typeof createModules>;

export function registerAllRoutes(
  app: FastifyInstance,
  wiring: Wiring,
  ctx: RouteContext
): void {
  for (const m of wiring.modules) m.registerRoutes(app, ctx);
  registerApexRoutes(app, ctx, wiring.apex);
  registerBillingRoutes(app, ctx, wiring.billing);
}

/** Used by the migration runner — collects each module's DDL. */
export function collectMigrations(): { name: string; sql: string }[] {
  const { modules } = createModules();
  return modules.map((m) => ({ name: m.name, sql: m.migration }));
}
