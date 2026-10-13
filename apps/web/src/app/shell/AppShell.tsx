import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { People, Projects } from "@sever/contracts";
import { WSChip, WSGlyph, Avatar, BrandLogo, SeverStar, ActionIcon } from "../../ui-kit/index.ts";
import { useSession } from "../session.ts";
import { currentWorkspace, workspacesFor, WORKSPACE_COPY } from "../workspaces.ts";
import { useI18n } from "../i18n.tsx";
import { platform } from "../platform/telegram.ts";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher.tsx";
import { NotificationsBell } from "../../features/notifications/NotificationsBell.tsx";
import { api } from "../../lib/api.ts";
import { personInitials, personName } from "../../lib/people.ts";
import { useTheme } from "../theme.tsx";
import { GlobalSearch } from "../../features/search/GlobalSearch.tsx";
import { useNavigationMeta } from "./useNavigationMeta.ts";
import { projectStagePresentation } from "../../lib/labels.ts";
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
  const { theme } = useTheme();
  const navigationMeta = useNavigationMeta(location.pathname, locale);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

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
  const operationProjects = useQuery({
    enabled: can("operations.view"),
    queryKey: ["projects", "mine"],
    queryFn: () => api.get<Projects.ProjectDTO[]>("/api/projects?mine=true"),
  });
  const operationsBadge = (operationProjects.data ?? []).filter((project) => project.status === "in_progress").length;
  const activeOperation = (operationProjects.data ?? []).find((project) => project.status === "in_progress");
  const navigationSubtitle = location.pathname === "/operations" && activeOperation
    ? `Сейчас · ${projectStagePresentation[activeOperation.operationStage].label}`
    : navigationMeta.subtitle;

  // On a detail screen (a path deeper than a workspace root), show Telegram's
  // native back button.
  const isDetail = navigationMeta.detail;
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

  const primaryWorkspaceIds = ["apex", "ops", "plan", "wh"];
  const primaryWorkspaces = primaryWorkspaceIds
    .map((id) => availableWorkspaces.find((workspace) => workspace.id === id))
    .filter((workspace): workspace is NonNullable<typeof workspace> => Boolean(workspace));
  const moreActive = location.pathname === "/more" || !primaryWorkspaceIds.includes(ws.id);
  const workspacePill = location.pathname === "/more" ? "Аккаунт" : wsCopy.name;

  return (
    <div className="app-shell sever" data-theme={theme}>
      <div className="sever-wallpaper" aria-hidden="true">
        <i /><i /><i /><i />
      </div>
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
        <div className="mobile-nav-leading">
          {isDetail ? (
            <button className="mobile-back" onClick={() => navigate(-1)} aria-label="Назад">
              <span aria-hidden="true">‹</span>
              <span>{navigationMeta.backLabel}</span>
            </button>
          ) : (
            <button className="mobile-wordmark" onClick={() => setSwitcherOpen(true)} aria-label={t("workspace.current")}>
              <SeverStar size={26} />
              <strong>SEVER</strong>
              <span className="mobile-workspace-pill">{workspacePill}<span aria-hidden="true">⌄</span></span>
            </button>
          )}
        </div>
        {isDetail && <div className="mobile-nav-title">{navigationMeta.title}</div>}
        <button className="ws-bar__id desktop-workspace-id" aria-label={t("workspace.current")} onClick={() => setSwitcherOpen(true)}>
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
          <div className="row ws-bar__actions" style={{ gap: 8 }}>
            <div className="desktop-context">
              <span className="desktop-context__eyebrow">SEVER / {wsCopy.name}</span>
              <strong>{wsCopy.sub}</strong>
            </div>
            <button className="nav-icon-button mobile-search-button" onClick={() => setSearchOpen(true)} aria-label="Поиск">
              <ActionIcon name="search" />
            </button>
            <NotificationsBell />
            <button
              onClick={() => navigate("/me")}
              className={`profile-trigger ${isDetail ? "profile-trigger--detail" : ""}`}
              aria-label={t("app.mySettings")}
            >
              <Avatar initials={personInitials(user)} src={user.usePhotoAsAvatar ? user.photoUrl : null} size={36} />
            </button>
          </div>
        )}
      </header>

      <main className="app-content">
        {!isDetail && (
          <div className="workspace-large-title">
            <p>{navigationSubtitle}</p>
            <h1>{navigationMeta.title}</h1>
          </div>
        )}
        {children}
      </main>

      <nav className="mobile-tabbar" aria-label={t("common.workspaces")}>
        {primaryWorkspaces.map((workspace) => {
          const copy = WORKSPACE_COPY[workspace.id]?.[locale] ?? workspace;
          const active = location.pathname !== "/more" && workspace.id === ws.id;
          const shortLabel = workspace.id === "wh" && locale === "ru" ? "Склад" : copy.name;
          return (
            <button
              key={workspace.id}
              className={`mobile-tabbar__item ${active ? "mobile-tabbar__item--active" : ""}`}
              onClick={() => navigate(workspace.route)}
              aria-current={active ? "page" : undefined}
            >
              <WSGlyph type={workspace.glyph} size={24} />
              <span>{shortLabel}</span>
              {workspace.id === "ops" && operationsBadge > 0 && <b className="mobile-tabbar__badge">{operationsBadge > 9 ? "9+" : operationsBadge}</b>}
            </button>
          );
        })}
        <button
          className={`mobile-tabbar__item ${moreActive ? "mobile-tabbar__item--active" : ""}`}
          onClick={() => navigate("/more")}
        >
          <ActionIcon name="more" />
          <span>{locale === "ru" ? "Ещё" : "More"}</span>
        </button>
      </nav>
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
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function homeRoute(workspaces: ReturnType<typeof workspacesFor>): string {
  return workspaces[0]?.route ?? "/apex";
}
