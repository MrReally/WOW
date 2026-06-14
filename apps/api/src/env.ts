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
  },
  get isProd() {
    return this.nodeEnv === "production";
  },
};
