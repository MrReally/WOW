# Production readiness

This checklist keeps the live app safe before real warehouse and project data is entered.

## Required environment

- `NODE_ENV=production`
- `DATABASE_URL` points to the live Postgres database.
- `AUTH_DEV_BYPASS=false`
- `TELEGRAM_BOT_TOKEN` is set for Telegram Mini App auth.
- `SEED_ON_START=false` for the live database.
- `ALLOW_DATA_RESET=false` unless you are intentionally wiping a non-live database.
- `WEB_DIST` points to the built web bundle if the API serves static files.

## Routing

The app is a single-page application served from the same origin as the API.

- `/apex`, `/warehouse`, `/projects`, `/contractors`, `/finance`, and `/me` must return `index.html`.
- `/api/*` must remain API JSON routes.
- `/health` must remain the health endpoint.
- `/calendar/*.ics` must remain calendar feed routes.
- Static assets under the web bundle must be served directly.

If a reverse proxy serves static files itself, configure fallback to `index.html` only for SPA paths. If the API serves the web bundle, proxy all app requests to the API.

## Smoke check

Run this after each deploy:

```bash
pnpm smoke:prod
```

Or against any host:

```bash
pnpm smoke -- https://your-host.example
```

The smoke check verifies `/health`, SPA fallback routes, API JSON 404 behavior, `/api/people/me`, and a bad calendar token.

## Backup policy

- Create a daily Postgres backup with retention appropriate for live operations.
- Create a manual backup before every large Warehouse CSV import.
- Test restore at least once on a separate test database before treating the live database as safe for real filling.

Example manual backup:

```bash
pg_dump "$DATABASE_URL" > "sever-backup-$(date +%Y-%m-%d-%H%M).sql"
```

Project command (custom-format backup plus immediate integrity check):

```bash
pnpm db:backup
```

Backups are written to the ignored `backups/` directory. Copy them to encrypted off-machine storage according to the deployment retention policy.

Example restore rehearsal:

```bash
createdb sever_restore_test
psql sever_restore_test < sever-backup.sql
```
