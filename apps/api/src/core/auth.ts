import crypto from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { AuthContext, Permission, People } from "@sever/contracts";
import { ALL_PERMISSIONS } from "@sever/contracts";
import { env } from "../env.js";
import { Unauthorized, Forbidden } from "./errors.js";

// Auth resolution order: session token (email/password login) → Telegram
// initData → dev bypass. All map to the same user + permission set.

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 86_400
): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (computed !== hash) return null;
  // Reject stale initData (replay protection). auth_date is unix seconds.
  const authDate = Number(params.get("auth_date"));
  if (Number.isFinite(authDate) && Date.now() / 1000 - authDate > maxAgeSec) return null;
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

function toContext(su: People.SessionUser): AuthContext {
  const permissions = su.permissions;
  const isOwner = ALL_PERMISSIONS.every((p) => permissions.includes(p));
  return {
    userId: su.user.id,
    telegramId: su.user.telegramId,
    email: su.user.email,
    displayName: su.user.displayName,
    roleId: su.user.roleId,
    roleName: su.user.roleName,
    isOwner,
    operationsShowAllProjects: su.user.operationsShowAllProjects,
    permissions,
  };
}

export function bearerToken(req: FastifyRequest): string | null {
  const header = req.headers["authorization"];
  if (typeof header === "string" && header.startsWith("Bearer ")) return header.slice(7);
  return null;
}

export async function resolveAuth(req: FastifyRequest, deps: AuthDeps): Promise<AuthContext> {
  // 1. Session token from email/password (or Telegram) login.
  const token = bearerToken(req);
  if (token) {
    const su = await deps.people.resolveSession(token);
    if (!su) throw Unauthorized("сессия истекла, войдите снова");
    return toContext(su);
  }

  // 2. Telegram Mini App initData.
  const initData = (req.headers["x-telegram-init-data"] as string) || "";
  if (initData && env.auth.telegramBotToken) {
    const tg = verifyTelegramInitData(initData, env.auth.telegramBotToken);
    if (!tg) throw Unauthorized("invalid Telegram initData");
    const name = [tg.first_name, tg.last_name].filter(Boolean).join(" ") || tg.username || String(tg.id);
    const su = await deps.people.resolveTelegramUser(String(tg.id), name, tg.username ?? null);
    if (!su) throw Forbidden("этот Telegram-аккаунт не зарегистрирован — обратитесь к администратору");
    return toContext(su);
  }

  // 3. Dev bypass (local development only).
  if (env.auth.devBypass) {
    const su = await deps.people.devIdentity();
    if (su) return toContext(su);
  }

  throw Unauthorized("требуется вход");
}

export function requirePermission(ctx: AuthContext, ...perms: Permission[]): void {
  if (!perms.some((p) => ctx.permissions.includes(p))) {
    throw Forbidden(`нет прав: ${perms.join(" / ")}`);
  }
}
