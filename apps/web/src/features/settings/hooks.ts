import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { People, Finance } from "@sever/contracts";
import { api } from "../../lib/api.ts";

export function usePeople() {
  return useQuery({ queryKey: ["people"], queryFn: () => api.get<People.UserDTO[]>("/api/people") });
}
export function useRoles() {
  return useQuery({ queryKey: ["roles"], queryFn: () => api.get<People.RoleDTO[]>("/api/roles") });
}
export function useBotInfo() {
  return useQuery({ queryKey: ["telegram", "bot-info"], queryFn: () => api.get<{ username: string | null }>("/api/telegram/bot-info") });
}
export function useCalendarFeed() {
  return useQuery({ queryKey: ["me", "calendar-feed"], queryFn: () => api.get<People.CalendarFeedDTO>("/api/me/calendar-feed") });
}
export function useSetMyPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: People.UpdateMyPreferencesInput) =>
      api.patch<{ user: People.UserDTO | null; permissions: string[]; isOwner: boolean }>("/api/people/me/preferences", input),
    meta: { successMessage: "Настройки сохранены" },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["projects", "mine"] });
    },
  });
}
export function useFxRates() {
  return useQuery({ queryKey: ["finance", "fx"], queryFn: () => api.get<Finance.FxRateDTO[]>("/api/finance/fx") });
}
export function useResetStatus(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["admin", "reset-status"],
    queryFn: () => api.get<{ available: boolean; reason: string | null }>("/api/admin/reset-status"),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: People.CreateUserInput) => api.post<People.CreatedUserDTO>("/api/people", input),
    meta: { successMessage: "Пользователь создан" },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["people"] }),
  });
}
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: People.UpdateUserInput }) => api.patch(`/api/people/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["people"] }),
  });
}
export function useResetPassword() {
  return useMutation({
    mutationFn: (id: string) => api.post<{ temporaryPassword: string }>(`/api/people/${id}/reset-password`, {}),
    meta: { successMessage: "Пароль сброшен" },
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: People.CreateRoleInput) => api.post<People.RoleDTO>("/api/roles", input),
    meta: { successMessage: "Роль создана" },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}
export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: People.UpdateRoleInput }) => api.patch(`/api/roles/${id}`, input),
    meta: { successMessage: "Роль сохранена" },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}
export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/roles/${id}`),
    meta: { successMessage: "Роль удалена" },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}

export function useSetFxRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { currency: Finance.FxRateDTO["currency"]; rateToEUR: number }) => api.put("/api/finance/fx", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
  });
}
export function useResetData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: "demo" | "empty") => api.post("/api/admin/reset", { mode }),
    meta: { successMessage: "База пересоздана" },
    onSuccess: () => qc.invalidateQueries(),
  });
}
