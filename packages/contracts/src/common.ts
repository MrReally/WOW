// Shared primitives used across every module contract.
// These are wire-level types: what crosses module boundaries and the network.

export type ID = string;
export type ISODateTime = string; // e.g. "2026-06-14T10:00:00.000Z"

/** Base currency for every aggregate (Apex, payback, debts). */
export const BASE_CURRENCY = "EUR" as const;

export type Currency = "EUR" | "USD" | "RSD" | "RUB" | "GBP";

export const CURRENCIES: Currency[] = ["EUR", "USD", "RSD", "RUB", "GBP"];

export type Role = "admin" | "warehouse" | "tech";

export const ROLES: Role[] = ["admin", "warehouse", "tech"];

/** Authenticated caller, resolved from Telegram initData (or dev bypass). */
export interface AuthContext {
  userId: ID;
  telegramId: string;
  role: Role;
  displayName: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
}

/** Standard error envelope returned by the API. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * A Problem is the system's way of surfacing a conflict WITHOUT blocking the
 * action that caused it (incomplete return, double-booking, missing person).
 * Problems are owned by whichever module detects them and shown in Apex.
 */
export type ProblemKind =
  | "incomplete_return" // некомплект
  | "reservation_conflict"
  | "overdue_debt"
  | "unit_lost";

export type ProblemSeverity = "info" | "warning" | "critical";

export interface Problem {
  id: ID;
  kind: ProblemKind;
  severity: ProblemSeverity;
  title: string;
  detail: string;
  /** Opaque references to entities in other modules (ids only, never joins). */
  refs: Record<string, string>;
  resolved: boolean;
  createdAt: ISODateTime;
  resolvedAt: ISODateTime | null;
}
