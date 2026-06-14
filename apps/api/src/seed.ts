// Idempotent-ish demo seed. Safe to run on an empty DB after migrations.
// Run: `pnpm --filter @sever/api seed`

import { pool } from "./core/db.js";
import { runMigrations } from "./core/migrate.js";
import { createModules } from "./registry.js";

function isoIn(days: number, hour = 10): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function seed() {
  // Reset module schemas so the demo dataset is deterministic. Destructive —
  // intended for dev only.
  await pool.query(
    `DROP SCHEMA IF EXISTS people, equipment, projects, finance CASCADE`
  );
  await runMigrations();
  const { people, equipment, projects, finance } = createModules();

  // Users
  let admin = await people.service.getByTelegramId("dev-admin");
  if (!admin) {
    admin = await people.service.create({ telegramId: "dev-admin", displayName: "Dev Admin", role: "admin" });
  }
  let tech = await people.service.getByTelegramId("tech-001");
  if (!tech) {
    tech = await people.service.create({
      telegramId: "tech-001",
      displayName: "Иван Монтажник",
      role: "tech",
      hourlyRateEUR: 15,
    });
  }

  // Equipment catalog
  const fixtures = await equipment.service.createType({ name: "Световые приборы", trackingMode: "serial" });
  const cables = await equipment.service.createType({ name: "Кабели", trackingMode: "quantity" });

  const movingHead = await equipment.service.createModel({
    typeId: fixtures.id,
    name: "Robe MegaPointe",
    manufacturer: "Robe",
    unitCostEUR: 6000,
    dailyPriceEUR: 120,
  });
  const dmxCable = await equipment.service.createModel({
    typeId: cables.id,
    name: "DMX 5m XLR3",
    unitCostEUR: 12,
    dailyPriceEUR: 1,
    attrs: { cableType: "DMX", lengthM: 5, connectors: "XLR3 male/female" },
  });
  // Cables are counted, not serialized: set an owned total.
  await equipment.service.setModelStockTotal(dmxCable.id, 60);

  const units = [];
  for (let i = 1; i <= 4; i++) {
    units.push(
      await equipment.service.createUnit({
        modelId: movingHead.id,
        assetTag: `MP-${String(i).padStart(3, "0")}`,
        serial: `RB-MP-${1000 + i}`,
      })
    );
  }

  // Client + project
  const client = await projects.service.createClient({ name: "Acme Events", contacts: "+381 60 000 0000" });
  const project = await projects.service.createProject({
    name: "Корпоратив Acme — летняя сцена",
    clientId: client.id,
    startsAt: isoIn(1, 9),
    endsAt: isoIn(2, 23),
  });
  await projects.service.setStatus(project.id, "confirmed");
  await projects.service.addAssignment({ projectId: project.id, userId: tech.id, roleNote: "Свет" });
  await projects.service.createReservation({
    projectId: project.id,
    modelId: movingHead.id,
    qty: 4,
    startsAt: isoIn(1, 9),
    endsAt: isoIn(2, 23),
  });
  // Issue 12 DMX cables to the project (quantity move, no serials).
  await equipment.service.issueQuantity({ projectId: project.id, modelId: dmxCable.id, qty: 12, actorId: tech.id });

  // A second project whose reservation overlaps the same heads → conflict Problem.
  const project2 = await projects.service.createProject({
    name: "Презентация Beta — клуб",
    clientId: client.id,
    startsAt: isoIn(1, 18),
    endsAt: isoIn(2, 4),
  });
  await projects.service.setStatus(project2.id, "confirmed");
  await projects.service.createReservation({
    projectId: project2.id,
    modelId: movingHead.id,
    qty: 2,
    startsAt: isoIn(1, 18),
    endsAt: isoIn(2, 4),
  });

  // Finance: FX + account + billing/prepayment
  await finance.service.setFxRate("RSD", 0.0085);
  await finance.service.setFxRate("USD", 0.92);
  const accounts = await finance.service.listAccounts();
  const account =
    accounts.find((a) => a.name === "Основной EUR") ??
    (await finance.service.createAccount({ name: "Основной EUR", currency: "EUR" }));

  await finance.service.createTransaction({
    accountId: account.id,
    projectId: project.id,
    kind: "income",
    category: "rental_revenue",
    amount: 1920,
    currency: "EUR",
    note: "Аренда света за 2 дня",
  });
  await finance.service.createTransaction({
    accountId: account.id,
    projectId: project.id,
    kind: "income",
    category: "prepayment",
    amount: 1000,
    currency: "EUR",
    note: "Предоплата 50%",
  });
  // Attribute some earned revenue to a unit (payback demo).
  await finance.service.createTransaction({
    accountId: account.id,
    projectId: project.id,
    unitId: units[0]!.id,
    kind: "income",
    category: "rental_revenue",
    amount: 480,
    currency: "EUR",
    note: "Доля MP-001",
  });

  // eslint-disable-next-line no-console
  console.log("[seed] done:", {
    admin: admin.displayName,
    tech: tech.displayName,
    units: units.length,
    project: project.name,
  });
}

seed()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[seed] failed:", err);
    process.exit(1);
  });
