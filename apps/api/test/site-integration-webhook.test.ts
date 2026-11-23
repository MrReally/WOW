import { createHmac } from "node:crypto";
import { once } from "node:events";
import { connect } from "node:net";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { env } from "../src/env.js";
import { registerSiteIntegrationRoutes } from "../src/modules/siteIntegration/routes.js";

const secret = "r2-test-secret";
env.siteWebhook.testSecret = secret;

function body(id = "r2-order") {
  return JSON.stringify({ id, event: "order.created", createdAt: "2026-11-08T12:00:00Z", source: "test", lang: "ru", items: [{ id: "x", name: { sr: "X", ru: "X", en: "X" }, qty: 1, pricePerDay: 1 }], rental: { start: "2026-11-20", end: "2026-11-22", pickupTime: "10:00", returnTime: "10:00", days: 2, discountPercent: 0 }, totals: { perDay: 1, total: 2, currency: "EUR" }, delivery: { type: "pickup", address: "" }, customer: { name: "I", telegram: "", phone: "+381601234567", instagram: "", other: "", preferred: ["whatsapp"] } });
}

function headers(raw: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return { "content-type": "application/json", "x-sever-event": "order.created", "x-sever-delivery": "r2-delivery", "x-sever-timestamp": timestamp, "x-sever-signature": `sha256=${createHmac("sha256", secret).update(`${timestamp}.`).update(raw).digest("hex")}` };
}

async function socketRequest(app: ReturnType<typeof Fastify>, rawRequest: string): Promise<string> {
  if (!app.server.listening) await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("expected TCP listener");
  const socket = connect(address.port, "127.0.0.1");
  let response = "";
  socket.setEncoding("utf8");
  socket.on("data", chunk => { response += chunk; });
  socket.write(rawRequest);
  socket.end();
  await once(socket, "close");
  return response;
}

async function listeningAddress(app: ReturnType<typeof Fastify>): Promise<{ port: number }> {
  if (!app.server.listening) await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("expected TCP listener");
  return address;
}

function wireHeaders(raw: string, extra: string[] = []) {
  const signed = headers(raw);
  return [
    "POST /api/integrations/site/webhook HTTP/1.1",
    "Host: 127.0.0.1",
    ...Object.entries(signed).map(([name, value]) => `${name}: ${value}`),
    ...extra,
    "Connection: close",
    "",
    "",
  ].join("\r\n");
}

function exactLimitBody(id = "r2-exact-limit") {
  const raw = body(id);
  return raw + " ".repeat(262_144 - Buffer.byteLength(raw));
}

