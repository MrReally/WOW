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
import { createApexService } from "./modules/apex/service.js";
import { registerApexRoutes } from "./modules/apex/routes.js";

export function createModules(bus: EventBus = new EventBus()) {
  const people = createPeopleModule(pool, bus);
  const equipment = createEquipmentModule(pool, bus);
  const projects = createProjectsModule(pool, bus);
  const finance = createFinanceModule(pool, bus);
  const venues = createVenuesModule(pool);
  const plans = createPlansModule(pool);

  const apex = createApexService({
    equipment: equipment.service,
    projects: projects.service,
    finance: finance.service,
    people: people.service,
  });

  // Example cross-module reaction: a lost unit could later trigger finance
  // write-offs. Wiring lives here, not inside modules.
  // bus.on("equipment.unit.issued", async (e) => { ... });

  const modules = [people, equipment, projects, finance, venues, plans];

  return { bus, people, equipment, projects, finance, venues, plans, apex, modules };
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
