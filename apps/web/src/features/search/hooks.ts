import { useQuery } from "@tanstack/react-query";
import type { Projects, Venues } from "@sever/contracts";
import { api } from "../../lib/api.ts";

export function useGlobalSearchData(enabled: boolean) {
  const projects = useQuery({
    enabled,
    queryKey: ["projects", "list"],
    queryFn: () => api.get<Projects.ProjectDTO[]>("/api/projects"),
  });
  const clients = useQuery({
    enabled,
    queryKey: ["clients"],
    queryFn: () => api.get<Projects.ClientDTO[]>("/api/clients"),
  });
  const venues = useQuery({
    enabled,
    queryKey: ["venues"],
    queryFn: () => api.get<Venues.VenueDTO[]>("/api/venues"),
  });

  return { projects, clients, venues };
}
