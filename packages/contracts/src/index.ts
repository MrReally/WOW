export * from "./common.js";
export * as Equipment from "./equipment.js";
export * as Projects from "./projects.js";
export * as Finance from "./finance.js";
export * as People from "./people.js";
export * as Venues from "./venues.js";
export * as Plans from "./plans.js";
export * as Notifications from "./notifications.js";

// Runtime constants surfaced at top level for convenience (route validation).
export { UNIT_STATUSES } from "./equipment.js";
export { PROJECT_STATUSES } from "./projects.js";
export { PLAN_LAYERS } from "./plans.js";
export { ADVANCED_NOTIFICATION_EVENTS, NOTIFICATION_KINDS } from "./notifications.js";

// Apex is a read-only aggregator over other modules — its DTO lives here too.
import type { Problem, ID, ISODateTime } from "./common.js";
import type { ProjectDTO } from "./projects.js";
import type { ProjectFinanceDTO } from "./finance.js";
import type { Currency } from "./common.js";

export interface ApexRentalRow {
  project: ProjectDTO;
  clientName: string;
  unitsOnProject: number;
  finance: ProjectFinanceDTO | null;
}

export interface ApexDashboardDTO {
  generatedAt: ISODateTime;
  current: ApexRentalRow[];
  upcoming: ApexRentalRow[];
  problems: Problem[];
  debts: { projectId: ID; projectName: string; clientName: string; debtEUR: number }[];
  financeSummary: ApexFinanceSummaryDTO;
}

export interface ApexFinanceSummaryDTO {
  revenueEUR: number;
  paidEUR: number;
  clientDebtEUR: number;
  recordedCostEUR: number;
  contractorDebtEUR: number;
  profitAfterRecordedCostEUR: number;
  accountBalances: { currency: Currency; balance: number }[];
}
