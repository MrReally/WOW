import type { Projects } from "@sever/contracts";

type ProjectListItem = Pick<Projects.ProjectDTO, "status" | "startsAt">;

const ARCHIVED_STATUSES = new Set<Projects.ProjectStatus>(["completed", "cancelled"]);

const startsAtTime = (project: ProjectListItem) => project.startsAt ? Date.parse(project.startsAt) : Number.POSITIVE_INFINITY;

export function splitMobileProjects<T extends ProjectListItem>(projects: readonly T[]) {
  const active = projects
    .filter((project) => !ARCHIVED_STATUSES.has(project.status))
    .sort((a, b) => startsAtTime(a) - startsAtTime(b));
  const archived = projects
    .filter((project) => ARCHIVED_STATUSES.has(project.status))
    .sort((a, b) => startsAtTime(b) - startsAtTime(a));

  return { active, archived };
}
