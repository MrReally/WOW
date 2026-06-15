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
  { id: "ops", name: "Operations", glyph: "radar", tone: "info", route: "/apex", requires: ["operations.view"], sub: "Текущие и предстоящие прокаты" },
  { id: "wh", name: "Warehouse", glyph: "box", tone: "warn", route: "/warehouse", requires: ["warehouse.view"], sub: "Каталог · выдача · возврат" },
  { id: "plan", name: "Planning", glyph: "rows", tone: "purple", route: "/projects", requires: ["projects.view"], sub: "Проекты · брони · команда" },
  { id: "fin", name: "Finance", glyph: "coin", tone: "ok", route: "/finance", requires: ["finance.view"], sub: "Счета · долги · окупаемость" },
  { id: "adm", name: "Admin", glyph: "shield", tone: "alert", route: "/settings", requires: ["people.view", "people.manage", "roles.manage"], sub: "Люди · роли · права · курсы" },
];

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
