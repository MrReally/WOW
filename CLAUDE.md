# SEVER App — contributor & agent guide

Read this before changing code. The whole value of this codebase is that any
module or screen can be rewritten without touching the rest — keep it that way.

## Layout

- `packages/contracts` — the ONLY shared surface between modules and between
  backend/frontend. DTOs, service interfaces, domain events. Change here =
  changing a public contract; treat breaking changes like a real API version.
- `apps/api` — modular monolith. One folder per module under `src/modules/`.
- `apps/web` — `ui-kit` / `features` / `app`.

## Backend rules

- **Schema-per-module.** A module's SQL only touches its own schema. No
  cross-schema JOINs or foreign keys. Reference other modules by opaque ID only.
- **No deep cross-module imports.** A module may import `@sever/contracts` and
  nothing from another module's folder. Wiring happens only in
  `src/registry.ts` (composition root). Enforced by `pnpm boundaries`.
- **Events for side effects across modules** — publish/subscribe on
  `core/eventBus.ts`. Don't reach into another service to cause a side effect.
- **Append-only journal.** Never UPDATE/DELETE `equipment.journal`.
- **FX is frozen.** A transaction stores `fxRateToEUR` + `amountEUR` at creation
  and is never recalculated.
- **Conflicts don't block.** They create a `Problem` (visible in Apex).
- A new module = folder with `migration.ts`, `service.ts`, `routes.ts`,
  `index.ts` (factory returning `SeverModule`), and its types in
  `@sever/contracts`. Register it in `registry.ts`.

## Frontend rules

- **hooks ≠ components.** Data + commands live in `features/<x>/hooks.ts`
  (TanStack Query). Components are presentational and get ready state + callbacks.
- **No business logic in components.**
- **Redesign = tokens + components only.** `ui-kit/tokens.css` and
  `ui-kit/components.css` hold all visual decisions. Don't hardcode colors.
- Russian UI labels map from stable English contract codes in `lib/labels.ts`.
- Platform differences (Telegram vs PWA) live only in `app/platform/`.

## Commands

```bash
pnpm install
bash scripts/dev-setup.sh        # starts Postgres (docker or local), migrates
pnpm api:dev / pnpm web:dev
pnpm -r lint                     # typecheck all
pnpm --filter @sever/api test    # needs DATABASE_URL
pnpm boundaries                  # module boundary check
```

`DATABASE_URL` defaults to `postgres://sever:sever@localhost:5432/sever`.

## Do / don't

- DO add behavior behind the existing contract; DON'T widen a module's public
  surface unless the neighbor genuinely needs it.
- DO keep migrations idempotent (`IF NOT EXISTS`).
- DON'T introduce an ORM client shared across modules — it would couple schemas.
- DON'T add a cross-schema query to "save a round trip"; call the other module's
  service instead.
