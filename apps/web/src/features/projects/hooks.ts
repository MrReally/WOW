import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Projects, People, Equipment } from "@sever/contracts";
import { api } from "../../lib/api.ts";

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

export function usePeople() {
  return useQuery({ queryKey: ["people"], queryFn: () => api.get<People.UserDTO[]>("/api/people") });
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

export function useAddTiming() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; title: string; startsAt: string; endsAt: string }) =>
      api.post("/api/timings", input),
    onSuccess: () => invalidateProjects(qc),
  });
}

export function useAddAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; userId: string; roleNote?: string | null }) =>
      api.post("/api/assignments", input),
    onSuccess: () => invalidateProjects(qc),
  });
}
