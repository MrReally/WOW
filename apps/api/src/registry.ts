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
import { sendTelegramMessage } from "./core/telegram.js";
import type { Notifications } from "@sever/contracts";

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

  // ── Notifications: react to domain events, deliver in-app + Telegram ──
  // This is the canonical cross-module reaction, wired here (never inside a
  // module). In-app always; Telegram only when a bot token is configured.
  async function notify(userId: string, n: Omit<Notifications.CreateNotificationInput, "userId">) {
    await notifications.service.create({ userId, ...n });
    const user = await people.service.getById(userId);
    await sendTelegramMessage(user?.telegramId ?? null, `<b>${n.title}</b>\n${n.body}`);
  }

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

  const modules = [people, equipment, projects, finance, venues, plans, notifications];

  return { bus, people, equipment, projects, finance, venues, plans, notifications, apex, modules };
}

export type Wiring = ReturnType<typeof createModules>;

export function registerAllRoutes(
  app: FastifyInstance,
  wiring: Wiring,
  ctx: RouteContext
): void {
  for (const m of wiring.modules) m.registerRoutes(app, ctx);
  registerApexRoutes(app, ctx, wiring.apex);
}

/** Used by the migration runner — collects each module's DDL. */
export function collectMigrations(): { name: string; sql: string }[] {
  const { modules } = createModules();
  return modules.map((m) => ({ name: m.name, sql: m.migration }));
}
