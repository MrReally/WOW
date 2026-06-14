import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApexDashboardDTO } from "@sever/contracts";
import { api } from "../../lib/api.ts";

// All Apex data + commands live here. The page component only renders.

export function useApexDashboard() {
  return useQuery({
    queryKey: ["apex", "dashboard"],
    queryFn: () => api.get<ApexDashboardDTO>("/api/apex/dashboard"),
    refetchInterval: 30_000,
  });
}

export function useResolveProblem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scope }: { id: string; scope: "equipment" | "projects" }) =>
      api.post(
        scope === "equipment"
          ? `/api/equipment/problems/${id}/resolve`
          : `/api/projects-problems/${id}/resolve`
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apex"] }),
  });
}
