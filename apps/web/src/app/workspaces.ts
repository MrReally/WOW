import type { Permission } from "@sever/contracts";
import type { Glyph, Tone } from "../ui-kit/index.ts";

// Navigation is organized into role-gated "workspaces". Visibility is driven by
// permissions, not fixed roles — so custom roles get exactly the areas they can use.

export interface Workspace {
  id: string;
  name: string;
  glyph: Glyph;
  tone: Tone;
  route: string;
  requires: Permission[]; // any-of
  sub: string;
}

export const WORKSPACES: Workspace[] = [
  { id: "apex", name: "Apex", glyph: "radar", tone: "info", route: "/apex", requires: ["apex.view"], sub: "Управление · прокаты · проблемы · долги" },
  { id: "ops", name: "Operations", glyph: "pin", tone: "warn", route: "/operations", requires: ["operations.view"], sub: "Бригада · мои проекты · выдача/возврат" },
  { id: "wh", name: "Warehouse", glyph: "box", tone: "warn", route: "/warehouse", requires: ["warehouse.view"], sub: "Каталог · склад · кабели" },
  { id: "plan", name: "Planning", glyph: "rows", tone: "purple", route: "/projects", requires: ["projects.view"], sub: "Проекты · брони · команда" },
  { id: "ctr", name: "Contractors", glyph: "person", tone: "info", route: "/contractors", requires: ["projects.reservation.manage", "finance.view"], sub: "Подрядчики · цены · возвраты" },
  { id: "fin", name: "Finance", glyph: "coin", tone: "ok", route: "/finance", requires: ["finance.view"], sub: "Счета · долги · окупаемость" },
  { id: "adm", name: "Admin", glyph: "shield", tone: "alert", route: "/settings", requires: ["people.view", "people.manage", "roles.manage"], sub: "Люди · роли · права · курсы" },
];

export const WORKSPACE_COPY: Record<string, Record<"ru" | "en" | "sr", { name: string; sub: string }>> = {
  apex: {
    ru: { name: "Apex", sub: "Управление · прокаты · проблемы · финансы" },
    en: { name: "Apex", sub: "Control · rentals · issues · finance" },
    sr: { name: "Apex", sub: "Kontrola · rente · problemi · finansije" },
  },
  ops: {
    ru: { name: "Operations", sub: "Бригада · мои проекты · выдача" },
    en: { name: "Operations", sub: "Crew · my projects · issue/return" },
    sr: { name: "Operations", sub: "Ekipa · moji projekti · izdavanje" },
  },
  wh: {
    ru: { name: "Warehouse", sub: "Каталог · склад · кабели" },
    en: { name: "Warehouse", sub: "Catalog · stock · cables" },
    sr: { name: "Warehouse", sub: "Katalog · magacin · kablovi" },
  },
  plan: {
    ru: { name: "Planning", sub: "Проекты · брони · команда" },
    en: { name: "Planning", sub: "Projects · bookings · crew" },
    sr: { name: "Planning", sub: "Projekti · rezervacije · ekipa" },
  },
  ctr: {
    ru: { name: "Contractors", sub: "Поставщики · цены · возвраты" },
    en: { name: "Contractors", sub: "Suppliers · prices · returns" },
    sr: { name: "Contractors", sub: "Dobavljači · cene · povraćaji" },
  },
  fin: {
    ru: { name: "Finance", sub: "Счета · долги · маржа" },
    en: { name: "Finance", sub: "Accounts · debts · margin" },
    sr: { name: "Finance", sub: "Računi · dugovi · marža" },
  },
  adm: {
    ru: { name: "Admin", sub: "Люди · роли · права · курсы" },
    en: { name: "Admin", sub: "People · roles · access · FX" },
    sr: { name: "Admin", sub: "Ljudi · uloge · prava · kurs" },
  },
};

type Can = (...perms: Permission[]) => boolean;

export function workspacesFor(can: Can): Workspace[] {
  return WORKSPACES.filter((w) => can(...w.requires));
}

export function currentWorkspace(pathname: string): Workspace {
  const match = WORKSPACES.find((w) => pathname === w.route || pathname.startsWith(w.route + "/"));
  return match ?? WORKSPACES[0]!;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "·";
}
