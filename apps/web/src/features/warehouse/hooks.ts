import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Equipment, Projects, People } from "@sever/contracts";
import { api } from "../../lib/api.ts";

// People directory for resolving actor names in the journal — only fetched when
// the viewer can see people (techs can't, so it stays disabled for them).
export function usePeopleNames(enabled: boolean) {
  return useQuery({ enabled, queryKey: ["people"], queryFn: () => api.get<People.UserDTO[]>("/api/people") });
}

// Data + commands for the warehouse domain. Components stay presentational.

export function useTypes() {
  return useQuery({ queryKey: ["equipment", "types"], queryFn: () => api.get<Equipment.EquipmentTypeDTO[]>("/api/equipment/types") });
}

export function useCableSettings(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["equipment", "cable-settings"],
    queryFn: () => api.get<Equipment.CableSettingsDTO>("/api/equipment/cable-settings"),
  });
}

export function useSetCableSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Equipment.CableSettingsDTO) => api.put<Equipment.CableSettingsDTO>("/api/equipment/cable-settings", input),
    meta: { successMessage: "Настройки кабелей сохранены" },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment", "cable-settings"] }),
  });
}

export function useModels() {
  return useQuery({ queryKey: ["equipment", "models"], queryFn: () => api.get<Equipment.EquipmentModelDTO[]>("/api/equipment/models") });
}

export function useModelStock(modelId: string, enabled = true) {
  return useQuery({
    enabled: enabled && !!modelId,
    queryKey: ["equipment", "stock", modelId],
    queryFn: () => api.get<Equipment.ModelStockDTO>(`/api/equipment/models/${modelId}/stock`),
  });
}

export function useModelStockAtWarehouse(modelId: string, warehouseId: string, enabled = true) {
  return useQuery({
    enabled: enabled && !!modelId && !!warehouseId,
    queryKey: ["equipment", "stock", modelId, warehouseId],
    queryFn: () => api.get<Equipment.ModelStockDTO>(`/api/equipment/models/${modelId}/stock?warehouseId=${warehouseId}`),
  });
}

export function useWarehouses() {
  return useQuery({
    queryKey: ["equipment", "warehouses"],
    queryFn: () => api.get<Equipment.WarehouseDTO[]>("/api/equipment/warehouses"),
  });
}

export function useUnits(filter?: { modelId?: string; status?: Equipment.UnitStatus; projectId?: string; warehouseId?: string }) {
  const qs = new URLSearchParams();
  if (filter?.modelId) qs.set("modelId", filter.modelId);
  if (filter?.status) qs.set("status", filter.status);
  if (filter?.projectId) qs.set("projectId", filter.projectId);
  if (filter?.warehouseId) qs.set("warehouseId", filter.warehouseId);
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

export function useProjectReservations(projectId: string) {
  return useQuery({
    enabled: !!projectId,
    queryKey: ["projects", "reservations", projectId],
    queryFn: () => api.get<Projects.ReservationDTO[]>(`/api/projects/${projectId}/reservations`),
  });
}

function invalidateEquipment(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["equipment"] });
  qc.invalidateQueries({ queryKey: ["bo"] });
  qc.invalidateQueries({ queryKey: ["projects"] });
  qc.invalidateQueries({ queryKey: ["apex"] });
}

export function useCreateType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; trackingMode: Equipment.TrackingMode }) =>
      api.post("/api/equipment/types", input),
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useUpdateType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string } }) =>
      api.patch<Equipment.EquipmentTypeDTO>(`/api/equipment/types/${id}`, input),
    meta: { successMessage: "Тип обновлён" },
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useCreateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; address?: string | null }) => api.post<Equipment.WarehouseDTO>("/api/equipment/warehouses", input),
    meta: { successMessage: "Склад добавлен" },
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useUpdateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; address?: string | null; isDefault?: boolean } }) =>
      api.patch<Equipment.WarehouseDTO>(`/api/equipment/warehouses/${id}`, input),
    meta: { successMessage: "Склад обновлён" },
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

