import { useQuery } from "@tanstack/react-query";
import type { Projects, Equipment } from "@sever/contracts";
import { api } from "../../lib/api.ts";

// Field-crew view: the API scopes /api/projects to the caller's assigned
// projects for non-managers, so this is already "my projects".
export function useMyProjects() {
  return useQuery({ queryKey: ["projects", "mine"], queryFn: () => api.get<Projects.ProjectDTO[]>("/api/projects?mine=true") });
}

export function useProjectTimings(projectId: string | null) {
  return useQuery({
    enabled: !!projectId,
    queryKey: ["projects", "timings", projectId],
    queryFn: () => api.get<Projects.TimingDTO[]>(`/api/projects/${projectId}/timings`),
  });
}

export function useOpsModels() {
  return useQuery({ queryKey: ["equipment", "models"], queryFn: () => api.get<Equipment.EquipmentModelDTO[]>("/api/equipment/models") });
}
