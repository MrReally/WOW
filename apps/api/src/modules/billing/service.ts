import type { Equipment, Finance, ID, People, Projects } from "@sever/contracts";
import { NotFound } from "../../core/errors.js";

// Billing is a read-only aggregator (like Apex): it owns no data and composes
// the public services of projects, equipment, finance and people to produce a
// project invoice / cost estimate. The rental bill is derived from reservations
// (qty × daily price × days); costs from crew rates + recorded expenses.

export interface BillingDeps {
  projects: Projects.ProjectsService;
  equipment: Equipment.EquipmentService;
  finance: Finance.FinanceService;
  people: People.PeopleService;
}

export interface BillingService {
  projectInvoice(projectId: ID): Promise<Finance.ProjectInvoiceDTO>;
  outstandingClientDebts(): Promise<Finance.ProjectFinanceDTO[]>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const daysBetween = (startIso: string, endIso: string) =>
  Math.max(1, Math.ceil((Date.parse(endIso) - Date.parse(startIso)) / 86_400_000));

export function createBillingService(deps: BillingDeps): BillingService {
  async function projectInvoice(projectId: ID): Promise<Finance.ProjectInvoiceDTO> {
    const project = await deps.projects.getProject(projectId);
    if (!project) throw NotFound("project", projectId);

    const [reservations, assignments, projectRoles, models, types, txs, contractorItems, contractors] = await Promise.all([
      deps.projects.listReservations(projectId),
      deps.projects.listAssignments(projectId),
      deps.projects.listProjectRoles(projectId),
      deps.equipment.listModels(),
      deps.equipment.listTypes(),
      deps.finance.listTransactions({ projectId }),
      deps.projects.listContractorItems(projectId),
      deps.equipment.listContractors(),
    ]);
    const modelMap = new Map(models.map((m) => [m.id, m]));
    const typeName = new Map(types.map((t) => [t.id, t.name]));
    const contractorName = new Map(contractors.map((c) => [c.id, c.name]));
    const projectDays = daysBetween(project.startsAt, project.endsAt);

    const ownLines: Finance.InvoiceLineDTO[] = reservations.filter((r) => !r.isReserve).map((r) => {
      const m = modelMap.get(r.modelId);
      const price = m?.dailyPriceEUR ?? 0;
      return {
        refId: r.id,
        section: (m && typeName.get(m.typeId)) || "Equipment",
        label: m?.name ?? r.modelId,
        detail: `${projectDays} day${projectDays === 1 ? "" : "s"} × ${price} €/day`,
        qty: r.qty,
        unitEUR: price,
        periods: projectDays,
        amountEUR: round2(price * r.qty * projectDays),
        costEUR: 0,
      };
    });
    const contractorKindDetail = (it: { kind: string; note: string | null }) =>
      [it.kind === "delivery" ? "delivery" : it.kind === "setup" ? "setup" : "subrent", it.note].filter(Boolean).join(" · ");
    const contractorLines: Finance.InvoiceLineDTO[] = contractorItems.map((it) => ({
      refId: it.id,
      section: `Vendor: ${contractorName.get(it.contractorId) ?? "—"}`,
      label: it.name,
      detail: contractorKindDetail(it),
      qty: it.qty,
      unitEUR: it.priceEUR,
      periods: 1,
      amountEUR: round2(it.priceEUR * it.qty),
      costEUR: round2(it.costEUR * it.qty),
    }));
    const rentalLines = [...ownLines, ...contractorLines];
    const rentalEUR = round2(rentalLines.reduce((s, l) => s + l.amountEUR, 0));
    const contractorCostEUR = round2(contractorLines.reduce((s, l) => s + l.costEUR, 0));

    const laborLines: Finance.InvoiceLineDTO[] = projectRoles.length > 0
      ? projectRoles
          .filter((role) => role.rateEUR != null)
          .map((role) => {
            const filled = assignments.filter((a) => a.roleId === role.id && (a.status === "added" || a.status === "accepted")).length;
            return {
              refId: role.id,
              section: "Crew",
              label: role.title,
              detail: `${filled}/${role.requiredCount} confirmed`,
              qty: role.requiredCount,
              unitEUR: round2(role.rateEUR ?? 0),
              periods: 1,
              amountEUR: round2((role.rateEUR ?? 0) * role.requiredCount),
              costEUR: round2((role.rateEUR ?? 0) * role.requiredCount),
            };
          })
      : assignments
          .filter((a) => (a.status === "added" || a.status === "accepted") && a.rateEUR != null)
          .map((a) => ({
            refId: a.id,
            section: "Crew",
            label: a.roleNote || "crew",
            detail: a.status,
            qty: 1,
            unitEUR: round2(a.rateEUR ?? 0),
            periods: 1,
            amountEUR: round2(a.rateEUR ?? 0),
            costEUR: round2(a.rateEUR ?? 0),
          }));
    const laborEUR = round2(laborLines.reduce((s, l) => s + l.amountEUR, 0));

    let paidEUR = 0;
    let recordedIncomeEUR = 0;
    let recordedExpenseEUR = 0;
    for (const t of txs) {
      if (t.kind === "income" && (t.category === "prepayment" || t.category === "debt_settlement")) paidEUR += t.amountEUR;
      else if (t.kind === "income" && t.category === "rental_revenue") recordedIncomeEUR += t.amountEUR;
      else if (t.kind === "expense" && t.category !== "salary") recordedExpenseEUR += t.amountEUR;
    }
    paidEUR = round2(paidEUR);
    recordedIncomeEUR = round2(recordedIncomeEUR);
    recordedExpenseEUR = round2(recordedExpenseEUR);

    const invoiceEUR = rentalEUR;
    const costEUR = round2(laborEUR + recordedExpenseEUR + contractorCostEUR);

    return {
      projectId,
      days: projectDays,
      rentalLines,
      rentalEUR,
      laborLines,
      laborEUR,
      contractorCostEUR,
      recordedExpenseEUR,
      recordedIncomeEUR,
      paidEUR,
      invoiceEUR,
      costEUR,
      profitEUR: round2(invoiceEUR - costEUR),
      dueEUR: round2(invoiceEUR - paidEUR),
    };
  }

  return {
    async projectInvoice(projectId) {
      return projectInvoice(projectId);
    },
    async outstandingClientDebts() {
      const projects = await deps.projects.listProjects();
      const rows = await Promise.all(
        projects
          .filter((p) => p.status === "completed")
          .map(async (p) => ({ project: p, invoice: await projectInvoice(p.id) }))
      );
      return rows
        .filter(({ invoice }) => invoice.dueEUR > 0)
        .map(({ project, invoice }) => ({
          projectId: project.id,
          revenueEUR: invoice.invoiceEUR,
          prepaidEUR: invoice.paidEUR,
          costEUR: invoice.costEUR,
          debtEUR: invoice.dueEUR,
        }));
    },
  };
}