export function useUpdateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Equipment.UpdateModelInput }) =>
      api.patch<Equipment.EquipmentModelDTO>(`/api/equipment/models/${id}`, input),
    meta: { successMessage: "Модель обновлена" },
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useSetModelTrackingMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, trackingMode }: { id: string; trackingMode: Equipment.TrackingMode }) =>
      api.patch<Equipment.EquipmentModelDTO>(`/api/equipment/models/${id}/tracking-mode`, { trackingMode }),
    meta: { successMessage: "Режим учёта изменён" },
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useDeleteModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/equipment/models/${id}`),
    meta: { successMessage: "Модель удалена" },
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { modelId: string; assetTag: string; serial?: string | null; warehouseId?: string | null }) =>
      api.post("/api/equipment/units", input),
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useTransferUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, warehouseId, note }: { id: string; warehouseId: string; note?: string | null }) =>
      api.post<Equipment.EquipmentUnitDTO>(`/api/equipment/units/${id}/transfer`, { warehouseId, note }),
    meta: { successMessage: "Перемещено" },
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useUpdateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { modelId?: string; assetTag?: string; serial?: string | null; notes?: string | null } }) =>
      api.patch<Equipment.EquipmentUnitDTO>(`/api/equipment/units/${id}`, input),
    meta: { successMessage: "Сохранено" },
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
    mutationFn: ({ modelId, total, warehouseId }: { modelId: string; total: number; warehouseId?: string | null }) =>
      api.put<Equipment.ModelStockDTO>(`/api/equipment/models/${modelId}/stock${warehouseId ? `?warehouseId=${warehouseId}` : ""}`, { total }),
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useIssueQty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; modelId: string; warehouseId?: string | null; qty: number; note?: string }) =>
      api.post<Equipment.ModelStockDTO>("/api/equipment/issue-qty", input),
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useReturnQty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; modelId: string; warehouseId?: string | null; qty: number; note?: string }) =>
      api.post<Equipment.ModelStockDTO>("/api/equipment/return-qty", input),
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useTransferQty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { modelId: string; fromWarehouseId: string; toWarehouseId: string; qty: number; note?: string }) =>
      api.post<Equipment.ModelStockDTO>("/api/equipment/transfer-qty", input),
    meta: { successMessage: "Остаток перемещён" },
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useRepairQty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { modelId: string; warehouseId?: string | null; qty: number; note?: string | null; costEUR?: number | null }) =>
      api.post<Equipment.ModelStockDTO>("/api/equipment/repair-qty", input),
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useServiceQty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { modelId: string; warehouseId?: string | null; qty: number; note?: string | null; costEUR?: number | null }) =>
      api.post<Equipment.ModelStockDTO>("/api/equipment/service-qty", input),
    onSuccess: () => invalidateEquipment(qc),
  });
}

// ── Repairs & contractors ──
export function useContractors() {
  return useQuery({ queryKey: ["equipment", "contractors"], queryFn: () => api.get<Equipment.ContractorDTO[]>("/api/equipment/contractors") });
}
export function useOpenRepairs() {
  return useQuery({ queryKey: ["equipment", "repairs", "open"], queryFn: () => api.get<Equipment.RepairDTO[]>("/api/equipment/repairs/open") });
}
export function useOpenHandovers() {
  return useQuery({ queryKey: ["equipment", "handovers", "open"], queryFn: () => api.get<Equipment.HandoverDTO[]>("/api/equipment/handovers/open") });
}
export function useUnitRepairs(unitId: string) {
  return useQuery({ queryKey: ["equipment", "repairs", unitId], queryFn: () => api.get<Equipment.RepairDTO[]>(`/api/equipment/units/${unitId}/repairs`) });
}
export function useUnitHandovers(unitId: string) {
  return useQuery({ queryKey: ["equipment", "handovers", unitId], queryFn: () => api.get<Equipment.HandoverDTO[]>(`/api/equipment/units/${unitId}/handovers`) });
}
export function useCreateContractor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; contacts?: string | null }) => api.post("/api/equipment/contractors", input),
    meta: { successMessage: "Подрядчик добавлен" },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment", "contractors"] }),
  });
}
export function useOpenRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ unitId, input }: { unitId: string; input: { problem: string; vendor?: string | null; estCostEUR?: number | null } }) =>
      api.post(`/api/equipment/units/${unitId}/repair`, input),
    meta: { successMessage: "Отправлено в ремонт" },
    onSuccess: () => invalidateEquipment(qc),
  });
}
export function useCloseRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { costEUR?: number | null; resolution?: string | null; outcome: "repaired" | "written_off" } }) =>
      api.post(`/api/equipment/repairs/${id}/close`, input),
    meta: { successMessage: "Ремонт закрыт" },
    onSuccess: () => invalidateEquipment(qc),
  });
}
export function useSendToContractor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ unitId, input }: { unitId: string; input: { contractorId: string; reason?: string | null; expectedReturn?: string | null; costEUR?: number | null } }) =>
      api.post(`/api/equipment/units/${unitId}/to-contractor`, input),
    meta: { successMessage: "Передано подрядчику" },
    onSuccess: () => invalidateEquipment(qc),
  });
}
export function useReturnFromContractor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string | null }) => api.post(`/api/equipment/handovers/${id}/return`, { note }),
    meta: { successMessage: "Возвращено от подрядчика" },
    onSuccess: () => invalidateEquipment(qc),
  });
}