describe("R2 webhook receiver", () => {
  it("uses exact signed bytes and has no write before validation", async () => {
    const service = { receiveWebhook: vi.fn(async () => ({ outcome: "received" as const, inboxId: "id" })) };
    const app = Fastify();
    registerSiteIntegrationRoutes(app, service);
    const raw = body();
    const response = await app.inject({ method: "POST", url: "/api/integrations/site/webhook", headers: headers(raw), payload: raw });
    expect(response.statusCode).toBe(200);
    expect(service.receiveWebhook).toHaveBeenCalledWith(expect.objectContaining({ rawBody: Buffer.from(raw) }));
    await app.close();
  });

  it("rejects oversized and duplicate security headers before writing", async () => {
    const service = { receiveWebhook: vi.fn() };
    const app = Fastify();
    registerSiteIntegrationRoutes(app, service);
    const raw = body();
    expect((await app.inject({ method: "POST", url: "/api/integrations/site/webhook", headers: { ...headers(raw), "content-length": "262145" }, payload: raw })).statusCode).toBe(413);
    expect((await app.inject({ method: "POST", url: "/api/integrations/site/webhook", headers: { ...headers(raw), "x-sever-signature": [headers(raw)["x-sever-signature"], headers(raw)["x-sever-signature"]] }, payload: raw })).statusCode).toBe(401);
    expect(service.receiveWebhook).not.toHaveBeenCalled();
    await app.close();
  });

  it("enforces the bounded reader over real HTTP sockets for Content-Length and chunked bodies", async () => {
    const service = { receiveWebhook: vi.fn(async () => ({ outcome: "received" as const, inboxId: "id" })) };
    const app = Fastify();
    registerSiteIntegrationRoutes(app, service);
    const small = body("socket-content-length");
    expect(await socketRequest(app, wireHeaders(small, [`Content-Length: ${Buffer.byteLength(small)}`]) + small)).toMatch(/^HTTP\/1\.1 200/);
    await app.close();

    const chunked = Fastify();
    registerSiteIntegrationRoutes(chunked, service);
    const exact = exactLimitBody();
    const chunks = [exact.slice(0, 17), exact.slice(17, 2100), exact.slice(2100)];
    const chunkWire = chunks.map(value => `${Buffer.byteLength(value).toString(16)}\r\n${value}\r\n`).join("");
    expect(await socketRequest(chunked, wireHeaders(exact, ["Transfer-Encoding: chunked"]) + chunkWire + "0\r\n\r\n")).toMatch(/^HTTP\/1\.1 200/);
    expect(service.receiveWebhook).toHaveBeenLastCalledWith(expect.objectContaining({ rawBody: Buffer.from(exact) }));
    await chunked.close();
  });

  it("does not let chunking bypass the limit and remains usable after a rejected stream", async () => {
    const service = { receiveWebhook: vi.fn(async () => ({ outcome: "received" as const, inboxId: "id" })) };
    const app = Fastify();
    registerSiteIntegrationRoutes(app, service);
    const raw = exactLimitBody("socket-over-limit") + " ";
    const smallChunks = Array.from({ length: 257 }, (_, index) => raw.slice(index * 1021, (index + 1) * 1021))
      .filter(Boolean)
      .map(value => `${Buffer.byteLength(value).toString(16)}\r\n${value}\r\n`).join("");
    const oversized = await socketRequest(app, wireHeaders(raw, ["Transfer-Encoding: chunked"]) + smallChunks + "0\r\n\r\n");
    expect(oversized === "" || /^HTTP\/1\.1 (413|400)/.test(oversized)).toBe(true);
    expect(service.receiveWebhook).not.toHaveBeenCalled();
    const good = body("socket-after-over-limit");
    expect(await socketRequest(app, wireHeaders(good, [`Content-Length: ${Buffer.byteLength(good)}`]) + good)).toMatch(/^HTTP\/1\.1 200/);
    expect(service.receiveWebhook).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("fails closed for missing secrets and rejects live, repeated, and ambiguous transport headers", async () => {
    const service = { receiveWebhook: vi.fn(async () => ({ outcome: "received" as const, inboxId: "id" })) };
    const app = Fastify();
    registerSiteIntegrationRoutes(app, service);
    const raw = body("socket-security");
    const saved = env.siteWebhook.testSecret;
    env.siteWebhook.testSecret = "";
    expect((await app.inject({ method: "POST", url: "/api/integrations/site/webhook", headers: headers(raw), payload: raw })).statusCode).toBe(401);
    env.siteWebhook.testSecret = saved;
    const live = raw.replace('"source":"test"', '"source":"live"');
    expect((await app.inject({ method: "POST", url: "/api/integrations/site/webhook", headers: headers(live), payload: live })).statusCode).toBe(403);
    const duplicateTimestamp = await socketRequest(app, wireHeaders(raw, ["Transfer-Encoding: chunked", `Content-Length: ${Buffer.byteLength(raw)}`, `X-Sever-Timestamp: ${Math.floor(Date.now() / 1000)}`]) + `${Buffer.byteLength(raw).toString(16)}\r\n${raw}\r\n0\r\n\r\n`);
    expect(duplicateTimestamp === "" || /^HTTP\/1\.1 400/.test(duplicateTimestamp)).toBe(true);
    expect(service.receiveWebhook).not.toHaveBeenCalled();
    await app.close();
  });

  it("TEST-1: survives a real chunked client abort without persisting a partial order", async () => {
    const service = { receiveWebhook: vi.fn(async () => ({ outcome: "received" as const, inboxId: "id" })) };
    const app = Fastify();
    registerSiteIntegrationRoutes(app, service);
    const address = await listeningAddress(app);
    const aborted = body("r2-client-abort");
    const serverSideClose = new Promise<void>(resolve => app.server.once("connection", connection => connection.once("close", resolve)));
    const socket = connect(address.port, "127.0.0.1");
    const errors: Error[] = [];
    const onUnhandled = (reason: unknown) => { errors.push(reason instanceof Error ? reason : new Error(String(reason))); };
    process.on("unhandledRejection", onUnhandled);
    try {
      await once(socket, "connect");
      socket.write(wireHeaders(aborted, ["Transfer-Encoding: chunked"]));
      socket.write(`${Math.floor(Buffer.byteLength(aborted) / 2).toString(16)}\r\n${aborted.slice(0, Math.floor(aborted.length / 2))}`);
      socket.destroy();
      await once(socket, "close");
      await serverSideClose;
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
    expect(errors).toEqual([]);
    expect(service.receiveWebhook).not.toHaveBeenCalled();
    const good = body("r2-after-client-abort");
    expect(await socketRequest(app, wireHeaders(good, [`Content-Length: ${Buffer.byteLength(good)}`]) + good)).toMatch(/^HTTP\/1\.1 200/);
    expect(service.receiveWebhook).toHaveBeenCalledTimes(1);
    await app.close();
  }, 10_000);

  it("TEST-2: rejects an invalid HMAC over actual HTTP without invoking persistence", async () => {
    const service = { receiveWebhook: vi.fn(async () => ({ outcome: "received" as const, inboxId: "id" })) };
    const app = Fastify();
    registerSiteIntegrationRoutes(app, service);
    const raw = body("r2-invalid-hmac");
    const invalid = { ...headers(raw), "x-sever-signature": "sha256=" + "0".repeat(64) };
    const request = [
      "POST /api/integrations/site/webhook HTTP/1.1",
      "Host: 127.0.0.1",
      ...Object.entries(invalid).map(([name, value]) => `${name}: ${value}`),
      `Content-Length: ${Buffer.byteLength(raw)}`,
      "Connection: close",
      "",
      raw,
    ].join("\r\n");
    const rejected = await socketRequest(app, request);
    expect(rejected).toMatch(/^HTTP\/1\.1 401/);
    expect(rejected).not.toContain(raw);
    expect(rejected).not.toContain(secret);
    expect(service.receiveWebhook).not.toHaveBeenCalled();
    const good = body("r2-after-invalid-hmac");
    expect(await socketRequest(app, wireHeaders(good, [`Content-Length: ${Buffer.byteLength(good)}`]) + good)).toMatch(/^HTTP\/1\.1 200/);
    expect(service.receiveWebhook).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
