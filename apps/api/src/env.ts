// Centralized environment access. Reads from process.env once at startup.

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://sever:sever@localhost:5432/sever",
  auth: {
    devBypass: bool(process.env.AUTH_DEV_BYPASS, true),
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    systemOwnerEmail: process.env.SYSTEM_OWNER_EMAIL ?? "",
    systemOwnerPassword: process.env.SYSTEM_OWNER_PASSWORD ?? "",
  },
  /** Optional explicit path to the built web bundle (apps/web/dist). */
  webDist: process.env.WEB_DIST ?? "",
  /** On boot, load demo data if the database is empty (first container run). */
  seedOnStart: bool(process.env.SEED_ON_START, false),
  /** Destructive database reset is disabled in production unless explicitly enabled. */
  allowDataReset: bool(process.env.ALLOW_DATA_RESET, false),
  /** Restore is separately gated because it replaces every schema and row. */
  allowDataRestore: bool(process.env.ALLOW_DATA_RESTORE, false),
  /** Persistent directory for automatic pre-restore safety backups. */
  backupDir: process.env.BACKUP_DIR ?? (process.env.NODE_ENV === "production" ? "/var/lib/sever/backups" : "backups"),
  get isProd() {
    return this.nodeEnv === "production";
  },
};
