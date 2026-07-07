import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Projects, People, Equipment, Finance } from "@sever/contracts";
import { api } from "../../lib/api.ts";

export function useProjectInvoice(projectId: string, enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["projects", "invoice", projectId],
    queryFn: () => api.get<Finance.ProjectInvoiceDTO>(`/api/projects/${projectId}/invoice`),
  });
}

// Read-only view of the equipment catalog via its public API, used to pick a
// model when adding a reservation. We call the contract endpoint, not the
// warehouse feature's internals.
export function useEquipmentModels() {
  return useQuery({
    queryKey: ["equipment", "models"],
    queryFn: () => api.get<Equipment.EquipmentModelDTO[]>("/api/equipment/models"),
  });
}

export function useProjects() {
  return useQuery({ queryKey: ["projects", "list"], queryFn: () => api.get<Projects.ProjectDTO[]>("/api/projects") });
}

export function useProject(id: string) {
  return useQuery({ queryKey: ["projects", "one", id], queryFn: () => api.get<Projects.ProjectDTO>(`/api/projects/${id}`) });
}

export function useClients() {
  return useQuery({ queryKey: ["clients"], queryFn: () => api.get<Projects.ClientDTO[]>("/api/clients") });
}

export function usePeople(enabled = true) {
  return useQuery({ enabled, queryKey: ["people"], queryFn: () => api.get<People.UserDTO[]>("/api/people") });
}

export function useReservations(projectId: string) {
  return useQuery({
    queryKey: ["projects", "reservations", projectId],
    queryFn: () => api.get<Projects.ReservationDTO[]>(`/api/projects/${projectId}/reservations`),
  });
}

export function useTimings(projectId: string) {
  return useQuery({
    queryKey: ["projects", "timings", projectId],
    queryFn: () => api.get<Projects.TimingDTO[]>(`/api/projects/${projectId}/timings`),
  });
}

export function useAssignments(projectId: string) {
  return useQuery({
    queryKey: ["projects", "assignments", projectId],
    queryFn: () => api.get<Projects.AssignmentDTO[]>(`/api/projects/${projectId}/assignments`),
  });
}

export function useProjectRoles(projectId: string) {
  return useQuery({
    queryKey: ["projects", "roles", projectId],
    queryFn: () => api.get<Projects.ProjectRoleDTO[]>(`/api/projects/${projectId}/roles`),
  });
}

function invalidateProjects(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["projects"] });
  qc.invalidateQueries({ queryKey: ["apex"] });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Projects.CreateClientInput) => api.post<Projects.ClientDTO>("/api/clients", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Projects.CreateProjectInput) => api.post<Projects.ProjectDTO>("/api/projects", input),
    onSuccess: () => invalidateProjects(qc),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Projects.UpdateProjectInput }) =>
      api.patch<Projects.ProjectDTO>(`/api/projects/${id}`, input),
    onSuccess: () => invalidateProjects(qc),
  });
}

export function useSetProjectStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Projects.ProjectStatus }) =>
      api.patch(`/api/projects/${id}/status`, { status }),
    onSuccess: () => invalidateProjects(qc),
  });
}

export function useCreateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Projects.CreateReservationInput) => api.post("/api/reservations", input),
    onSuccess: () => invalidateProjects(qc),
  });
}

export function useDeleteReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/reservations/${id}`),
    meta: { successMessage: "Бронь удалена" },
    onSuccess: () => invalidateProjects(qc),
  });
}

export function useAddTiming() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; title: string; startsAt: string; endsAt: string; assigneeIds?: string[] }) =>
      api.post("/api/timings", input),
    meta: { successMessage: "Тайминг добавлен" },
    onSuccess: () => invalidateProjects(qc),
  });
}

export function useSetTimingAssignees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ timingId, userIds }: { timingId: string; userIds: string[] }) =>
      api.put(`/api/timings/${timingId}/assignees`, { userIds }),
    onSuccess: () => invalidateProjects(qc),
  });
}

export function useDeleteTiming() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/timings/${id}`),
    meta: { successMessage: "Тайминг удалён" },
    onSuccess: () => invalidateProjects(qc),
  });
}

