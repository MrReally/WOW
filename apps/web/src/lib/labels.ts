import type { Equipment, Projects, Role } from "@sever/contracts";
import type { BadgeTone } from "../ui-kit/index.ts";

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
  completed: "Завершён",
  cancelled: "Отменён",
};

export const projectStatusTone: Record<Projects.ProjectStatus, BadgeTone> = {
  draft: "neutral",
  confirmed: "info",
  in_progress: "warn",
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
  reservation_conflict: "Конфликт броней",
  overdue_debt: "Просрочка долга",
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

export function dateRange(startIso: string, endIso: string): string {
  const f = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return `${f.format(new Date(startIso))} – ${f.format(new Date(endIso))}`;
}

export function dateTime(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
