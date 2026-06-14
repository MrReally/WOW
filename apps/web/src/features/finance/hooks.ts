import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Finance, Projects } from "@sever/contracts";
import { api } from "../../lib/api.ts";

export function useAccounts() {
  return useQuery({ queryKey: ["finance", "accounts"], queryFn: () => api.get<Finance.AccountDTO[]>("/api/finance/accounts") });
}

export function useFxRates() {
  return useQuery({ queryKey: ["finance", "fx"], queryFn: () => api.get<Finance.FxRateDTO[]>("/api/finance/fx") });
}

export function useTransactions() {
  return useQuery({ queryKey: ["finance", "transactions"], queryFn: () => api.get<Finance.TransactionDTO[]>("/api/finance/transactions") });
}

export function useDebts() {
  return useQuery({ queryKey: ["finance", "debts"], queryFn: () => api.get<Finance.ProjectFinanceDTO[]>("/api/finance/debts") });
}

export function useProjectsForFinance() {
  return useQuery({ queryKey: ["projects", "list"], queryFn: () => api.get<Projects.ProjectDTO[]>("/api/projects") });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["finance"] });
  qc.invalidateQueries({ queryKey: ["apex"] });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; currency: Finance.AccountDTO["currency"] }) =>
      api.post("/api/finance/accounts", input),
    onSuccess: () => invalidate(qc),
  });
}

export function useSetFxRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { currency: Finance.FxRateDTO["currency"]; rateToEUR: number }) =>
      api.put("/api/finance/fx", input),
    onSuccess: () => invalidate(qc),
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Finance.CreateTransactionInput) => api.post("/api/finance/transactions", input),
    onSuccess: () => invalidate(qc),
  });
}
