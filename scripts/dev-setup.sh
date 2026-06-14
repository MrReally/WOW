#!/usr/bin/env bash
# Idempotent dev/CI bootstrap: ensure Postgres is reachable, deps installed,
# schemas migrated. Safe to run repeatedly. Used by the SessionStart hook and
# locally.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-postgres://sever:sever@localhost:5432/sever}"

echo "[setup] installing dependencies…"
pnpm install --prefer-offline >/dev/null 2>&1 || pnpm install
pnpm rebuild esbuild >/dev/null 2>&1 || true

# Bring up Postgres: prefer Docker, fall back to a local cluster (CI/web envs
# often have postgresql installed but no Docker daemon).
if docker compose version >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "[setup] starting Postgres via docker compose…"
  docker compose up -d db >/dev/null 2>&1 || true
elif command -v pg_ctlcluster >/dev/null 2>&1; then
  echo "[setup] starting local Postgres cluster…"
  pg_ctlcluster 16 main start >/dev/null 2>&1 || true
  su postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='sever'\"" 2>/dev/null | grep -q 1 \
    || su postgres -c "psql -c \"CREATE ROLE sever LOGIN PASSWORD 'sever' CREATEDB;\"" 2>/dev/null || true
  su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='sever'\"" 2>/dev/null | grep -q 1 \
    || su postgres -c "psql -c \"CREATE DATABASE sever OWNER sever;\"" 2>/dev/null || true
fi

# Wait for the DB, then migrate.
for i in $(seq 1 15); do
  if pnpm --filter @sever/api exec node -e "const {Pool}=require('pg');new Pool({connectionString:process.env.DATABASE_URL}).query('select 1').then(()=>process.exit(0)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    echo "[setup] Postgres is up; running migrations…"
    pnpm --filter @sever/api migrate || true
    break
  fi
  echo "[setup] waiting for Postgres ($i)…"
  sleep 2
done

echo "[setup] done."
