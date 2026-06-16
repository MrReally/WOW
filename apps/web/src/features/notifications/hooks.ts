import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notifications } from "@sever/contracts";
import { api } from "../../lib/api.ts";

export function useUnreadCount() {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api.get<{ count: number }>("/api/notifications/unread-count"),
    refetchInterval: 30_000,
  });
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["notifications", "list"],
    queryFn: () => api.get<Notifications.NotificationDTO[]>("/api/notifications"),
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["notifications"] });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/notifications/${id}/read`),
    onSuccess: () => invalidate(qc),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/api/notifications/read-all"),
    onSuccess: () => invalidate(qc),
  });
}
