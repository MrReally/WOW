import { useQuery } from "@tanstack/react-query";
import type { People } from "@sever/contracts";
import { api } from "../lib/api.ts";

// Current authenticated user. Drives role-based navigation/visibility.
export function useSession() {
  const query = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<People.UserDTO>("/api/people/me"),
  });
  return {
    user: query.data ?? null,
    role: query.data?.role ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
