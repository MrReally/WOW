import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import type { AuthContext } from "@sever/contracts";
import { AppError } from "./core/errors.js";
import { resolveAuth } from "./core/auth.js";
import { createModules, registerAllRoutes, type Wiring } from "./registry.js";
import { registerAdminRoutes } from "./admin.js";
import { registerCalendarRoutes } from "./calendar.js";
import { getBotUsername } from "./core/telegramBot.js";
import { env } from "./env.js";

// Where the built web bundle lives (apps/web/dist). Works from src (tsx) and
// dist (compiled), and honors WEB_DIST override for Docker.
function resolveWebDist(): string | null {
  if (env.webDist && existsSync(env.webDist)) return env.webDist;
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(here, "../../web/dist"),
    join(here, "../../../web/dist"),
    join(here, "../web/dist"),
  ]) {
    if (existsSync(join(candidate, "index.html"))) return candidate;
  }
  return null;
}

export interface BuiltApp {
  app: FastifyInstance;
  wiring: Wiring;
}

export async function buildApp(): Promise<BuiltApp> {
  const app = Fastify({
    logger: env.isProd
      ? true
      : { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } } },
  });
  await app.register(cors, { origin: true });

  // Uniform error envelope. Set before routes so it covers every handler.
  app.setErrorHandler((err, _req, reply) => {
    const anyErr = err as { name?: string; issues?: { path?: (string | number)[]; message?: string }[] };
    if (anyErr?.name === "ZodError" || Array.isArray(anyErr?.issues)) {
      const first = anyErr.issues?.[0];
      const field = first?.path?.join(".");
      const message = first ? `${field ? field + ": " : ""}${first.message}` : "проверьте введённые данные";
      return reply.status(400).send({ error: { code: "validation_error", message } });
    }
    if (err instanceof AppError) {
      return reply.status(err.status).send({
        error: { code: err.code, message: err.message, details: err.details },
      });
    }
    app.log.error(err);
    return reply.status(500).send({ error: { code: "internal", message: "internal error" } });
  });

  const wiring = createModules();

  // Single auth resolver shared by every route. Memoized per request so the
  // user lookup happens once even when handlers call ctx.auth() repeatedly.
  const ctx = {
    auth: async (req: import("fastify").FastifyRequest): Promise<AuthContext> => {
      const cached = (req as { _auth?: AuthContext })._auth;
      if (cached) return cached;
      const resolved = await resolveAuth(req, { people: wiring.people.service });
      (req as { _auth?: AuthContext })._auth = resolved;
      return resolved;
    },
  };

  app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  // Telegram bot username (for building deep-links in the UI). Cached.
  app.get("/api/telegram/bot-info", async (req) => {
    await ctx.auth(req);
    return { username: await getBotUsername() };
  });

  registerAllRoutes(app, wiring, ctx);
  registerAdminRoutes(app, ctx, wiring);
  registerCalendarRoutes(app, ctx, wiring);

  // Serve the built web bundle from the same origin (single URL, no CORS, no
  // "ran only the frontend" failure mode). Optional: only if a build exists.
  const webDist = resolveWebDist();
  if (webDist) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    // SPA fallback: any non-/api, non-/health GET returns index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api") && !req.url.startsWith("/health")) {
        return reply.sendFile("index.html");
      }
      return reply.status(404).send({ error: { code: "not_found", message: "not found" } });
    });
    app.log.info(`[web] serving bundle from ${webDist}`);
  } else {
    app.log.info("[web] no built bundle found — API only (run the web dev server separately)");
  }

  return { app, wiring };
}
