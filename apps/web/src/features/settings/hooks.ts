import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { People, Finance } from "@sever/contracts";
import { api } from "../../lib/api.ts";

export function usePeople() {
  return useQuery({ queryKey: ["people"], queryFn: () => api.get<People.UserDTO[]>("/api/people") });
}

export function useFxRates() {
  return useQuery({ queryKey: ["finance", "fx"], queryFn: () => api.get<Finance.FxRateDTO[]>("/api/finance/fx") });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: People.CreateUserInput) => api.post("/api/people", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["people"] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: People.UpdateUserInput }) =>
      api.patch(`/api/people/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["people"] }),
  });
}

export function useSetFxRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { currency: Finance.FxRateDTO["currency"]; rateToEUR: number }) =>
      api.put("/api/finance/fx", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
  });
}
