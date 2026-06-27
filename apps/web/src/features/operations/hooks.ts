import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export function useProjectTasks(projectId: string | null) {
  return useQuery({
    enabled: !!projectId,
    queryKey: ["projects", "tasks", projectId],
    queryFn: () => api.get<Projects.ProjectTaskDTO[]>(`/api/projects/${projectId}/tasks`),
  });
}

export function useProjectChecklist(projectId: string | null) {
  return useQuery({
    enabled: !!projectId,
    queryKey: ["projects", "checklist", projectId],
    queryFn: () => api.get<Projects.ProjectChecklistItemDTO[]>(`/api/projects/${projectId}/checklist`),
  });
}

export function useOperationEvents(projectId: string | null) {
  return useQuery({
    enabled: !!projectId,
    queryKey: ["projects", "operation-events", projectId],
    queryFn: () => api.get<Projects.ProjectOperationEventDTO[]>(`/api/projects/${projectId}/operation-events`),
  });
}

export function useSetOperationStage(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stage: Projects.ProjectChecklistGroup) =>
      api.patch<Projects.ProjectDTO>(`/api/projects/${projectId}/operation-stage`, { stage }),
    meta: { successMessage: "Этап обновлён" },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", "one", projectId] });
      qc.invalidateQueries({ queryKey: ["projects", "mine"] });
      qc.invalidateQueries({ queryKey: ["projects", "operation-events", projectId] });
    },
  });
}

function invalidateOps(qc: ReturnType<typeof useQueryClient>, projectId?: string | null) {
  qc.invalidateQueries({ queryKey: ["projects", "tasks", projectId] });
  qc.invalidateQueries({ queryKey: ["projects", "checklist", projectId] });
  qc.invalidateQueries({ queryKey: ["projects", "mine"] });
}

export function useCreateProjectTask(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Projects.CreateProjectTaskInput, "projectId">) =>
      api.post<Projects.ProjectTaskDTO>(`/api/projects/${projectId}/tasks`, input),
    meta: { successMessage: "Задача добавлена" },
    onSuccess: () => invalidateOps(qc, projectId),
  });
}

export function useUpdateProjectTask(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Projects.UpdateProjectTaskInput }) =>
      api.patch<Projects.ProjectTaskDTO>(`/api/project-tasks/${id}`, input),
    onSuccess: () => invalidateOps(qc, projectId),
  });
}

export function useDeleteProjectTask(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/project-tasks/${id}`),
    meta: { successMessage: "Задача удалена" },
    onSuccess: () => invalidateOps(qc, projectId),
  });
}

export function useCreateChecklistItem(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Projects.CreateProjectChecklistItemInput, "projectId">) =>
      api.post<Projects.ProjectChecklistItemDTO>(`/api/projects/${projectId}/checklist`, input),
    meta: { successMessage: "Пункт добавлен" },
    onSuccess: () => invalidateOps(qc, projectId),
  });
}

export function useUpdateChecklistItem(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Projects.UpdateProjectChecklistItemInput }) =>
      api.patch<Projects.ProjectChecklistItemDTO>(`/api/project-checklist/${id}`, input),
    onSuccess: () => invalidateOps(qc, projectId),
  });
}

export function useDeleteChecklistItem(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/project-checklist/${id}`),
    meta: { successMessage: "Пункт удалён" },
    onSuccess: () => invalidateOps(qc, projectId),
  });
}

export function useOpsModels() {
  return useQuery({ queryKey: ["equipment", "models"], queryFn: () => api.get<Equipment.EquipmentModelDTO[]>("/api/equipment/models") });
}
