import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Equipment, Projects } from "@sever/contracts";
import { api } from "../../lib/api.ts";

export function useContractors() {
  return useQuery({
    queryKey: ["equipment", "contractors"],
    queryFn: () => api.get<Equipment.ContractorDTO[]>("/api/equipment/contractors"),
  });
}

export function useCreateContractor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; contacts?: string | null }) => api.post<Equipment.ContractorDTO>("/api/equipment/contractors", input),
    meta: { successMessage: "Подрядчик добавлен" },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment", "contractors"] }),
  });
}

export function useUpdateContractor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; contacts?: string | null } }) =>
      api.patch<Equipment.ContractorDTO>(`/api/equipment/contractors/${id}`, input),
    meta: { successMessage: "Подрядчик обновлён" },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment", "contractors"] }),
  });
}

export function useContractorHistory(contractorId: string) {
  return useQuery({
    enabled: !!contractorId,
    queryKey: ["projects", "contractor-items", "history", contractorId],
    queryFn: () => api.get<Projects.ContractorItemDTO[]>(`/api/contractors/${contractorId}/items`),
  });
}

export function useOpenContractorItems() {
  return useQuery({
    queryKey: ["projects", "contractor-items", "open"],
    queryFn: () => api.get<Projects.ContractorItemDTO[]>("/api/contractor-items/open"),
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects", "list"],
    queryFn: () => api.get<Projects.ProjectDTO[]>("/api/projects"),
  });
}

export function useReturnContractorItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Projects.ContractorItemDTO>(`/api/contractor-items/${id}/return`, {}),
    meta: { successMessage: "Отмечено как возвращённое" },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", "contractor-items"] });
      qc.invalidateQueries({ queryKey: ["projects", "contractor-debts"] });
      qc.invalidateQueries({ queryKey: ["apex"] });
    },
  });
}