export function useAddAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; roleId?: string | null; userId: string; roleNote?: string | null; rateEUR?: number | null; invite?: boolean }) =>
      api.post("/api/assignments", input),
    meta: { successMessage: "Готово" },
    onSuccess: () => invalidateProjects(qc),
  });
}

export function useCreateProjectRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: string; input: Omit<Projects.CreateProjectRoleInput, "projectId"> }) =>
      api.post<Projects.ProjectRoleDTO>(`/api/projects/${projectId}/roles`, input),
    meta: { successMessage: "Роль добавлена" },
    onSuccess: () => invalidateProjects(qc),
  });
}

export function useUpdateProjectRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Projects.UpdateProjectRoleInput }) =>
      api.patch<Projects.ProjectRoleDTO>(`/api/project-roles/${id}`, input),
    onSuccess: () => invalidateProjects(qc),
  });
}

export function useDeleteProjectRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/project-roles/${id}`),
    meta: { successMessage: "Роль удалена" },
    onSuccess: () => invalidateProjects(qc),
  });
}

// ── Contractor equipment (subrent) ──
export function useContractorItems(projectId: string) {
  return useQuery({
    queryKey: ["projects", "contractor-items", projectId],
    queryFn: () => api.get<Projects.ContractorItemDTO[]>(`/api/projects/${projectId}/contractor-items`),
  });
}
export function useContractorItemHistory(contractorId: string) {
  return useQuery({
    enabled: !!contractorId,
    queryKey: ["projects", "contractor-items", "history", contractorId],
    queryFn: () => api.get<Projects.ContractorItemDTO[]>(`/api/contractors/${contractorId}/items`),
  });
}
export function useContractors() {
  return useQuery({ queryKey: ["equipment", "contractors"], queryFn: () => api.get<Equipment.ContractorDTO[]>("/api/equipment/contractors") });
}
export function useAddContractorItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Projects.AddContractorItemInput) => api.post<Projects.ContractorItemDTO>("/api/contractor-items", input),
    meta: { successMessage: "Позиция подрядчика добавлена" },
    onSuccess: () => {
      invalidateProjects(qc);
      qc.invalidateQueries({ queryKey: ["projects", "contractor-items"] });
      qc.invalidateQueries({ queryKey: ["projects", "contractor-debts"] });
    },
  });
}
export function useRemoveContractorItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/contractor-items/${id}`),
    onSuccess: () => {
      invalidateProjects(qc);
      qc.invalidateQueries({ queryKey: ["projects", "contractor-items"] });
      qc.invalidateQueries({ queryKey: ["projects", "contractor-debts"] });
    },
  });
}
export function useReturnContractorItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Projects.ContractorItemDTO>(`/api/contractor-items/${id}/return`, {}),
    meta: { successMessage: "Подрядное оборудование возвращено" },
    onSuccess: () => {
      invalidateProjects(qc);
      qc.invalidateQueries({ queryKey: ["projects", "contractor-items"] });
    },
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

