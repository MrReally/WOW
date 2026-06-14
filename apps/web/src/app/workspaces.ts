import type { Role } from "@sever/contracts";
import type { Glyph, Tone } from "../ui-kit/index.ts";

// The v2 design reframes navigation around "workspaces": role-gated areas the
// user switches between, instead of fixed bottom-nav tabs. Each maps to an
// existing feature route — purely presentation/navigation, no data changes.

export interface Workspace {
  id: string;
  name: string; // product-style English name (as in the design)
  glyph: Glyph;
  tone: Tone;
  route: string;
  roles: Role[];
  sub: string; // localized one-liner
}

export const WORKSPACES: Workspace[] = [
  { id: "ops", name: "Operations", glyph: "radar", tone: "info", route: "/apex", roles: ["admin", "warehouse", "tech"], sub: "Текущие и предстоящие прокаты" },
  { id: "wh", name: "Warehouse", glyph: "box", tone: "warn", route: "/warehouse", roles: ["admin", "warehouse", "tech"], sub: "Каталог · выдача · возврат" },
  { id: "plan", name: "Planning", glyph: "rows", tone: "purple", route: "/projects", roles: ["admin", "warehouse", "tech"], sub: "Проекты · брони · команда" },
  { id: "fin", name: "Finance", glyph: "coin", tone: "ok", route: "/finance", roles: ["admin"], sub: "Счета · долги · окупаемость" },
  { id: "adm", name: "Admin", glyph: "shield", tone: "alert", route: "/settings", roles: ["admin"], sub: "Люди · роли · курсы валют" },
];

export function workspacesFor(role: Role | null): Workspace[] {
  if (!role) return [];
  return WORKSPACES.filter((w) => w.roles.includes(role));
}

export function currentWorkspace(pathname: string): Workspace {
  const match = WORKSPACES.find((w) => pathname === w.route || pathname.startsWith(w.route + "/"));
  return match ?? WORKSPACES[0]!;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "·";
}
