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

// Dates are always DD-MM-YYYY and time is always 24h (no AM/PM), in local time.
const pad = (n: number) => String(n).padStart(2, "0");
function fmtDate(d: Date): string {
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}
function fmtTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  return `${fmtDate(d)} ${fmtTime(d)}`;
}

export function dateRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sameDay = fmtDate(s) === fmtDate(e);
  return sameDay
    ? `${fmtDate(s)} ${fmtTime(s)}–${fmtTime(e)}`
    : `${fmtDate(s)} ${fmtTime(s)} → ${fmtDate(e)} ${fmtTime(e)}`;
}
