import type {
  ApexDashboardDTO,
  ApexRentalRow,
  Equipment,
  Finance,
  People,
  Projects,
  Problem,
  Currency,
} from "@sever/contracts";

// Apex is the dispatcher view. It owns NO data — it composes the public
// contracts of equipment, projects and finance. This is exactly how a future
// "apex" service would call its neighbors over the network.

export interface ApexDeps {
  equipment: Equipment.EquipmentService;
  projects: Projects.ProjectsService;
  finance: Finance.FinanceService;
  people: People.PeopleService;
}

export interface ApexService {
  dashboard(): Promise<ApexDashboardDTO>;
}

export function createApexService(deps: ApexDeps): ApexService {
  return {
    async dashboard(): Promise<ApexDashboardDTO> {
      const now = Date.now();
      const [allProjects, clients] = await Promise.all([
        deps.projects.listProjects(),
        deps.projects.listClients(),
      ]);
      const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";

      const buildRow = async (p: Projects.ProjectDTO): Promise<ApexRentalRow> => {
        const [unitsOnProject, finance] = await Promise.all([
          deps.equipment.countUnitsOnProject(p.id),
          deps.finance.projectFinance(p.id).catch(() => null),
        ]);
        return { project: p, clientName: clientName(p.clientId), unitsOnProject, finance };
      };

      const isCurrent = (p: Projects.ProjectDTO) => {
        const start = Date.parse(p.startsAt);
        const end = Date.parse(p.endsAt);
        return (
          (p.status === "in_progress" || p.status === "confirmed") &&
          start <= now &&
          end >= now
        );
      };
      const isUpcoming = (p: Projects.ProjectDTO) =>
        (p.status === "confirmed" || p.status === "draft" || p.status === "in_progress") && Date.parse(p.startsAt) > now;

      const byStart = (a: ApexRentalRow, b: ApexRentalRow) => Date.parse(a.project.startsAt) - Date.parse(b.project.startsAt);
      const current = (await Promise.all(allProjects.filter(isCurrent).map(buildRow))).sort(byStart);
      const upcoming = (await Promise.all(allProjects.filter(isUpcoming).map(buildRow))).sort(byStart);

      const [equipProblems, projProblems, debts, openContractorItems, contractorDebts, accounts] = await Promise.all([
        deps.equipment.listProblems(),
        deps.projects.listProblems(),
        deps.finance.outstandingDebts(),
        deps.projects.listOpenContractorItems(),
        deps.projects.contractorDebts(),
        deps.finance.listAccounts(),
      ]);
      const contractorProblems: Problem[] = openContractorItems
        .map((item): Problem | null => {
          const p = allProjects.find((x) => x.id === item.projectId);
          if (!p || Date.parse(p.endsAt) > now) return null;
          return {
            id: `contractor-return-${item.id}`,
            kind: "contractor_return_due",
            severity: "warning",
            title: "Не возвращено подрядчику",
            detail: `${item.name} × ${item.qty} нужно вернуть подрядчику после проекта`,
            refs: { projectId: item.projectId, contractorId: item.contractorId, contractorItemId: item.id },
            resolved: false,
            createdAt: p.endsAt,
            resolvedAt: null,
          } satisfies Problem;
        })
        .filter((p): p is Problem => p !== null);
      const problems: Problem[] = [...equipProblems, ...projProblems, ...contractorProblems].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
      );

      const debtRows = debts.map((d) => {
        const p = allProjects.find((x) => x.id === d.projectId);
        return {
          projectId: d.projectId,
          projectName: p?.name ?? "—",
          clientName: p ? clientName(p.clientId) : "—",
          debtEUR: d.debtEUR,
        };
      });
      const projectFinances = [...current, ...upcoming].map((r) => r.finance).filter((f): f is Finance.ProjectFinanceDTO => f !== null);
      const revenueEUR = round2(projectFinances.reduce((s, f) => s + f.revenueEUR, 0));
      const paidEUR = round2(projectFinances.reduce((s, f) => s + f.prepaidEUR, 0));
      const recordedCostEUR = round2(projectFinances.reduce((s, f) => s + f.costEUR, 0));
      const clientDebtEUR = round2(debtRows.reduce((s, d) => s + d.debtEUR, 0));
      const contractorDebtEUR = round2(contractorDebts.reduce((s, d) => s + d.debtEUR, 0));
      const byCurrency = new Map<string, number>();
      for (const a of accounts) byCurrency.set(a.currency, round2((byCurrency.get(a.currency) ?? 0) + a.balance));

      return {
        generatedAt: new Date().toISOString(),
        current,
        upcoming,
        problems,
        debts: debtRows,
        financeSummary: {
          revenueEUR,
          paidEUR,
          clientDebtEUR,
          recordedCostEUR,
          contractorDebtEUR,
          profitAfterRecordedCostEUR: round2(revenueEUR - recordedCostEUR - contractorDebtEUR),
          accountBalances: [...byCurrency.entries()].map(([currency, balance]) => ({ currency: currency as Currency, balance })),
        },
      };
    },
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
