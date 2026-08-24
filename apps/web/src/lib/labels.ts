import type { Equipment, Projects, Role } from "@sever/contracts";
import type { BadgeTone } from "../ui-kit/index.ts";
import { configuredDateTime, configuredDateRange } from "./dateFormat.ts";

// Presentation-only mapping of machine codes to Russian labels + badge tones.
// Lives in the web layer; the contract keeps stable English codes.

export const unitStatusLabel: Record<Equipment.UnitStatus, string> = {
  in_stock: "На складе",
  reserved: "Зарезервировано",
  on_project: "На проекте",
  in_repair: "В ремонте",
  at_contractor: "У подрядчика",
  lost: "Утеряно",
};

export const unitStatusTone: Record<Equipment.UnitStatus, BadgeTone> = {
  in_stock: "ok",
  reserved: "info",
  on_project: "warn",
  in_repair: "danger",
  at_contractor: "warn",
  lost: "danger",
};

export const projectStatusLabel: Record<Projects.ProjectStatus, string> = {
  draft: "Черновик",
  confirmed: "Подтверждён",
  in_progress: "В работе",
  awaiting_payment: "Ждёт оплаты",
  completed: "Завершён",
  cancelled: "Отменён",
};

export const projectStatusTone: Record<Projects.ProjectStatus, BadgeTone> = {
  draft: "neutral",
  confirmed: "info",
  in_progress: "warn",
  awaiting_payment: "danger",
  completed: "ok",
  cancelled: "danger",
};

export const roleLabel: Record<Role, string> = {
  admin: "Владелец / Админ",
  warehouse: "Склад",
  tech: "Монтажник",
};

export const problemKindLabel: Record<string, string> = {
  incomplete_return: "Некомплект",
  kit_incomplete: "Неполная комплектность",
  reservation_conflict: "Конфликт броней",
  overdue_debt: "Просрочка долга",
  contractor_return_due: "Вернуть подрядчику",
  unit_lost: "Утеря",
};

export function eur(amount: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function dateTime(iso: string): string {
  return configuredDateTime(iso);
}

export function dateRange(startIso: string | null, endIso: string | null): string {
  return configuredDateRange(startIso, endIso);
}
