import type {
  ApexDashboardDTO,
  ApexRentalRow,
  Equipment,
  Finance,
  People,
  Projects,
  Problem,
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
        (p.status === "confirmed" || p.status === "draft") && Date.parse(p.startsAt) > now;

      const current = await Promise.all(allProjects.filter(isCurrent).map(buildRow));
      const upcoming = await Promise.all(allProjects.filter(isUpcoming).map(buildRow));

      const [equipProblems, projProblems, debts] = await Promise.all([
        deps.equipment.listProblems(),
        deps.projects.listProblems(),
        deps.finance.outstandingDebts(),
      ]);
      const problems: Problem[] = [...equipProblems, ...projProblems].sort(
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

      return {
        generatedAt: new Date().toISOString(),
        current,
        upcoming,
        problems,
        debts: debtRows,
      };
    },
  };
}
