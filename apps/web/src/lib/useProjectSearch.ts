import { useMemo, useState } from "react";
import type { Projects, Venues } from "@sever/contracts";

type SearchableProject = Pick<Projects.ProjectDTO, "name" | "venueId" | "startsAt" | "endsAt">;

function normalize(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();
}

function dateSearchValues(value: string | null): string[] {
  if (!value) return [];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return [value];

  const numeric = date.toLocaleDateString("ru-RU");
  const withoutYear = date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  const long = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  return [value.slice(0, 10), numeric, withoutYear, long];
}

export function filterProjectsBySearch<T extends SearchableProject>(
  projects: readonly T[],
  venues: readonly Venues.VenueDTO[],
  query: string,
): T[] {
  const needle = normalize(query);
  if (!needle) return [...projects];

  const venuesById = new Map(venues.map((venue) => [venue.id, venue]));
  return projects.filter((project) => {
    const venue = project.venueId ? venuesById.get(project.venueId) : undefined;
    const haystack = normalize([
      project.name,
      venue?.name,
      venue?.address,
      ...dateSearchValues(project.startsAt),
      ...dateSearchValues(project.endsAt),
    ].filter(Boolean).join(" "));
    return haystack.includes(needle);
  });
}

export function useProjectSearch<T extends SearchableProject>(
  projects: readonly T[],
  venues: readonly Venues.VenueDTO[],
) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filteredProjects = useMemo(
    () => filterProjectsBySearch(projects, venues, query),
    [projects, venues, query],
  );

  const toggle = () => {
    if (isOpen) setQuery("");
    setIsOpen(!isOpen);
  };

  return { isOpen, query, setQuery, toggle, filteredProjects };
}
