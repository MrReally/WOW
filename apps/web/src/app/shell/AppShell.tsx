import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { WSChip, Avatar } from "../../ui-kit/index.ts";
import { useSession } from "../session.ts";
import { currentWorkspace, workspacesFor, initialsOf } from "../workspaces.ts";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher.tsx";
import "./shell.css";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, role } = useSession();
  const location = useLocation();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const ws = currentWorkspace(location.pathname);
  const count = workspacesFor(role).length;

  return (
    <div className="app-shell">
      <header className="ws-bar">
        <button className="ws-bar__id" aria-label="Сменить workspace" onClick={() => setSwitcherOpen(true)}>
          <WSChip glyph={ws.glyph} tone={ws.tone} size={40} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span className="ws-bar__name">{ws.name}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="var(--text3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="ws-bar__sub">{count} workspaces</span>
          </div>
        </button>
        {user && (
          <button
            onClick={() => setSwitcherOpen(true)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
            aria-label="Аккаунт"
          >
            <Avatar initials={initialsOf(user.displayName)} size={36} />
          </button>
        )}
      </header>

      <main className="app-content">{children}</main>

      {user && (
        <WorkspaceSwitcher
          open={switcherOpen}
          onClose={() => setSwitcherOpen(false)}
          user={user}
          current={ws}
        />
      )}
    </div>
  );
}
