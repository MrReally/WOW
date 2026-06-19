import type { FastifyInstance } from "fastify";
import type { Projects } from "@sever/contracts";
import type { RouteContext } from "./core/module.js";
import type { Wiring } from "./registry.js";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
};
const ymdNext = (iso: string) => {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
};
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
};
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

function originOf(req: { headers: Record<string, string | string[] | undefined>; protocol: string }) {
  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "http").split(",")[0];
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:4000").split(",")[0];
  return `${proto}://${host}`;
}

function eventBlock(input: { uid: string; summary: string; description: string; allDay?: boolean; startsAt: string; endsAt: string }) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${esc(input.uid)}`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `SUMMARY:${esc(input.summary)}`,
    `DESCRIPTION:${esc(input.description)}`,
  ];
  if (input.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${ymd(input.startsAt)}`);
    lines.push(`DTEND;VALUE=DATE:${ymdNext(input.endsAt)}`);
  } else {
    lines.push(`DTSTART:${stamp(input.startsAt)}`);
    lines.push(`DTEND:${stamp(input.endsAt)}`);
  }
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

async function calendarFor(userId: string, wiring: Wiring): Promise<string> {
  const [projects, clients] = await Promise.all([
    wiring.projects.service.listProjectsForUser(userId),
    wiring.projects.service.listClients(),
  ]);
  const clientName = (project: Projects.ProjectDTO) => clients.find((c) => c.id === project.clientId)?.name ?? "—";
  const events: string[] = [];
  for (const project of projects) {
    events.push(eventBlock({
      uid: `project-${project.id}@sever`,
      summary: `SEVER rental: ${project.name}`,
      description: `Client: ${clientName(project)}`,
      allDay: true,
      startsAt: project.startsAt,
      endsAt: project.endsAt,
    }));
    const timings = await wiring.projects.service.listTimings(project.id, { forUserId: userId });
    for (const t of timings) {
      events.push(eventBlock({
        uid: `timing-${t.id}-${userId}@sever`,
        summary: `SEVER: ${t.title}`,
        description: `${project.name}\\nClient: ${clientName(project)}`,
        startsAt: t.startsAt,
        endsAt: t.endsAt,
      }));
    }
  }
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SEVER App//Calendar Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:SEVER App",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function registerCalendarRoutes(app: FastifyInstance, ctx: RouteContext, wiring: Wiring): void {
  app.get("/api/me/calendar-feed", async (req) => {
    const auth = await ctx.auth(req);
    const token = await wiring.people.service.ensureCalendarToken(auth.userId);
    return { url: `${originOf(req)}/calendar/${token}.ics` };
  });

  app.get<{ Params: { token: string } }>("/calendar/:token.ics", async (req, reply) => {
    const user = await wiring.people.service.getByCalendarToken(req.params.token);
    if (!user) return reply.status(404).send("not found");
    const body = await calendarFor(user.id, wiring);
    return reply
      .header("Content-Type", "text/calendar; charset=utf-8")
      .header("Cache-Control", "no-store")
      .send(body);
  });
}
