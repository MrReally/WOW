import { describe, expect, it } from "vitest";
import type { Projects } from "@sever/contracts";
import {
  filterProjectsByStatuses,
  groupProjectsByStartDay,
  planningCalendarMonths,
  projectDayKey,
  projectsOnCalendarDay,
  splitMobileProjects,
} from "../src/features/projects/projectList.ts";

type ListProject = Pick<Projects.ProjectDTO, "id" | "status" | "startsAt">;

const project = (id: string, status: Projects.ProjectStatus, startsAt: string | null): ListProject => ({ id, status, startsAt });

describe("mobile Planning project lists", () => {
  it("sorts active projects from nearest to furthest", () => {
    const result = splitMobileProjects([
      project("later", "confirmed", "2026-09-10T10:00:00.000Z"),
      project("nearest", "in_progress", "2026-08-03T10:00:00.000Z"),
      project("middle", "draft", "2026-08-20T10:00:00.000Z"),
      project("payment", "awaiting_payment", "2026-08-25T10:00:00.000Z"),
      project("undated", "draft", null),
    ]);

    expect(result.active.map(({ id }) => id)).toEqual(["nearest", "middle", "payment", "later", "undated"]);
  });

  it("moves completed and cancelled projects into newest-first archive", () => {
    const result = splitMobileProjects([
      project("old-completed", "completed", "2026-05-01T10:00:00.000Z"),
      project("active", "confirmed", "2026-08-03T10:00:00.000Z"),
      project("new-cancelled", "cancelled", "2026-07-15T10:00:00.000Z"),
    ]);

    expect(result.active.map(({ id }) => id)).toEqual(["active"]);
    expect(result.archived.map(({ id }) => id)).toEqual(["new-cancelled", "old-completed"]);
  });
});

describe("Planning calendar views", () => {
  it("combines selected statuses and treats an empty selection as all projects", () => {
    const projects = [
      project("draft", "draft", null),
      project("confirmed", "confirmed", null),
      project("progress", "in_progress", null),
    ];

    expect(filterProjectsByStatuses(projects, ["confirmed", "in_progress"]).map(({ id }) => id)).toEqual(["confirmed", "progress"]);
    expect(filterProjectsByStatuses(projects, []).map(({ id }) => id)).toEqual(["draft", "confirmed", "progress"]);
  });

  it("groups the agenda by start day and keeps undated projects last", () => {
    const result = groupProjectsByStartDay([
      project("undated", "draft", null),
      project("second", "confirmed", "2026-10-09T14:00:00.000Z"),
      project("first", "confirmed", "2026-10-09T08:00:00.000Z"),
      project("next-day", "draft", "2026-10-10T08:00:00.000Z"),
    ]);

    expect(result.map((group) => group.key)).toEqual([
      projectDayKey("2026-10-09T08:00:00.000Z"),
      projectDayKey("2026-10-10T08:00:00.000Z"),
      "undated",
    ]);
    expect(result[0]?.projects.map(({ id }) => id)).toEqual(["first", "second"]);
  });

  it("shows a multi-day event on each covered calendar day", () => {
    const multiDay = { startsAt: "2026-10-09T08:00:00.000Z", endsAt: "2026-10-11T18:00:00.000Z" };
    expect(projectsOnCalendarDay([multiDay], projectDayKey("2026-10-10T12:00:00.000Z"))).toEqual([multiDay]);
    expect(projectsOnCalendarDay([multiDay], projectDayKey("2026-10-12T12:00:00.000Z"))).toEqual([]);
  });

  it("sorts selected-day events chronologically", () => {
    const later = { startsAt: "2026-10-09T18:00:00.000Z", endsAt: null };
    const earlier = { startsAt: "2026-10-09T08:00:00.000Z", endsAt: null };
    expect(projectsOnCalendarDay([later, earlier], projectDayKey(earlier.startsAt))).toEqual([earlier, later]);
  });

  it("builds Monday-first month grids", () => {
    const [october] = planningCalendarMonths(new Date(2026, 9, 8), 1);
    expect(october?.days.slice(0, 3)).toEqual([null, null, null]);
    expect(october?.days[3]?.day).toBe(1);
    expect(october?.days.at(-1)?.day).toBe(31);
  });
});
