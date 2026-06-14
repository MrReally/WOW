import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Equipment, Projects } from "@sever/contracts";
import { api } from "../../lib/api.ts";

// Data + commands for the warehouse domain. Components stay presentational.

export function useTypes() {
  return useQuery({ queryKey: ["equipment", "types"], queryFn: () => api.get<Equipment.EquipmentTypeDTO[]>("/api/equipment/types") });
}

export function useModels() {
  return useQuery({ queryKey: ["equipment", "models"], queryFn: () => api.get<Equipment.EquipmentModelDTO[]>("/api/equipment/models") });
}

export function useModelStock(modelId: string) {
  return useQuery({
    queryKey: ["equipment", "stock", modelId],
    queryFn: () => api.get<Equipment.ModelStockDTO>(`/api/equipment/models/${modelId}/stock`),
  });
}

export function useUnits(filter?: { modelId?: string; status?: Equipment.UnitStatus; projectId?: string }) {
  const qs = new URLSearchParams();
  if (filter?.modelId) qs.set("modelId", filter.modelId);
  if (filter?.status) qs.set("status", filter.status);
  if (filter?.projectId) qs.set("projectId", filter.projectId);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: ["equipment", "units", filter ?? {}],
    queryFn: () => api.get<Equipment.EquipmentUnitDTO[]>(`/api/equipment/units${suffix}`),
  });
}

export function useUnit(id: string) {
  return useQuery({ queryKey: ["equipment", "unit", id], queryFn: () => api.get<Equipment.EquipmentUnitDTO>(`/api/equipment/units/${id}`) });
}

export function useUnitJournal(id: string) {
  return useQuery({ queryKey: ["equipment", "journal", id], queryFn: () => api.get<Equipment.JournalEntryDTO[]>(`/api/equipment/units/${id}/journal`) });
}

export function useProjectsForOps() {
  return useQuery({ queryKey: ["projects", "all"], queryFn: () => api.get<Projects.ProjectDTO[]>("/api/projects") });
}

function invalidateEquipment(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["equipment"] });
  qc.invalidateQueries({ queryKey: ["apex"] });
}

export function useCreateType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; trackingMode: "serial" | "quantity" }) =>
      api.post("/api/equipment/types", input),
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useCreateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Equipment.CreateModelInput) => api.post("/api/equipment/models", input),
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { modelId: string; assetTag: string; serial?: string | null }) =>
      api.post("/api/equipment/units", input),
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useChangeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: Equipment.UnitStatus; note?: string }) =>
      api.patch(`/api/equipment/units/${id}/status`, { status, note }),
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useIssueUnits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; unitIds: string[]; note?: string }) =>
      api.post("/api/equipment/issue", input),
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useReturnUnits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; returnedUnitIds: string[]; expectedUnitIds: string[]; note?: string }) =>
      api.post<Equipment.ReturnResult>("/api/equipment/return", input),
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useImportCsv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (csv: string) => api.post<Equipment.ImportResult>("/api/equipment/import", { csv }),
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useSetModelStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ modelId, total }: { modelId: string; total: number }) =>
      api.put<Equipment.ModelStockDTO>(`/api/equipment/models/${modelId}/stock`, { total }),
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useIssueQty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; modelId: string; qty: number; note?: string }) =>
      api.post<Equipment.ModelStockDTO>("/api/equipment/issue-qty", input),
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useReturnQty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; modelId: string; qty: number; note?: string }) =>
      api.post<Equipment.ModelStockDTO>("/api/equipment/return-qty", input),
    onSuccess: () => invalidateEquipment(qc),
  });
}
