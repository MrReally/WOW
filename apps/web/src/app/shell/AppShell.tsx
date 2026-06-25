import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { WSChip, Avatar } from "../../ui-kit/index.ts";
import { useSession } from "../session.ts";
import { currentWorkspace, workspacesFor, initialsOf, WORKSPACE_COPY } from "../workspaces.ts";
import { useI18n } from "../i18n.tsx";
import { platform } from "../platform/telegram.ts";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher.tsx";
import { NotificationsBell } from "../../features/notifications/NotificationsBell.tsx";
import "./shell.css";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, can } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const ws = currentWorkspace(location.pathname);
  const wsCopy = WORKSPACE_COPY[ws.id]?.[locale] ?? ws;
  const count = workspacesFor(can).length;

  // On a detail screen (a path deeper than a workspace root), show Telegram's
  // native back button.
  const isDetail = location.pathname !== ws.route;
  useEffect(() => platform.backButton(isDetail, () => navigate(-1)), [isDetail, navigate]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.repeat || isTypingTarget(event.target)) return;
      const key = event.key.toUpperCase();
      const target = workspacesFor(can).find((workspace) => workspace.shortcut === key);
      if (!target || location.pathname === target.route) return;
      event.preventDefault();
      setSwitcherOpen(false);
      navigate(target.route);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [can, location.pathname, navigate]);

  return (
    <div className="app-shell">
      <header className="ws-bar">
        <button className="ws-bar__id" aria-label={t("workspace.current")} onClick={() => setSwitcherOpen(true)}>
          <WSChip glyph={ws.glyph} tone={ws.tone} size={40} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span className="ws-bar__name">{wsCopy.name}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="var(--text3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="ws-bar__sub">{count} {locale === "ru" ? "workspaces" : t("common.workspaces")}</span>
          </div>
        </button>
        {user && (
          <div className="row" style={{ gap: 10 }}>
            <NotificationsBell />
            <button
              onClick={() => navigate("/me")}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
              aria-label={t("app.mySettings")}
            >
              <Avatar initials={initialsOf(user.displayName)} size={36} />
            </button>
          </div>
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
