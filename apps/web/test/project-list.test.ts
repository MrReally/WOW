import { describe, expect, it } from "vitest";
import type { Projects } from "@sever/contracts";
import { splitMobileProjects } from "../src/features/projects/projectList.ts";

type ListProject = Pick<Projects.ProjectDTO, "id" | "status" | "startsAt">;

const project = (id: string, status: Projects.ProjectStatus, startsAt: string): ListProject => ({ id, status, startsAt });

describe("mobile Planning project lists", () => {
  it("sorts active projects from nearest to furthest", () => {
    const result = splitMobileProjects([
      project("later", "confirmed", "2026-09-10T10:00:00.000Z"),
      project("nearest", "in_progress", "2026-08-03T10:00:00.000Z"),
      project("middle", "draft", "2026-08-20T10:00:00.000Z"),
      project("payment", "awaiting_payment", "2026-08-25T10:00:00.000Z"),
    ]);

    expect(result.active.map(({ id }) => id)).toEqual(["nearest", "middle", "payment", "later"]);
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
