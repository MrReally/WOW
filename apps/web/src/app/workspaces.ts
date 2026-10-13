import type { Permission } from "@sever/contracts";
import type { Glyph, Tone } from "../ui-kit/index.ts";

// Navigation is organized into role-gated "workspaces". Visibility is driven by
// permissions, not fixed roles — so custom roles get exactly the areas they can use.

export interface Workspace {
  id: string;
  name: string;
  shortcut: string;
  glyph: Glyph;
  tone: Tone;
  route: string;
  requires: Permission[]; // any-of
  sub: string;
}

export const WORKSPACES: Workspace[] = [
  { id: "apex", name: "Apex", shortcut: "A", glyph: "radar", tone: "info", route: "/apex", requires: ["apex.view"], sub: "Управление · прокаты · проблемы · долги" },
  { id: "ops", name: "Operations", shortcut: "O", glyph: "pin", tone: "warn", route: "/operations", requires: ["operations.view"], sub: "" },
  { id: "wh", name: "Warehouse", shortcut: "W", glyph: "box", tone: "warn", route: "/warehouse", requires: ["warehouse.view"], sub: "Каталог · склад · кабели" },
  { id: "sup", name: "Supplies", shortcut: "U", glyph: "grid", tone: "info", route: "/supplies", requires: ["supplies.view"], sub: "" },
  { id: "venues", name: "Venues", shortcut: "V", glyph: "pin", tone: "info", route: "/venues", requires: ["venues.view", "venues.manage", "venues.archive", "venues.delete"], sub: "" },
  { id: "plan", name: "Planning", shortcut: "P", glyph: "rows", tone: "purple", route: "/projects", requires: ["projects.view"], sub: "" },
  { id: "crew", name: "Crew", shortcut: "E", glyph: "person", tone: "ok", route: "/crew", requires: ["people.view"], sub: "" },
  { id: "ctr", name: "Contractors", shortcut: "C", glyph: "person", tone: "info", route: "/contractors", requires: ["projects.reservation.manage", "finance.view"], sub: "" },
  { id: "fin", name: "Finance", shortcut: "F", glyph: "coin", tone: "ok", route: "/finance", requires: ["finance.view"], sub: "" },
  { id: "adm", name: "Settings", shortcut: "S", glyph: "shield", tone: "alert", route: "/settings", requires: ["people.view", "people.manage", "roles.manage", "telegram.inbox.manage", "finance.manage", "projects.manage"], sub: "" },
];

export const WORKSPACE_COPY: Record<string, Record<"ru" | "en" | "sr", { name: string; sub: string }>> = {
  apex: {
    ru: { name: "Apex", sub: "Управление · прокаты · проблемы · финансы" },
    en: { name: "Apex", sub: "Control · rentals · issues · finance" },
    sr: { name: "Apex", sub: "Kontrola · rente · problemi · finansije" },
  },
  ops: {
    ru: { name: "Operations", sub: "" },
    en: { name: "Operations", sub: "" },
    sr: { name: "Operations", sub: "" },
  },
  wh: {
    ru: { name: "Warehouse", sub: "Каталог · склад · кабели" },
    en: { name: "Warehouse", sub: "Catalog · stock · cables" },
    sr: { name: "Warehouse", sub: "Katalog · magacin · kablovi" },
  },
  sup: {
    ru: { name: "Supplies", sub: "" },
    en: { name: "Supplies", sub: "" },
    sr: { name: "Supplies", sub: "" },
  },
  venues: {
    ru: { name: "Venues", sub: "" },
    en: { name: "Venues", sub: "" },
    sr: { name: "Venues", sub: "" },
  },
  plan: {
    ru: { name: "Planning", sub: "" },
    en: { name: "Planning", sub: "" },
    sr: { name: "Planning", sub: "" },
  },
  ctr: {
    ru: { name: "Contractors", sub: "" },
    en: { name: "Contractors", sub: "" },
    sr: { name: "Contractors", sub: "" },
  },
  crew: {
    ru: { name: "Crew", sub: "" },
    en: { name: "Crew", sub: "" },
    sr: { name: "Crew", sub: "" },
  },
  fin: {
    ru: { name: "Finance", sub: "" },
    en: { name: "Finance", sub: "" },
    sr: { name: "Finance", sub: "" },
  },
  adm: {
    ru: { name: "Settings", sub: "" },
    en: { name: "Settings", sub: "" },
    sr: { name: "Settings", sub: "" },
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
