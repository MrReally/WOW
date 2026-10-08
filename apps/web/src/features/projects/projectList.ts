import type { Projects } from "@sever/contracts";

type ProjectListItem = Pick<Projects.ProjectDTO, "status" | "startsAt">;
type CalendarProject = Pick<Projects.ProjectDTO, "startsAt" | "endsAt">;

const ARCHIVED_STATUSES = new Set<Projects.ProjectStatus>(["completed", "cancelled"]);

const startsAtTime = (project: Pick<Projects.ProjectDTO, "startsAt">) => project.startsAt ? Date.parse(project.startsAt) : Number.POSITIVE_INFINITY;

export function splitMobileProjects<T extends ProjectListItem>(projects: readonly T[]) {
  const active = projects
    .filter((project) => !ARCHIVED_STATUSES.has(project.status))
    .sort((a, b) => startsAtTime(a) - startsAtTime(b));
  const archived = projects
    .filter((project) => ARCHIVED_STATUSES.has(project.status))
    .sort((a, b) => startsAtTime(b) - startsAtTime(a));

  return { active, archived };
}

export const projectDayKey = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function groupProjectsByStartDay<T extends Pick<Projects.ProjectDTO, "startsAt">>(projects: readonly T[]) {
  const groups = new Map<string, T[]>();
  const undated: T[] = [];

  [...projects]
    .sort((a, b) => startsAtTime(a) - startsAtTime(b))
    .forEach((project) => {
      if (!project.startsAt) {
        undated.push(project);
        return;
      }
      const key = projectDayKey(project.startsAt);
      groups.set(key, [...(groups.get(key) ?? []), project]);
    });

  return [
    ...Array.from(groups, ([key, items]) => ({ key, projects: items })),
    ...(undated.length > 0 ? [{ key: "undated", projects: undated }] : []),
  ];
}

export function projectsOnCalendarDay<T extends CalendarProject>(projects: readonly T[], dayKey: string) {
  return projects.filter((project) => {
    if (!project.startsAt) return false;
    const startKey = projectDayKey(project.startsAt);
    const endKey = project.endsAt ? projectDayKey(project.endsAt) : startKey;
    return dayKey >= startKey && dayKey <= endKey;
  });
}

export type PlanningCalendarMonth = {
  key: string;
  label: string;
  days: ({ key: string; day: number; date: Date } | null)[];
};

export function planningCalendarMonths(anchor: Date, count = 6): PlanningCalendarMonth[] {
  return Array.from({ length: count }, (_, offset) => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1, 12);
    const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
    const mondayOffset = (first.getDay() + 6) % 7;
    const days: PlanningCalendarMonth["days"] = Array.from({ length: mondayOffset }, () => null);

    for (let day = 1; day <= lastDay; day += 1) {
      const date = new Date(first.getFullYear(), first.getMonth(), day, 12);
      days.push({ key: projectDayKey(date), day, date });
    }

    return {
      key: `${first.getFullYear()}-${first.getMonth()}`,
      label: new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(first),
      days,
    };
  });
}
