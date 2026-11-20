import type { Equipment, Finance, People, Projects } from "@sever/contracts";

type Cell = string | number | null | undefined;
type Row = Record<string, Cell>;

const COLUMNS = [
  "Transaction ID", "Status", "Transaction Date", "Created At", "Updated At", "Voided At",
  "Account ID", "Account", "Account Currency", "Income", "Expense", "Balance After Transaction",
  "Amount", "Currency", "FX Rate to EUR", "Amount EUR", "Transaction Type", "Category", "Category Code", "Note",
  "Project ID", "Project", "Client ID", "Client", "Contractor ID", "Contractor", "Employee ID", "Employee",
  "Counterparty Type", "Counterparty ID", "Counterparty", "Assignment ID", "Unit ID", "Replaces Transaction ID",
  "Created By ID", "Created By", "Updated By ID", "Updated By", "Voided By ID", "Voided By",
] as const;

const CATEGORY_LABEL: Record<Finance.TxCategory, string> = {
  rental_revenue: "Rental revenue accrual",
  prepayment: "Client prepayment",
  debt_settlement: "Client payment",
  purchase: "Purchase",
  repair: "Repair",
  salary: "Salary payment",
  adjustment: "Balance adjustment",
  other: "Other",
};

function csvCell(value: Cell): string {
  if (value == null) return "";
  const text = String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function csv(rows: Row[]): string {
  return `\uFEFF${[COLUMNS.join(";"), ...rows.map(row => COLUMNS.map(column => csvCell(row[column])).join(";"))].join("\r\n")}\r\n`;
}

const personName = (person: People.UserDTO | undefined) => person?.nickname?.trim() || person?.displayName?.trim() || "";

/**
 * Creates a cash-book export. Rental revenue accruals are intentionally left
 * out: they are project economics, not a movement on an account.
 */
export async function createTransactionCashExportCsv(
  deps: {
    projects: Projects.ProjectsService;
    equipment: Equipment.EquipmentService;
    finance: Finance.FinanceService;
    people: People.PeopleService;
  },
  filter: { from: string; to: string },
): Promise<string> {
  const [transactions, accounts, projects, clients, contractors, people] = await Promise.all([
    deps.finance.listTransactions({ includeVoided: true }),
    deps.finance.listAccounts(),
    deps.projects.listProjects(),
    deps.projects.listClients(),
    deps.equipment.listContractors(),
    deps.people.list("all"),
  ]);
  const projectById = new Map(projects.map(item => [item.id, item]));
  const clientById = new Map(clients.map(item => [item.id, item]));
  const accountById = new Map(accounts.map(item => [item.id, item]));
  const contractorById = new Map(contractors.map(item => [item.id, item]));
  const personById = new Map(people.map(item => [item.id, item]));
  const assignments = (await Promise.all(projects.map(project => deps.projects.listAssignments(project.id)))).flat();
  const assignmentById = new Map(assignments.map(item => [item.id, item]));

  // An account starts at zero. Adjustments establish an explicit balance, so
  // replaying posted cash movements in chronological order gives its balance
  // after every row, including for exports starting in the middle of history.
  const balances = new Map<string, number>();
  const chronological = transactions
    .filter(transaction => transaction.category !== "rental_revenue")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  const balanceAfter = new Map<string, number>();
  for (const transaction of chronological) {
    const before = balances.get(transaction.accountId) ?? 0;
    let after = before;
    if (!transaction.voidedAt) {
      after = transaction.category === "adjustment" && transaction.adjustmentBalanceAfter != null
        ? transaction.adjustmentBalanceAfter
        : before + (transaction.kind === "income" ? transaction.amount : -transaction.amount);
      balances.set(transaction.accountId, after);
    }
    balanceAfter.set(transaction.id, after);
  }

  const rows = chronological
    .filter(transaction => transaction.createdAt.slice(0, 10) >= filter.from
      && transaction.createdAt.slice(0, 10) <= filter.to)
    .map(transaction => {
      const project = transaction.projectId ? projectById.get(transaction.projectId) : undefined;
      const client = project ? clientById.get(project.clientId) : undefined;
      const contractor = transaction.contractorId ? contractorById.get(transaction.contractorId) : undefined;
      const assignment = transaction.assignmentId ? assignmentById.get(transaction.assignmentId) : undefined;
      const employee = assignment ? personById.get(assignment.userId) : undefined;
      const counterparty = contractor
        ? { type: "Contractor", id: contractor.id, name: contractor.name }
        : employee
          ? { type: "Employee", id: employee.id, name: personName(employee) }
          : client && transaction.kind === "income"
            ? { type: "Client", id: client.id, name: client.name }
            : undefined;
      const account = accountById.get(transaction.accountId);
      const posted = !transaction.voidedAt;
      return {
        "Transaction ID": transaction.id,
        Status: posted ? "Posted" : "Voided",
        "Transaction Date": transaction.createdAt.slice(0, 10),
        "Created At": transaction.createdAt,
        "Updated At": transaction.updatedAt,
        "Voided At": transaction.voidedAt,
        "Account ID": transaction.accountId,
        Account: account?.name,
        "Account Currency": account?.currency ?? transaction.currency,
        Income: posted && transaction.kind === "income" ? transaction.amount : null,
        Expense: posted && transaction.kind === "expense" ? transaction.amount : null,
        "Balance After Transaction": balanceAfter.get(transaction.id),
        Amount: transaction.amount,
        Currency: transaction.currency,
        "FX Rate to EUR": transaction.fxRateToEUR,
        "Amount EUR": transaction.amountEUR,
        "Transaction Type": transaction.kind === "income" ? "Income" : "Expense",
        Category: CATEGORY_LABEL[transaction.category],
        "Category Code": transaction.category,
        Note: transaction.note,
        "Project ID": project?.id,
        Project: project?.name,
        "Client ID": client?.id,
        Client: client?.name,
        "Contractor ID": contractor?.id,
        Contractor: contractor?.name,
        "Employee ID": employee?.id,
        Employee: personName(employee),
        "Counterparty Type": counterparty?.type,
        "Counterparty ID": counterparty?.id,
        Counterparty: counterparty?.name,
        "Assignment ID": transaction.assignmentId,
        "Unit ID": transaction.unitId,
        "Replaces Transaction ID": transaction.replacesTransactionId,
        "Created By ID": transaction.createdByUserId,
        "Created By": personName(transaction.createdByUserId ? personById.get(transaction.createdByUserId) : undefined),
        "Updated By ID": transaction.updatedByUserId,
        "Updated By": personName(transaction.updatedByUserId ? personById.get(transaction.updatedByUserId) : undefined),
        "Voided By ID": transaction.voidedByUserId,
        "Voided By": personName(transaction.voidedByUserId ? personById.get(transaction.voidedByUserId) : undefined),
      };
    });
  return csv(rows);
}
