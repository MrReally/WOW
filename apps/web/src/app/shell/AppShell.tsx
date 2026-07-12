import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { People } from "@sever/contracts";
import { WSChip, Avatar, BrandLogo } from "../../ui-kit/index.ts";
import { useSession } from "../session.ts";
import { currentWorkspace, workspacesFor, WORKSPACE_COPY } from "../workspaces.ts";
import { useI18n } from "../i18n.tsx";
import { platform } from "../platform/telegram.ts";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher.tsx";
import { NotificationsBell } from "../../features/notifications/NotificationsBell.tsx";
import { api } from "../../lib/api.ts";
import { personInitials, personName } from "../../lib/people.ts";
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
  const availableWorkspaces = workspacesFor(can);
  const count = availableWorkspaces.length;
  const canReviewApplications = can("people.applications.review", "people.manage");
  const applications = useQuery({
    enabled: canReviewApplications,
    queryKey: ["crew-applications", "pending"],
    queryFn: () => api.get<People.CrewApplicationDTO[]>("/api/crew-applications?status=pending"),
  });
  const crewApplicationsCount = applications.data?.length ?? 0;

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
      <aside className="desktop-sidebar">
        <button className="desktop-brand" onClick={() => navigate(homeRoute(availableWorkspaces))} aria-label="SEVER">
          <BrandLogo size={28} color="var(--text)" />
          <span>SEVER</span>
          <small>ERP</small>
        </button>
        {can("backoffice.access") && (
          <button className="desktop-backoffice-link" onClick={() => navigate("/backoffice")}>
            <strong>Backoffice</strong>
            <small>Desktop ERP режим</small>
          </button>
        )}
        <nav className="desktop-nav" aria-label={t("common.workspaces")}>
          {availableWorkspaces.map((workspace) => {
            const copy = WORKSPACE_COPY[workspace.id]?.[locale] ?? workspace;
            const active = workspace.id === ws.id;
            return (
              <button
                key={workspace.id}
                className={`desktop-nav__item ${active ? "desktop-nav__item--active" : ""}`}
                onClick={() => navigate(workspace.route)}
                aria-current={active ? "page" : undefined}
              >
                <WSChip glyph={workspace.glyph} tone={workspace.tone} size={32} />
                <span className="desktop-nav__copy">
                  <strong>{copy.name}</strong>
                  <small>{copy.sub}</small>
                </span>
                <kbd>⇧{workspace.shortcut}</kbd>
              </button>
            );
          })}
        </nav>
        {user && (
          <button className="desktop-profile" onClick={() => navigate("/me")}>
            <Avatar initials={personInitials(user)} src={user.usePhotoAsAvatar ? user.photoUrl : null} size={34} />
            <span>
              <strong>{personName(user)}</strong>
              <small>{t("app.mySettings")}</small>
            </span>
          </button>
        )}
      </aside>

      <div className="app-workspace">
      <header className="ws-bar">
        <button className="ws-bar__id" aria-label={t("workspace.current")} onClick={() => setSwitcherOpen(true)}>
          <WSChip glyph={ws.glyph} tone={ws.tone} size={40} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span className="ws-bar__name">{wsCopy.name}</span>
              {ws.id === "crew" && crewApplicationsCount > 0 && (
                <span className="project-tabbar__badge" style={{ position: "static" }}>{crewApplicationsCount > 9 ? "9+" : crewApplicationsCount}</span>
              )}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="var(--text3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="ws-bar__sub">{count} {locale === "ru" ? "workspaces" : t("common.workspaces")}</span>
          </div>
        </button>
        {user && (
          <div className="row" style={{ gap: 10 }}>
            <div className="desktop-context">
              <span className="desktop-context__eyebrow">SEVER / {wsCopy.name}</span>
              <strong>{wsCopy.sub}</strong>
            </div>
            <NotificationsBell />
            <button
              onClick={() => navigate("/me")}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
              aria-label={t("app.mySettings")}
            >
              <Avatar initials={personInitials(user)} src={user.usePhotoAsAvatar ? user.photoUrl : null} size={36} />
            </button>
          </div>
        )}
      </header>

      <main className="app-content">{children}</main>
      </div>

      {user && (
        <WorkspaceSwitcher
          open={switcherOpen}
          onClose={() => setSwitcherOpen(false)}
          user={user}
          current={ws}
          crewApplicationsCount={crewApplicationsCount}
        />
      )}
    </div>
  );
}

function homeRoute(workspaces: ReturnType<typeof workspacesFor>): string {
  return workspaces[0]?.route ?? "/apex";
}
