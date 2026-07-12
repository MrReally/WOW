import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApexDashboardDTO, Catalog, Equipment, Finance, Operations, People, Permission, Problem, Projects } from "@sever/contracts";
import { api } from "../../lib/api.ts";

export type BackofficeView = "stylish" | "classic";

const DEFAULT_VIEW: BackofficeView = "classic";

function storageKey(userId?: string) {
  return `sever.backoffice.view.${userId ?? "preview"}`;
}

function readView(userId?: string): BackofficeView {
  const stored = localStorage.getItem(storageKey(userId));
  return stored === "stylish" || stored === "classic" ? stored : DEFAULT_VIEW;
}

export function useBackofficeAppearance(userId?: string) {
  const [view, setView] = useState<BackofficeView>(() => readView(userId));

  useEffect(() => {
    setView(readView(userId));
  }, [userId]);

  const selectView = (next: BackofficeView) => {
    localStorage.setItem(storageKey(userId), next);
    setView(next);
  };

  return { view, selectView };
}

export function useBackofficeData(can: (...permissions: Permission[]) => boolean) {
  const warehouse = can("warehouse.view"), planning = can("projects.view"), peopleAccess = can("people.view", "people.manage"), financeAccess = can("finance.view");
  const models = useQuery({ enabled: warehouse, queryKey: ["bo", "models"], queryFn: () => api.get<Equipment.EquipmentModelDTO[]>("/api/equipment/models") });
  const types = useQuery({ enabled: warehouse, queryKey: ["bo", "types"], queryFn: () => api.get<Equipment.EquipmentTypeDTO[]>("/api/equipment/types") });
  const units = useQuery({ enabled: warehouse, queryKey: ["bo", "units"], queryFn: () => api.get<Equipment.EquipmentUnitDTO[]>("/api/equipment/units") });
  const warehouses = useQuery({ enabled: warehouse, queryKey: ["bo", "warehouses"], queryFn: () => api.get<Equipment.WarehouseDTO[]>("/api/equipment/warehouses") });
  const journal = useQuery({ enabled: warehouse, queryKey: ["bo", "journal"], queryFn: () => api.get<Equipment.JournalEntryDTO[]>("/api/equipment/journal?limit=1000") });
  const problems = useQuery({ enabled: warehouse, queryKey: ["bo", "problems"], queryFn: () => api.get<Problem[]>("/api/equipment/problems?includeResolved=true") });
  const apex = useQuery({ enabled: can("apex.view"), queryKey: ["bo", "apex"], queryFn: () => api.get<ApexDashboardDTO>("/api/apex/dashboard") });
  const projects = useQuery({ enabled: planning, queryKey: ["bo", "projects"], queryFn: () => api.get<Projects.ProjectDTO[]>("/api/projects") });
  const clients = useQuery({ enabled: planning, queryKey: ["bo", "clients"], queryFn: () => api.get<Projects.ClientDTO[]>("/api/clients") });
  const people = useQuery({ enabled: peopleAccess, queryKey: ["bo", "people"], queryFn: () => api.get<People.UserDTO[]>("/api/people?status=all") });
  const roles = useQuery({ enabled: peopleAccess, queryKey: ["bo", "roles"], queryFn: () => api.get<People.RoleDTO[]>("/api/roles") });
  const contractors = useQuery({ enabled: warehouse, queryKey: ["bo", "contractors"], queryFn: () => api.get<Equipment.ContractorDTO[]>("/api/equipment/contractors") });
  const contractorItems = useQuery({ enabled: planning, queryKey: ["bo", "contractor-items"], queryFn: () => api.get<Projects.ContractorItemDTO[]>("/api/contractor-items/open") });
  const accounts = useQuery({ enabled: financeAccess, queryKey: ["bo", "accounts"], queryFn: () => api.get<Finance.AccountDTO[]>("/api/finance/accounts") });
  const transactions = useQuery({ enabled: financeAccess, queryKey: ["bo", "transactions"], queryFn: () => api.get<Finance.TransactionDTO[]>("/api/finance/transactions") });
  const catalog = useQuery({ enabled: warehouse, queryKey: ["bo", "catalog"], queryFn: () => api.get<Catalog.CatalogItemDTO[]>("/api/catalog/items") });
  const documents = useQuery({ enabled: warehouse, queryKey: ["bo", "documents"], queryFn: () => api.get<Operations.OperationDocumentDTO[]>("/api/operations/documents") });
  return { models, types, units, warehouses, journal, problems, apex, projects, clients, people, roles, contractors, contractorItems, accounts, transactions, catalog, documents };
}

