import { useQuery } from "@tanstack/react-query";
import type { People, Permission } from "@sever/contracts";
import { api } from "../lib/api.ts";

interface MeResponse {
  user: People.UserDTO | null;
  permissions: Permission[];
}

// Current authenticated user + permissions. Drives navigation and what's shown.
export function useSession() {
  const query = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<MeResponse>("/api/people/me"),
    retry: false,
  });
  const permissions = query.data?.permissions ?? [];
  return {
    user: query.data?.user ?? null,
    permissions,
    can: (...perms: Permission[]) => perms.some((p) => permissions.includes(p)),
    mustChangePassword: query.data?.user?.mustChangePassword ?? false,
    isLoading: query.isLoading,
    error: query.error,
  };
}
