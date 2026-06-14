import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import type { AuthContext } from "@sever/contracts";
import { AppError } from "./core/errors.js";
import { resolveAuth } from "./core/auth.js";
import { createModules, registerAllRoutes, type Wiring } from "./registry.js";
import { env } from "./env.js";

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

  registerAllRoutes(app, wiring, ctx);

  // Uniform error envelope.
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: { code: "validation_error", message: "invalid request", details: err.flatten() },
      });
    }
    if (err instanceof AppError) {
      return reply.status(err.status).send({
        error: { code: err.code, message: err.message, details: err.details },
      });
    }
    app.log.error(err);
    return reply.status(500).send({ error: { code: "internal", message: "internal error" } });
  });

  return { app, wiring };
}