function invalidateBackoffice(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["bo"] });
  void qc.invalidateQueries({ queryKey: ["equipment"] });
  void qc.invalidateQueries({ queryKey: ["projects"] });
  void qc.invalidateQueries({ queryKey: ["apex"] });
}

export function useBackofficeCommands() {
  const qc = useQueryClient();
  const issue = useMutation({ mutationFn: (input: { projectId: string; unitIds: string[]; note?: string }) => api.post("/api/equipment/issue", input), onSuccess: () => invalidateBackoffice(qc) });
  const returnUnits = useMutation({ mutationFn: (input: { projectId: string; returnedUnitIds: string[]; expectedUnitIds: string[]; note?: string }) => api.post("/api/equipment/return", input), onSuccess: () => invalidateBackoffice(qc) });
  const transfer = useMutation({ mutationFn: (input: { unitId: string; warehouseId: string; note?: string }) => api.post(`/api/equipment/units/${input.unitId}/transfer`, { warehouseId: input.warehouseId, note: input.note }), onSuccess: () => invalidateBackoffice(qc) });
  const resolveProblem = useMutation({ mutationFn: (id: string) => api.post(`/api/equipment/problems/${id}/resolve`, {}), onSuccess: () => invalidateBackoffice(qc) });
  const createProject = useMutation({ mutationFn: (input: Projects.CreateProjectInput) => api.post<Projects.ProjectDTO>("/api/projects", input), onSuccess: () => invalidateBackoffice(qc) });
  const updateProject = useMutation({ mutationFn: ({ id, input }: { id: string; input: Projects.UpdateProjectInput }) => api.patch(`/api/projects/${id}`, input), onSuccess: () => invalidateBackoffice(qc) });
  const createTransaction = useMutation({ mutationFn: (input: Omit<Finance.CreateTransactionInput, "createdByUserId">) => api.post("/api/finance/transactions", input), onSuccess: () => invalidateBackoffice(qc) });
  const updateRole = useMutation({ mutationFn: ({ id, input }: { id: string; input: People.UpdateRoleInput }) => api.patch(`/api/roles/${id}`, input), onSuccess: () => invalidateBackoffice(qc) });
  const createCatalogItem = useMutation({ mutationFn: (input: Catalog.CreateCatalogItemInput) => api.post("/api/catalog/items", input), onSuccess: () => invalidateBackoffice(qc) });
  const createDocument = useMutation({ mutationFn: (input: Operations.OperationPayload) => api.post<Operations.OperationDocumentDTO>("/api/operations/documents", input), onSuccess: () => invalidateBackoffice(qc) });
  const postDocument = useMutation({ mutationFn: (id: string) => api.post<Operations.OperationDocumentDTO>(`/api/operations/documents/${id}/post`, {}), onSuccess: () => invalidateBackoffice(qc) });
  const reverseDocument = useMutation({ mutationFn: (id: string) => api.post<Operations.OperationDocumentDTO>(`/api/operations/documents/${id}/reverse`, {}), onSuccess: () => invalidateBackoffice(qc) });
  return { issue, returnUnits, transfer, resolveProblem, createProject, updateProject, createTransaction, updateRole, createCatalogItem, createDocument, postDocument, reverseDocument };
}
