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

// ── Permissions (granular, Syrve-style) ──────────────────────────────────────
// Custom roles are sets of these keys. The Owner role implicitly has all.

export type Permission =
  | "apex.view"
  | "operations.view"
  | "operations.stage.back"
  | "warehouse.view"
  | "warehouse.catalog.manage"
  | "warehouse.issue"
  | "warehouse.unit.status"
  | "warehouse.import"
  | "projects.view"
  | "projects.manage"
  | "projects.reservation.manage"
  | "projects.timing.manage"
  | "projects.timing.viewAll"
  | "projects.assignment.manage"
  | "clients.manage"
  | "finance.view"
  | "finance.manage"
  | "venues.manage"
  | "plans.view"
  | "plans.manage"
  | "people.view"
  | "people.manage"
  | "people.applications.review"
  | "telegram.inbox.manage"
  | "roles.manage"
  | "notifications.advanced"
  | "data.reset";

export interface PermissionMeta {
  key: Permission;
  group: string;
  label: string;
}

/** Catalog used to render the role editor, grouped by area. */
export const PERMISSIONS: PermissionMeta[] = [
  { key: "apex.view", group: "Apex (управление)", label: "Видеть Apex — прокаты, проблемы, долги" },
  { key: "operations.view", group: "Operations (бригада)", label: "Видеть Operations — рабочее окно бригады" },
  { key: "operations.stage.back", group: "Operations (бригада)", label: "Возвращать проект на предыдущий этап" },
  { key: "warehouse.view", group: "Склад", label: "Видеть склад и каталог" },
  { key: "warehouse.catalog.manage", group: "Склад", label: "Управлять каталогом (типы/модели/единицы)" },
  { key: "warehouse.import", group: "Склад", label: "Импорт каталога из CSV" },
  { key: "warehouse.issue", group: "Склад", label: "Выдавать и принимать оборудование" },
  { key: "warehouse.unit.status", group: "Склад", label: "Менять статус единиц (ремонт, утеря)" },
  { key: "projects.view", group: "Планирование", label: "Видеть проекты" },
  { key: "projects.manage", group: "Планирование", label: "Создавать/редактировать проекты" },
  { key: "projects.reservation.manage", group: "Планирование", label: "Брони и распределение" },
  { key: "projects.timing.manage", group: "Планирование", label: "Тайминги — создавать и редактировать" },
  { key: "projects.timing.viewAll", group: "Планирование", label: "Видеть весь тайминг (параллельные процессы)" },
  { key: "projects.assignment.manage", group: "Планирование", label: "Назначать и приглашать людей на проект" },
  { key: "clients.manage", group: "Планирование", label: "Управлять клиентами" },
  { key: "finance.view", group: "Финансы", label: "Видеть финансы" },
  { key: "finance.manage", group: "Финансы", label: "Транзакции, счета, курсы" },
  { key: "venues.manage", group: "Площадки и планы", label: "Управлять площадками" },
  { key: "plans.view", group: "Площадки и планы", label: "Видеть технические планы" },
  { key: "plans.manage", group: "Площадки и планы", label: "Редактировать планы (сцена, слои, версии)" },
  { key: "people.view", group: "Администрирование", label: "Видеть людей" },
  { key: "people.manage", group: "Администрирование", label: "Создавать/редактировать людей" },
  { key: "people.applications.review", group: "Администрирование", label: "Рассматривать анкеты из Telegram" },
  { key: "telegram.inbox.manage", group: "Администрирование", label: "Рабочий Telegram-чат от лица бота" },
  { key: "roles.manage", group: "Администрирование", label: "Управлять ролями и правами" },
  { key: "notifications.advanced", group: "Администрирование", label: "Расширенные уведомления о действиях в системе" },
  { key: "data.reset", group: "Администрирование", label: "Сброс/очистка базы данных" },
];

export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key);

/** Authenticated caller — resolved from a session token, Telegram, or dev bypass. */
export interface AuthContext {
  userId: ID;
  telegramId: string | null;
  email: string | null;
  displayName: string;
  roleId: ID | null;
  roleName: string;
  isOwner: boolean;
  operationsShowAllProjects: boolean;
  permissions: Permission[];
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
  | "contractor_return_due"
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
