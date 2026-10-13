import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Avatar, Card, SectionHead, WSChip } from "../../ui-kit/index.ts";
import { api, clearToken } from "../../lib/api.ts";
import { personInitials, personName } from "../../lib/people.ts";
import { useSession } from "../../app/session.ts";
import { useI18n } from "../../app/i18n.tsx";
import { workspacesFor, WORKSPACE_COPY } from "../../app/workspaces.ts";
import { NotificationsBell } from "../notifications/NotificationsBell.tsx";

export function MorePage() {
  const { user, can } = useSession();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaces = workspacesFor(can).filter((workspace) => !["apex", "ops", "plan", "wh"].includes(workspace.id));

  const logout = async () => {
    try {
      await api.post("/api/auth/logout", {});
    } catch {
      // A local logout still succeeds if the server session is already gone.
    }
    clearToken();
    queryClient.clear();
    window.location.assign("/");
  };

  return (
    <div className="stack more-page">
      {user && (
        <Card onClick={() => navigate("/me")}>
          <div className="more-profile-row">
            <Avatar initials={personInitials(user)} src={user.usePhotoAsAvatar ? user.photoUrl : null} size={52} />
            <div className="more-row-copy">
              <strong>{personName(user)}</strong>
              <small>{user.roleName} · {user.email}</small>
            </div>
            <span className="more-chevron" aria-hidden="true">›</span>
          </div>
        </Card>
      )}

      <section>
        <SectionHead label="Workspaces" />
        <div className="card more-list">
          {workspaces.map((workspace, index) => {
            const copy = WORKSPACE_COPY[workspace.id]?.[locale] ?? workspace;
            return (
              <button key={workspace.id} className="more-list-row" onClick={() => navigate(workspace.route)}>
                <WSChip glyph={workspace.glyph} tone={workspace.tone} size={40} />
                <span className="more-row-copy"><strong>{copy.name}</strong><small>{copy.sub}</small></span>
                <span className="more-chevron" aria-hidden="true">›</span>
                {index < workspaces.length - 1 && <i aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </section>

      <div className="card more-list">
        <NotificationsBell variant="row" />
        <button className="more-list-row" onClick={() => navigate("/me")}><span className="more-row-copy"><strong>Мои настройки</strong></span><span className="more-chevron">›</span><i /></button>
        {can("backoffice.access") && <button className="more-list-row" onClick={() => navigate("/backoffice")}><span className="more-row-copy"><strong>Backoffice</strong><small>Вход в desktop/backoffice ERP-режим</small></span><span className="more-chevron">›</span><i /></button>}
        <button className="more-list-row more-list-row--danger" onClick={logout}><span className="more-row-copy"><strong>Выйти</strong></span></button>
      </div>
    </div>
  );
}
