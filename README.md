# SEVER App

Equipment-centric ERP / operations system for an event production & rental
company. The central entity is the **Equipment Unit** — a physical item with its
own status, location, append-only history, and finances. The system answers, at
any moment: where is every unit, who has it, which project it's on, when it's
free, how much it earned, and whether it has paid for itself.

Built as a **microservice-ready modular monolith**: one deployable today, but
every module is shaped like a future service so any part can be rewritten — or
split out — without touching its neighbors.

---

## Stack

| Layer    | Tech                                                            |
| -------- | --------------------------------------------------------------- |
| Backend  | Node 20+, TypeScript, Fastify, PostgreSQL (`pg`), Zod           |
| Frontend | React 18, TypeScript, Vite, TanStack Query, PWA + Telegram MiniApp |
| Shared   | `@sever/contracts` — DTOs, service interfaces, domain events    |
| Tooling  | pnpm workspaces, Vitest, dependency-cruiser (boundary linting)  |

```
packages/contracts   shared public contracts (the wire types)
apps/api             backend modular monolith
apps/web             frontend (ui-kit / features / app)
```

---

## Quick start

Prerequisites: Node 20+, pnpm 10+, and PostgreSQL (local or Docker).

```bash
pnpm install
cp .env.example .env

# Start Postgres (Docker) — or point DATABASE_URL at any Postgres 16.
pnpm db:up

# Create schemas + demo data
pnpm api:migrate
pnpm api:seed

# Run both apps
pnpm api:dev      # http://localhost:4000
pnpm web:dev      # http://localhost:5173
```

Open http://localhost:5173. In a browser (no Telegram), the API runs with
`AUTH_DEV_BYPASS=true` and you're the **admin** (`dev-admin`). Switch the
simulated user (e.g. `tech-001`) in **Settings → Разработка** to see the
warehouse/tech experience.

### Without Docker

A local Postgres works too — set `DATABASE_URL` and run the migrate/seed steps:

```bash
export DATABASE_URL=postgres://sever:sever@localhost:5432/sever
pnpm api:migrate && pnpm api:seed
```

---

## Architecture rules (non-negotiable)

**Backend — schema-per-module:**

- Each module owns a Postgres schema: `equipment.*`, `projects.*`, `finance.*`,
  `people.*`. **No cross-schema JOINs or foreign keys** — modules reference each
  other only by opaque IDs.
- Each module exposes a typed public contract (service + DTOs + events) in
  `@sever/contracts`. Internals are private; deep cross-module imports are
  blocked by dependency-cruiser in CI (`pnpm boundaries`).
- Modules talk via **domain events** on an in-process bus
  (`apps/api/src/core/eventBus.ts`) — the one seam you swap for NATS/RabbitMQ
  when extracting a service.
- The **composition root** (`apps/api/src/registry.ts`) is the only place that
  knows the whole module graph and wires services together.

**Frontend — three layers:**

```
ui-kit/     design tokens + primitives (Button, Card, Sheet, StatusBadge…)
features/   per-domain modules; hooks (logic+data) SEPARATE from components (view)
app/        shell, routing, platform-adapter (Telegram MiniApp / PWA), theme
```

- No business logic in components — a component gets ready state from a hook and
  sends commands.
- A full redesign touches only `ui-kit/tokens.css`, `ui-kit/components.css`, and
  components — never hooks or backend.
- Each workspace (Apex / Warehouse / Projects / Finance / Settings) is its own
  feature module with its own route.

**Invariants:**

- Equipment history is an **append-only journal** (`equipment.journal`) — never
  overwritten.
- Conflicts (incomplete returns, reservation overlaps) **never block** an
  action — they create a visible **Problem** for the Apex dispatcher.
- Every finance transaction **freezes the FX rate** at creation (`amountEUR` is
  computed once and never recalculated). Base currency is **EUR**.

---

## Modules

| Module      | Schema       | Owns                                                              |
| ----------- | ------------ | ---------------------------------------------------------------- |
| `people`    | `people`     | users, roles (admin/warehouse/tech), rates                       |
| `equipment` | `equipment`  | Type→Model→Unit, statuses, append-only journal, issue/return, problems |
| `projects`  | `projects`   | clients, projects, hourly reservations, timings, assignments     |
| `finance`   | `finance`    | accounts, FX rates, FX-snapshot transactions, per-unit payback, debts |
| `apex`      | —            | read-only dispatcher aggregator over the other modules' contracts |

### Roles

- **Owner/Admin** — everything + Settings (FX rates, amortization, users).
- **Warehouse** — catalog, prep, returns, repairs, import.
- **Tech (монтажник)** — own projects/timings, confirm pickup/return on the
  phone, flag problems. Partial return → «некомплект» Problem.

---

## Development

```bash
pnpm -r lint          # typecheck every package
pnpm --filter @sever/api test    # scenario + contract tests (needs DATABASE_URL)
pnpm boundaries       # enforce module boundaries
pnpm build            # build all
```

The key contract/scenario test (`apps/api/test/scenario.test.ts`) covers the
full Phase-1 flow: warehouse prep → tech pickup → journal → partial return →
некомплект Problem → Apex, plus FX-snapshot immutability.

### Splitting a module into a service (later)

Because the boundaries already exist, extraction is mechanical:

1. Move the module folder + its `@sever/contracts/<module>` into a new service.
2. Move its Postgres schema to its own database (it has no cross-schema FKs).
3. Replace its `eventBus` publish/subscribe with a broker (NATS/RabbitMQ).
4. Replace in-process service calls from neighbors with HTTP/RPC clients that
   implement the same contract interface.

No caller code changes shape — they already depend on the contract, not the
implementation.

---

## Roadmap

- **Phase 0–4 (implemented here):** core data model, warehouse + tech
  pickup/return, projects + hourly reservations + timings + assignments, finance
  with FX snapshots + per-unit payback + debts, people/roles, Apex v1.
- **Phase 5+:** venues + technical plans (layers, Pixi renderer), Lightkey/DMX
  import module, contractors full cycle, communications. These slot in as new
  modules/features without touching the core.