export function useRemoveAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/assignments/${id}`),
    meta: { successMessage: "Человек снят с проекта" },
    onSuccess: () => invalidateProjects(qc),
  });
}

export function useProjectPings(projectId: string, enabled = true) {
  return useQuery({
    enabled: enabled && !!projectId,
    queryKey: ["projects", "pings", projectId],
    queryFn: () => api.get<Projects.ProjectPingDTO[]>(`/api/projects/${projectId}/pings`),
  });
}

export function useCreateProjectPing(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; message?: string | null }) => api.post<Projects.ProjectPingDTO>(`/api/projects/${projectId}/pings`, input),
    meta: { successMessage: "Пинг отправлен" },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", "pings", projectId] }),
  });
}

export function useProjectReminders(projectId: string, enabled = true) {
  return useQuery({
    enabled: enabled && !!projectId,
    queryKey: ["projects", "reminders", projectId],
    queryFn: () => api.get<Projects.ProjectReminderDTO[]>(`/api/projects/${projectId}/reminders`),
  });
}

export function useCreateProjectReminder(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Projects.CreateProjectReminderInput, "projectId">) => api.post<Projects.ProjectReminderDTO>(`/api/projects/${projectId}/reminders`, input),
    meta: { successMessage: "Напоминание добавлено" },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", "reminders", projectId] }),
  });
}

export function useDeleteProjectReminder(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/project-reminders/${id}`),
    meta: { successMessage: "Напоминание удалено" },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", "reminders", projectId] }),
  });
}

// In-stock serial units of a model — used to resolve a model-level reservation
// into concrete units at warehouse prep.
export function useInStockUnits(modelId: string) {
  return useQuery({
    enabled: !!modelId,
    queryKey: ["equipment", "units", { modelId, status: "in_stock" }],
    queryFn: () => api.get<Equipment.EquipmentUnitDTO[]>(`/api/equipment/units?modelId=${modelId}&status=in_stock`),
  });
}

export function useOverlappingReservations(reservation: Projects.ReservationDTO | null) {
  return useQuery({
    enabled: !!reservation,
    queryKey: ["projects", "reservations", "overlap", reservation?.modelId, reservation?.startsAt, reservation?.endsAt],
    queryFn: () =>
      api.get<Projects.ReservationDTO[]>(
        `/api/reservations/overlap?modelId=${reservation!.modelId}&startsAt=${encodeURIComponent(reservation!.startsAt)}&endsAt=${encodeURIComponent(reservation!.endsAt)}`
      ),
  });
}

export function useReservationAvailability(modelId: string, startsAt: string, endsAt: string, enabled = true) {
  return useQuery({
    enabled: enabled && !!modelId && !!startsAt && !!endsAt,
    queryKey: ["projects", "reservations", "availability", modelId, startsAt, endsAt],
    queryFn: () =>
      api.get<Projects.ReservationAvailabilityDTO>(
        `/api/reservations/availability?modelId=${modelId}&startsAt=${encodeURIComponent(startsAt)}&endsAt=${encodeURIComponent(endsAt)}`
      ),
  });
}

export function useReservationAvailabilities(reservations: Projects.ReservationDTO[]) {
  const key = reservations.map((r) => `${r.id}:${r.modelId}:${r.startsAt}:${r.endsAt}`).join("|");
  return useQuery({
    enabled: reservations.length > 0,
    queryKey: ["projects", "reservations", "availability-list", key],
    queryFn: async () => {
      const rows = await Promise.all(
        reservations.map(async (r) => [
          r.id,
          await api.get<Projects.ReservationAvailabilityDTO>(
            `/api/reservations/availability?modelId=${r.modelId}&startsAt=${encodeURIComponent(r.startsAt)}&endsAt=${encodeURIComponent(r.endsAt)}`
          ),
        ] as const)
      );
      return Object.fromEntries(rows) as Record<string, Projects.ReservationAvailabilityDTO>;
    },
  });
}

// All units, for mapping resolved unit ids → asset tags in the reservation view.
export function useAllUnits() {
  return useQuery({
    queryKey: ["equipment", "units", {}],
    queryFn: () => api.get<Equipment.EquipmentUnitDTO[]>("/api/equipment/units"),
  });
}

export function useResolveReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, unitIds }: { id: string; unitIds: string[] }) =>
      api.post(`/api/reservations/${id}/resolve`, { unitIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["equipment"] });
    },
  });
}

export function useIssueResolvedUnits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; unitIds: string[] }) => api.post("/api/equipment/issue", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["equipment"] });
      qc.invalidateQueries({ queryKey: ["apex"] });
    },
  });
}
