import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { Role } from "@sever/contracts";
import { useSession } from "../session.ts";
import "./shell.css";

interface NavEntry {
  to: string;
  label: string;
  icon: string;
  roles: Role[];
}

const NAV: NavEntry[] = [
  { to: "/apex", label: "Apex", icon: "🛰", roles: ["admin", "warehouse"] },
  { to: "/warehouse", label: "Склад", icon: "📦", roles: ["admin", "warehouse", "tech"] },
  { to: "/projects", label: "Проекты", icon: "🎬", roles: ["admin", "warehouse", "tech"] },
  { to: "/finance", label: "Финансы", icon: "💶", roles: ["admin"] },
  { to: "/settings", label: "Настройки", icon: "⚙️", roles: ["admin"] },
];

const TITLES: Record<string, string> = {
  apex: "Apex — диспетчер",
  warehouse: "Склад",
  projects: "Проекты",
  finance: "Финансы",
  settings: "Настройки",
};

export function AppShell({ children }: { children: ReactNode }) {
  const { user, role } = useSession();
  const location = useLocation();
  const section = location.pathname.split("/")[1] ?? "apex";
  const items = NAV.filter((n) => (role ? n.roles.includes(role) : false));

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="app-header__title">{TITLES[section] ?? "SEVER"}</h1>
          {user && (
            <div className="app-header__sub">
              {user.displayName} ·{" "}
              {role === "admin" ? "Админ" : role === "warehouse" ? "Склад" : "Монтажник"}
            </div>
          )}
        </div>
      </header>

      <main className="app-content">{children}</main>

      <nav className="bottom-nav">
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) => `nav-item ${isActive ? "nav-item--active" : ""}`}
          >
            <span className="nav-item__icon">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
