import { createHmac, timingSafeEqual } from "node:crypto";
import { Transform } from "node:stream";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { parseSiteWebhookPayload } from "@sever/contracts/site-integration";
import { env } from "../../env.js";
import type { createSiteIntegrationService } from "./service.js";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 300;
type RawRequest = FastifyRequest & { siteWebhookRawBody?: Buffer };

function reject(reply: { code: (status: number) => { send: (body: unknown) => unknown } }, status: number, code: string) {
  return reply.code(status).send({ error: { code, message: "site webhook rejected" } });
}

function exactHeader(request: FastifyRequest, name: string): string | undefined {
  const values: string[] = [];
  for (let index = 0; index < request.raw.rawHeaders.length; index += 2) {
    if (request.raw.rawHeaders[index]?.toLowerCase() === name) values.push(request.raw.rawHeaders[index + 1] ?? "");
  }
  return values.length === 1 ? values[0] : undefined;
}

function validDelivery(value: string | undefined): value is string {
  return !!value && /^[A-Za-z0-9._:-]{1,200}$/.test(value);
}

function validTimestamp(value: string | undefined): value is string {
  return !!value && /^\d{1,12}$/.test(value) && Math.abs(Math.floor(Date.now() / 1000) - Number(value)) <= MAX_CLOCK_SKEW_SECONDS;
}

function validSignature(secret: string, timestamp: string, body: Buffer, received: string | undefined): boolean {
  if (!secret || !received || !/^sha256=[0-9a-f]{64}$/.test(received)) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(timestamp).update(".").update(body).digest("hex")}`);
  const actual = Buffer.from(received);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** A single bounded pass: forward bytes to Fastify while retaining exact bytes for HMAC. */
function boundedRawBody(request: RawRequest, payload: NodeJS.ReadableStream): Transform {
  const chunks: Buffer[] = [];
  let size = 0;
  return new Transform({
    transform(chunk: Buffer | string, _encoding, callback) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_BODY_BYTES) {
        const error = Object.assign(new Error("site webhook body too large"), { statusCode: 413, code: "FST_ERR_CTP_BODY_TOO_LARGE" });
        (payload as NodeJS.ReadableStream & { destroy?: (error?: Error) => void }).destroy?.(error);
        callback(error);
        return;
      }
      chunks.push(bytes);
      callback(null, bytes);
    },
    flush(callback) {
      request.siteWebhookRawBody = Buffer.concat(chunks, size);
      callback();
    },
  });
}

export function registerSiteIntegrationRoutes(app: FastifyInstance, service: ReturnType<typeof createSiteIntegrationService>): void {
  app.post("/api/integrations/site/webhook", {
    bodyLimit: MAX_BODY_BYTES,
    onRequest: (request, reply, done) => {
      const contentLength = exactHeader(request, "content-length");
      if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_BODY_BYTES) {
        reply.code(413).send({ error: { code: "payload_too_large", message: "site webhook rejected" } });
        return;
      }
      done();
    },
    preParsing: (request, _reply, payload, done) => {
      const captured = boundedRawBody(request as RawRequest, payload);
      payload.pipe(captured);
      done(null, captured);
    },
  }, async (request, reply) => {
    const deliveryId = exactHeader(request, "x-sever-delivery");
    const timestamp = exactHeader(request, "x-sever-timestamp");
    const signature = exactHeader(request, "x-sever-signature");
    if (exactHeader(request, "x-sever-event") !== "order.created") return reject(reply, 400, "unsupported_event");
    if (!validDelivery(deliveryId) || !validTimestamp(timestamp)) return reject(reply, 401, "invalid_webhook_headers");
    const rawBody = (request as RawRequest).siteWebhookRawBody;
    if (!rawBody || !validSignature(env.siteWebhook.testSecret, timestamp, rawBody, signature)) return reject(reply, 401, "invalid_webhook_signature");
    let payload;
    try { payload = parseSiteWebhookPayload(request.body); } catch { return reject(reply, 422, "invalid_webhook_payload"); }
    if (payload.source !== "test") return reject(reply, 403, "site_webhook_environment_disabled");
    const result = await service.receiveWebhook({ deliveryId, payload, rawBody });
    if (result.outcome === "conflict") return reject(reply, 409, "duplicate_payload_conflict");
    return reply.code(200).send({ ok: true, duplicate: result.outcome === "duplicate" });
  });
}
