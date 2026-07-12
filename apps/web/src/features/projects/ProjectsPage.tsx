import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button, StatusBadge, Loading, ErrorState, EmptyState } from "../../ui-kit/index.ts";
import { projectStatusLabel, projectStatusTone, dateRange } from "../../lib/labels.ts";
import { useSession } from "../../app/session.ts";
import { useProjects, useClients } from "./hooks.ts";
import { CreateProjectSheet } from "./components/CreateProjectSheet.tsx";
import { ProjectWizardSheet } from "./components/ProjectWizardSheet.tsx";

export function ProjectsPage() {
  const { can } = useSession();
  const canCreate = can("projects.manage");
  const navigate = useNavigate();
  const projects = useProjects();
  const clients = useClients();
  const [createOpen, setCreateOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  if (projects.isLoading) return <Loading />;
  if (projects.error) return <ErrorState error={projects.error} onRetry={projects.refetch} />;

  const clientName = (id: string) => (clients.data ?? []).find((c) => c.id === id)?.name ?? "—";
  const list = projects.data ?? [];

  return (
    <div className="stack">
      {canCreate && (
        <div className="page-toolbar">
          <div className="page-toolbar__title">
            <span className="t-label">PLANNING · ПРОЕКТЫ</span>
            <strong>Рабочий журнал</strong>
            <small>{list.length} проектов · сроки, клиенты и текущий статус</small>
          </div>
          <div className="row">
            <Button block onClick={() => setWizardOpen(true)}>Мастер проекта</Button>
            <Button block variant="secondary" onClick={() => setCreateOpen(true)}>+ Проект</Button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState title="Нет проектов" hint={!canCreate ? "Вам пока не назначены проекты" : undefined} />
      ) : (
        <>
        <div className="stack mobile-project-list">
          {list.map((p) => (
            <Card key={p.id} onClick={() => navigate(`/projects/${p.id}`)}>
              <div className="row row--between">
                <div>
                  <p className="card__title">{p.name}</p>
                  <p className="card__subtitle">{clientName(p.clientId)}</p>
                </div>
                <StatusBadge tone={projectStatusTone[p.status]}>{projectStatusLabel[p.status]}</StatusBadge>
              </div>
              <p className="card__subtitle" style={{ marginTop: "var(--space-2)" }}>
                {dateRange(p.startsAt, p.endsAt)}
              </p>
            </Card>
          ))}
        </div>
        <div className="data-table-wrap desktop-project-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Проект</th>
                <th>Клиент</th>
                <th>Начало</th>
                <th>Окончание</th>
                <th>Статус</th>
                <th aria-label="Открыть" />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)}>
                  <td><strong>{p.name}</strong><small>#{p.id.slice(0, 8)}</small></td>
                  <td>{clientName(p.clientId)}</td>
                  <td className="data-table__mono">{new Date(p.startsAt).toLocaleDateString("ru-RU")}</td>
                  <td className="data-table__mono">{new Date(p.endsAt).toLocaleDateString("ru-RU")}</td>
                  <td><StatusBadge tone={projectStatusTone[p.status]}>{projectStatusLabel[p.status]}</StatusBadge></td>
                  <td className="data-table__arrow">→</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {canCreate && <CreateProjectSheet open={createOpen} onClose={() => setCreateOpen(false)} />}
      {canCreate && <ProjectWizardSheet open={wizardOpen} onClose={() => setWizardOpen(false)} />}
    </div>
  );
}
