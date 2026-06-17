import type { Currency, ID, ISODateTime } from "./common.js";

// ── FX rates (entered manually in Settings) ──────────────────────────────────

export interface FxRateDTO {
  currency: Currency;
  rateToEUR: number; // 1 unit of `currency` = rateToEUR EUR
  updatedAt: ISODateTime;
}

// ── Accounts (multi-currency) ────────────────────────────────────────────────

export interface AccountDTO {
  id: ID;
  name: string;
  currency: Currency;
  /** Balance in the account's own currency. */
  balance: number;
  createdAt: ISODateTime;
}

// ── Transactions (FX snapshot frozen at creation) ────────────────────────────

export type TxKind = "income" | "expense";
export type TxCategory =
  | "rental_revenue"
  | "prepayment"
  | "debt_settlement"
  | "purchase"
  | "repair"
  | "salary"
  | "other";

export interface TransactionDTO {
  id: ID;
  accountId: ID;
  projectId: ID | null;
  /** When attributing revenue to a unit's payback. */
  unitId: ID | null;
  kind: TxKind;
  category: TxCategory;
  amount: number; // in `currency`
  currency: Currency;
  fxRateToEUR: number; // snapshot taken at creation
  amountEUR: number; // frozen: amount * fxRateToEUR
  note: string | null;
  createdAt: ISODateTime;
}

export interface CreateTransactionInput {
  accountId: ID;
  projectId?: ID | null;
  unitId?: ID | null;
  kind: TxKind;
  category: TxCategory;
  amount: number;
  currency: Currency;
  note?: string | null;
}

// ── Payback per unit ─────────────────────────────────────────────────────────

export type PaybackStage =
  | "not_paid_back" // не окупилось
  | "paid_back" // окупилось
  | "earned_extra"; // заработало ещё одну стоимость

export interface UnitPaybackDTO {
  unitId: ID;
  unitCostEUR: number;
  earnedEUR: number;
  stage: PaybackStage;
  /** earnedEUR / unitCostEUR, capped for display. */
  ratio: number;
}

// ── Project financial summary ────────────────────────────────────────────────

export interface ProjectFinanceDTO {
  projectId: ID;
  revenueEUR: number;
  prepaidEUR: number;
  costEUR: number;
  /** revenue - prepaid: positive => client still owes (debt). */
  debtEUR: number;
}

// ── Project invoice / cost estimate (composed from plan + recorded money) ─────
// Not stored: computed on demand from reservations (× daily price × days),
// crew rates, and the project's recorded transactions.

export interface InvoiceLineDTO {
  refId: ID;
  label: string;
  detail: string;
  amountEUR: number;
}

export interface ProjectInvoiceDTO {
  projectId: ID;
  /** Project window length in whole days (billed days, min 1). */
  days: number;
  /** Equipment rental — what the client is billed. */
  rentalLines: InvoiceLineDTO[];
  rentalEUR: number;
  /** Crew engagement costs (assignment rates). */
  laborLines: InvoiceLineDTO[];
  laborEUR: number;
  /** Expenses recorded in finance for this project (repairs/purchases/other). */
  recordedExpenseEUR: number;
  /** Income already recorded against the project. */
  recordedIncomeEUR: number;
  /** Client payments received (prepayment + settlement). */
  paidEUR: number;
  /** Bill to the client = rentalEUR. */
  invoiceEUR: number;
  /** Project cost = labor + recorded expenses. */
  costEUR: number;
  /** invoiceEUR − costEUR. */
  profitEUR: number;
  /** invoiceEUR − paidEUR (still to collect). */
  dueEUR: number;
}

// ── Public service contract ──────────────────────────────────────────────────

export interface FinanceService {
  // FX
  listFxRates(): Promise<FxRateDTO[]>;
  setFxRate(currency: Currency, rateToEUR: number): Promise<FxRateDTO>;

  // Accounts
  listAccounts(): Promise<AccountDTO[]>;
  createAccount(input: { name: string; currency: Currency }): Promise<AccountDTO>;

  // Transactions
  listTransactions(filter?: { projectId?: ID; unitId?: ID }): Promise<TransactionDTO[]>;
  createTransaction(input: CreateTransactionInput): Promise<TransactionDTO>;

  // Aggregates (all in EUR via frozen snapshots)
  unitPayback(unitId: ID, unitCostEUR: number): Promise<UnitPaybackDTO>;
  projectFinance(projectId: ID): Promise<ProjectFinanceDTO>;
  /** Projects with outstanding client debt, for Apex. */
  outstandingDebts(): Promise<ProjectFinanceDTO[]>;
}

// ── Amortization config (configurable formula, by project count) ─────────────

export interface AmortizationConfigDTO {
  /** Number of projects after which a unit is considered amortized. */
  projectsToPayback: number;
}

// ── Domain events ────────────────────────────────────────────────────────────

export interface TransactionCreatedEvent {
  type: "finance.transaction.created";
  transactionId: ID;
  projectId: ID | null;
  unitId: ID | null;
  amountEUR: number;
  at: ISODateTime;
}

export type FinanceEvent = TransactionCreatedEvent;
