import Fastify from "fastify";
import type { Projects } from "@sever/contracts";
import { describe, expect, it } from "vitest";
import { registerCalendarRoutes } from "../src/calendar.js";
import type { RouteContext } from "../src/core/module.js";
import type { Wiring } from "../src/registry.js";

describe("calendar subscriptions", () => {
  it("removes a cancelled project's rental and timing from both feeds", async () => {
    const app = Fastify();
    const project = {
      id: "project-1",
      clientId: "client-1",
      name: "Concert",
      status: "confirmed",
      startsAt: "2026-10-01T10:00:00.000Z",
      endsAt: "2026-10-02T10:00:00.000Z",
    } as Projects.ProjectDTO;
    const wiring = {
      people: { service: {
        getByCalendarToken: async () => ({ id: "user-1" }),
        permissionsForUser: async () => ["projects.timing.viewAll"],
      } },
      projects: { service: {
        listProjects: async () => [project],
        listProjectsForUser: async () => [project],
        listClients: async () => [{ id: "client-1", name: "Client" }],
        listTimings: async () => [{
          id: "timing-1", title: "Soundcheck",
          startsAt: "2026-10-01T11:00:00.000Z",
          endsAt: "2026-10-01T12:00:00.000Z",
        }],
      } },
    } as unknown as Wiring;
    registerCalendarRoutes(app, { auth: async () => { throw new Error("unexpected auth"); } } as RouteContext, wiring);

    try {
      for (const path of ["/calendar/token.ics", "/calendar/all/token.ics"]) {
        const active = await app.inject(path);
        expect(active.statusCode).toBe(200);
        expect(active.body.match(/BEGIN:VEVENT/g)).toHaveLength(2);
        expect(active.body).toContain("UID:project-project-1@sever");
        expect(active.body).toContain("UID:timing-timing-1-user-1@sever");
      }

      project.status = "cancelled";
      for (const path of ["/calendar/token.ics", "/calendar/all/token.ics"]) {
        const cancelled = await app.inject(path);
        expect(cancelled.statusCode).toBe(200);
        expect(cancelled.body).not.toContain("BEGIN:VEVENT");
        expect(cancelled.body).not.toContain("Concert");
      }

      for (const status of ["draft", "confirmed", "in_progress", "awaiting_payment", "completed"] as const) {
        project.status = status;
        for (const path of ["/calendar/token.ics", "/calendar/all/token.ics"]) {
          const restored = await app.inject(path);
          expect(restored.statusCode).toBe(200);
          expect(restored.body.match(/BEGIN:VEVENT/g)).toHaveLength(2);
          expect(restored.body).toContain("UID:project-project-1@sever");
          expect(restored.body).toContain("UID:timing-timing-1-user-1@sever");
        }
      }
    } finally {
      await app.close();
    }
  });
});
