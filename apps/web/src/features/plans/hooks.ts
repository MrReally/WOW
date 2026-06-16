import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Plans, Equipment, Venues } from "@sever/contracts";
import { api } from "../../lib/api.ts";

export function useCurrentPlan(projectId: string) {
  return useQuery({
    queryKey: ["plans", "current", projectId],
    queryFn: () => api.get<Plans.PlanDTO | null>(`/api/projects/${projectId}/plan`),
  });
}
export function usePlanVersions(projectId: string) {
  return useQuery({
    queryKey: ["plans", "versions", projectId],
    queryFn: () => api.get<Plans.PlanSummaryDTO[]>(`/api/projects/${projectId}/plans`),
  });
}
export function useProjectModels() {
  return useQuery({ queryKey: ["equipment", "models"], queryFn: () => api.get<Equipment.EquipmentModelDTO[]>("/api/equipment/models") });
}
export function useProjectUnits(projectId: string) {
  return useQuery({
    queryKey: ["equipment", "units", { projectId }],
    queryFn: () => api.get<Equipment.EquipmentUnitDTO[]>(`/api/equipment/units?projectId=${projectId}`),
  });
}
export function useVenues() {
  return useQuery({ queryKey: ["venues"], queryFn: () => api.get<Venues.VenueDTO[]>("/api/venues") });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  qc.invalidateQueries({ queryKey: ["plans", "current", projectId] });
  qc.invalidateQueries({ queryKey: ["plans", "versions", projectId] });
}

export function useCreatePlan(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; venueId?: string | null }) => api.post<Plans.PlanDTO>("/api/plans", { projectId, ...input }),
    meta: { successMessage: "План создан" },
    onSuccess: () => invalidate(qc, projectId),
  });
}
export function useNewVersion(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => api.post<Plans.PlanDTO>(`/api/plans/${planId}/new-version`),
    meta: { successMessage: "Новая версия" },
    onSuccess: () => invalidate(qc, projectId),
  });
}
export function useSetCurrentPlan(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => api.post(`/api/plans/${planId}/set-current`),
    meta: { successMessage: "Версия сделана текущей" },
    onSuccess: () => invalidate(qc, projectId),
  });
}
export function useAddElement(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Plans.AddElementInput) => api.post<Plans.PlanElementDTO>("/api/plan-elements", input),
    onSuccess: () => invalidate(qc, projectId),
  });
}
export function useUpdateElement(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Plans.UpdateElementInput }) => api.patch(`/api/plan-elements/${id}`, input),
    onSuccess: () => invalidate(qc, projectId),
  });
}
export function useDeleteElement(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/plan-elements/${id}`),
    onSuccess: () => invalidate(qc, projectId),
  });
}
export function useMoveElements(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, items }: { planId: string; items: { id: string; x: number; y: number; rotation?: number }[] }) =>
      api.post(`/api/plans/${planId}/move`, { items }),
    onSuccess: () => invalidate(qc, projectId),
  });
}
export function useCreateVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => api.post<Venues.VenueDTO>("/api/venues", input),
    meta: { successMessage: "Площадка добавлена" },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["venues"] }),
  });
}
