import crypto from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { AuthContext, Role } from "@sever/contracts";
import { env } from "../env.js";
import { Unauthorized, Forbidden } from "./errors.js";
import type { People } from "@sever/contracts";

// Auth is uniform across all three roles because everyone is already in
// Telegram. Production: verify Telegram WebApp initData (HMAC over the bot
// token). Development: AUTH_DEV_BYPASS accepts an x-dev-user header so the app
// runs in a plain browser.

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

/** Verify Telegram WebApp initData per the documented HMAC scheme. */
export function verifyTelegramInitData(
  initData: string,
  botToken: string
): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const computed = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (computed !== hash) return null;

  const userJson = params.get("user");
  if (!userJson) return null;
  try {
    return JSON.parse(userJson) as TelegramUser;
  } catch {
    return null;
  }
}

export interface AuthDeps {
  people: People.PeopleService;
}

/**
 * Resolve the authenticated user for a request. Returns the AuthContext or
 * throws Unauthorized. Auto-provisions the first user as admin in dev bypass
 * so a fresh install is usable.
 */
export async function resolveAuth(
  req: FastifyRequest,
  deps: AuthDeps
): Promise<AuthContext> {
  let telegramId: string | null = null;
  let displayName = "User";

  if (env.auth.devBypass) {
    telegramId = (req.headers["x-dev-user"] as string) || "dev-admin";
    displayName = telegramId === "dev-admin" ? "Dev Admin" : telegramId;
  } else {
    const initData = (req.headers["x-telegram-init-data"] as string) || "";
    const tgUser = verifyTelegramInitData(initData, env.auth.telegramBotToken);
    if (!tgUser) throw Unauthorized("invalid Telegram initData");
    telegramId = String(tgUser.id);
    displayName =
      [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") ||
      tgUser.username ||
      telegramId;
  }

  let user = await deps.people.getByTelegramId(telegramId);
  if (!user) {
    // First user bootstraps as admin; later users default to tech and must be
    // promoted by an admin.
    const existing = await deps.people.list();
    const role: Role = existing.length === 0 ? "admin" : "tech";
    user = await deps.people.create({ telegramId, displayName, role });
  }
  if (!user.active) throw Forbidden("user is deactivated");

  return {
    userId: user.id,
    telegramId: user.telegramId,
    role: user.role,
    displayName: user.displayName,
  };
}

export function requireRole(ctx: AuthContext, ...roles: Role[]): void {
  if (!roles.includes(ctx.role)) {
    throw Forbidden(`requires role: ${roles.join(" or ")}`);
  }
}
