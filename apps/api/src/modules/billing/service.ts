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
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const daysBetween = (startIso: string, endIso: string) =>
  Math.max(1, Math.ceil((Date.parse(endIso) - Date.parse(startIso)) / 86_400_000));

export function createBillingService(deps: BillingDeps): BillingService {
  return {
    async projectInvoice(projectId) {
      const project = await deps.projects.getProject(projectId);
      if (!project) throw NotFound("project", projectId);

      const [reservations, assignments, models, txs] = await Promise.all([
        deps.projects.listReservations(projectId),
        deps.projects.listAssignments(projectId),
        deps.equipment.listModels(),
        deps.finance.listTransactions({ projectId }),
      ]);
      const modelMap = new Map(models.map((m) => [m.id, m]));

      // Equipment rental — billed to the client.
      const rentalLines: Finance.InvoiceLineDTO[] = reservations.map((r) => {
        const m = modelMap.get(r.modelId);
        const price = m?.dailyPriceEUR ?? 0;
        const rdays = daysBetween(r.startsAt, r.endsAt);
        return {
          refId: r.id,
          label: m?.name ?? r.modelId,
          detail: `${r.qty} × ${price} €/сут × ${rdays} сут`,
          qty: r.qty,
          unitEUR: price,
          periods: rdays,
          amountEUR: round2(price * r.qty * rdays),
        };
      });
      const rentalEUR = round2(rentalLines.reduce((s, l) => s + l.amountEUR, 0));

      // Crew engagement costs (skip declined invites).
      const crew = assignments.filter((a) => a.status !== "declined" && a.rateEUR != null);
      const names = await Promise.all(crew.map((a) => deps.people.getById(a.userId)));
      const laborLines: Finance.InvoiceLineDTO[] = crew.map((a, i) => ({
        refId: a.id,
        label: names[i]?.displayName ?? "—",
        detail: [a.roleNote || "команда", a.status === "invited" ? "приглашён" : null].filter(Boolean).join(" · "),
        qty: 1,
        unitEUR: round2(a.rateEUR ?? 0),
        periods: 1,
        amountEUR: round2(a.rateEUR ?? 0),
      }));
      const laborEUR = round2(laborLines.reduce((s, l) => s + l.amountEUR, 0));

      // Recorded money. Salary expenses are excluded — crew cost is already
      // captured via assignment rates, so counting both would double up.
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
      const costEUR = round2(laborEUR + recordedExpenseEUR);

      return {
        projectId,
        days: daysBetween(project.startsAt, project.endsAt),
        rentalLines,
        rentalEUR,
        laborLines,
        laborEUR,
        recordedExpenseEUR,
        recordedIncomeEUR,
        paidEUR,
        invoiceEUR,
        costEUR,
        profitEUR: round2(invoiceEUR - costEUR),
        dueEUR: round2(invoiceEUR - paidEUR),
      };
    },
  };
}
