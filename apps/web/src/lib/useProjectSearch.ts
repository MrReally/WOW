import { useMemo, useState } from "react";
import type { Projects, Venues } from "@sever/contracts";
import { configuredDate } from "./dateFormat.ts";

type SearchableProject = Pick<Projects.ProjectDTO, "name" | "clientId" | "venueId" | "startsAt" | "endsAt">;

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
  return [value.slice(0, 10), configuredDate(value), numeric, withoutYear, long];
}

export function filterProjectsBySearch<T extends SearchableProject>(
  projects: readonly T[],
  venues: readonly Venues.VenueDTO[],
  clients: readonly Projects.ClientDTO[],
  query: string,
): T[] {
  const needle = normalize(query);
  if (!needle) return [...projects];

  const venuesById = new Map(venues.map((venue) => [venue.id, venue]));
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  return projects.filter((project) => {
    const venue = project.venueId ? venuesById.get(project.venueId) : undefined;
    const client = clientsById.get(project.clientId);
    const haystack = normalize([
      project.name,
      client?.name,
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
  clients: readonly Projects.ClientDTO[],
) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filteredProjects = useMemo(
    () => filterProjectsBySearch(projects, venues, clients, query),
    [clients, projects, venues, query],
  );

  const toggle = () => {
    if (isOpen) setQuery("");
    setIsOpen(!isOpen);
  };

  return { isOpen, query, setQuery, toggle, filteredProjects };
}
