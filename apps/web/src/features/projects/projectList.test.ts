import type { Projects } from "@sever/contracts";
import { describe, expect, it } from "vitest";
import { splitMobileProjects } from "./projectList.ts";

const project = (id: string, status: Projects.ProjectStatus, completedAt: string | null): Projects.ProjectDTO => ({
  id,
  name: id,
  baseName: id,
  clientId: "client",
  status,
  operationStage: "return",
  warehouseTurnoverCompletedAt: completedAt,
  financeTracked: true,
  dryRental: false,
  venueId: null,
  dressCodeOptionId: null,
  dressCodeLabel: null,
  dressCodeUniform: false,
  note: null,
  startsAt: "2026-01-01T10:00:00.000Z",
  endsAt: "2026-01-01T12:00:00.000Z",
  seriesId: null,
  seriesOccurrenceKey: null,
  seriesTemplateVersion: null,
  createdAt: "2025-12-01T10:00:00.000Z",
});

describe("splitMobileProjects", () => {
  it("sorts completed projects from the latest completion to the earliest", () => {
    const { archived } = splitMobileProjects([
      project("older", "completed", "2026-03-01T10:00:00.000Z"),
      project("newer", "completed", "2026-04-01T10:00:00.000Z"),
    ]);

    expect(archived.map((item) => item.id)).toEqual(["newer", "older"]);
  });
});
