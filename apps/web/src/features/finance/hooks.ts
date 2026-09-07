import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Finance, Projects, People, Equipment } from "@sever/contracts";
import { api } from "../../lib/api.ts";

export function useContractorDebts() {
  return useQuery({ queryKey: ["projects", "contractor-debts"], queryFn: () => api.get<Projects.ContractorDebtDTO[]>("/api/contractor-debts") });
}
export function useContractorsList() {
  return useQuery({ queryKey: ["equipment", "contractors"], queryFn: () => api.get<Equipment.ContractorDTO[]>("/api/equipment/contractors") });
}

export function useAccounts(enabled = true) {
  return useQuery({ enabled, queryKey: ["finance", "accounts"], queryFn: () => api.get<Finance.AccountDTO[]>("/api/finance/accounts") });
}

// People directory for resolving transaction authors — only when allowed.
export function usePeopleNames(enabled: boolean) {
  return useQuery({ enabled, queryKey: ["people"], queryFn: () => api.get<People.UserDTO[]>("/api/people") });
}

export function useFxRates() {
  return useQuery({ queryKey: ["finance", "fx"], queryFn: () => api.get<Finance.FxRateDTO[]>("/api/finance/fx") });
}

export function useInvoiceCompanySettings() {
  return useQuery({
    queryKey: ["finance", "invoice-company"],
    queryFn: () => api.get<Finance.InvoiceCompanySettingsDTO>("/api/finance/invoice-company"),
  });
}

export function useSetInvoiceCompanySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Finance.InvoiceCompanySettingsDTO) => api.put<Finance.InvoiceCompanySettingsDTO>("/api/finance/invoice-company", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "invoice-company"] }),
  });
}

export function useInvoiceVersions(projectId: string, enabled = true) {
  return useQuery({
    enabled: enabled && !!projectId,
    queryKey: ["projects", "invoice-versions", projectId],
    queryFn: () => api.get<Finance.InvoiceVersionDTO[]>(`/api/projects/${projectId}/invoice/versions`),
  });
}

export function useProjectEstimateLines(projectId: string, enabled = true) {
  return useQuery({
    enabled: enabled && !!projectId,
    queryKey: ["projects", "estimate-lines", projectId],
    queryFn: () => api.get<Finance.ProjectEstimateLineDTO[]>(`/api/projects/${projectId}/estimate-lines`),
  });
}

export function useProjectEstimateSettings(projectId: string, enabled = true) {
  return useQuery({
    enabled: enabled && !!projectId,
    queryKey: ["projects", "estimate-settings", projectId],
    queryFn: () => api.get<Finance.ProjectEstimateSettingsDTO>(`/api/projects/${projectId}/estimate-settings`),
  });
}

export function useSetProjectEstimateSettings(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Finance.SaveProjectEstimateSettingsInput) =>
      api.put<Finance.ProjectEstimateSettingsDTO>(`/api/projects/${projectId}/estimate-settings`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", "estimate-settings", projectId] });
      qc.invalidateQueries({ queryKey: ["projects", "invoice", projectId] });
      qc.invalidateQueries({ queryKey: ["finance"] });
      qc.invalidateQueries({ queryKey: ["apex"] });
    },
  });
}

export function useReplaceProjectEstimateLines(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lines: Finance.SaveProjectEstimateLineInput[]) =>
      api.put<Finance.ProjectEstimateLineDTO[]>(`/api/projects/${projectId}/estimate-lines`, { lines }),
    meta: { successMessage: "Экономика проекта сохранена" },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", "estimate-lines", projectId] });
      qc.invalidateQueries({ queryKey: ["projects", "invoice", projectId] });
      qc.invalidateQueries({ queryKey: ["finance"] });
      qc.invalidateQueries({ queryKey: ["apex"] });
    },
  });
}

export function useCreateInvoiceVersion(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Finance.CreateInvoiceVersionInput, "projectId">) =>
      api.post<Finance.InvoiceVersionDTO>(`/api/projects/${projectId}/invoice/versions`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", "invoice-versions", projectId] }),
  });
}

export function useTransactions(projectId?: string, includeVoided = false) {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  if (includeVoided) params.set("includeVoided", "true");
  const suffix = params.size ? `?${params}` : "";
  return useQuery({ queryKey: ["finance", "transactions", projectId ?? null, includeVoided], queryFn: () => api.get<Finance.TransactionDTO[]>(`/api/finance/transactions${suffix}`) });
}

export function useDebts() {
  return useQuery({ queryKey: ["finance", "debts"], queryFn: () => api.get<Finance.ProjectFinanceDTO[]>("/api/billing/client-debts") });
}

export function useProjectsForFinance() {
  return useQuery({ queryKey: ["projects", "list"], queryFn: () => api.get<Projects.ProjectDTO[]>("/api/projects") });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["finance"] });
  qc.invalidateQueries({ queryKey: ["apex"] });
  qc.invalidateQueries({ queryKey: ["projects", "assignments"] });
  qc.invalidateQueries({ queryKey: ["projects", "contractor-items"] });
  qc.invalidateQueries({ queryKey: ["projects", "contractor-debts"] });
  qc.invalidateQueries({ queryKey: ["projects", "invoice"] });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; currency: Finance.AccountDTO["currency"] }) =>
      api.post("/api/finance/accounts", input),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patch<Finance.AccountDTO>(`/api/finance/accounts/${id}`, { name }),
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

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Finance.UpdateTransactionInput }) => api.patch<Finance.TransactionDTO>(`/api/finance/transactions/${id}`, input),
    onSuccess: () => invalidate(qc),
  });
}

export function useVoidTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Finance.TransactionDTO>(`/api/finance/transactions/${id}/void`, {}),
    onSuccess: () => invalidate(qc),
  });
}
