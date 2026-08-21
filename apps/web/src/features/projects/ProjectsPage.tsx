import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button, StatusBadge, Loading, ErrorState, EmptyState, ProjectSearch } from "../../ui-kit/index.ts";
import type { Projects } from "@sever/contracts";
import { projectStatusLabel, projectStatusTone, dateRange } from "../../lib/labels.ts";
import { useSession } from "../../app/session.ts";
import { useProjects, useClients, useProjectVenues } from "./hooks.ts";
import { CreateProjectSheet } from "./components/CreateProjectSheet.tsx";
import { ProjectWizardSheet } from "./components/ProjectWizardSheet.tsx";
import { splitMobileProjects } from "./projectList.ts";
import { useProjectSearch } from "../../lib/useProjectSearch.ts";

type ProjectCardProps = {
  project: NonNullable<ReturnType<typeof useProjects>["data"]>[number];
  clientName: (id: string) => string;
  onOpen: () => void;
};

function ProjectCard({ project, clientName, onOpen }: ProjectCardProps) {
  return (
    <Card onClick={onOpen}>
      <div className="row row--between">
        <div>
          <p className="card__title">{project.name}</p>
          <p className="card__subtitle">{clientName(project.clientId)}</p>
        </div>
        <StatusBadge tone={projectStatusTone[project.status]}>{projectStatusLabel[project.status]}</StatusBadge>
      </div>
      <p className="card__subtitle" style={{ marginTop: "var(--space-2)" }}>
        {dateRange(project.startsAt, project.endsAt)}
      </p>
    </Card>
  );
}

export function ProjectsPage() {
  const { can } = useSession();
  const canCreate = can("projects.manage");
  const navigate = useNavigate();
  const projects = useProjects();
  const clients = useClients();
  const venues = useProjectVenues();
  const [createOpen, setCreateOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Projects.ProjectStatus | "all">("all");
  const allProjects = projects.data ?? [];
  const statusProjects = statusFilter === "all" ? allProjects : allProjects.filter((project) => project.status === statusFilter);
  const search = useProjectSearch(statusProjects, venues.data ?? []);

  if (projects.isLoading) return <Loading />;
  if (projects.error) return <ErrorState error={projects.error} onRetry={projects.refetch} />;

  const clientName = (id: string) => (clients.data ?? []).find((c) => c.id === id)?.name ?? "—";
  const list = search.filteredProjects;
  const mobileProjects = splitMobileProjects(list);
  const filters: (Projects.ProjectStatus | "all")[] = ["all", "draft", "confirmed", "in_progress", "awaiting_payment"];

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

      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        {filters.map((status) => (
          <button
            key={status}
            className={`chip ${statusFilter === status ? "chip--accent chip--solid" : "chip--neutral"}`}
            style={{ border: "none", cursor: "pointer" }}
            onClick={() => setStatusFilter(status)}
          >
            {status === "all" ? "Все" : projectStatusLabel[status]}
          </button>
        ))}
      </div>

      <ProjectSearch open={search.isOpen} query={search.query} onToggle={search.toggle} onQueryChange={search.setQuery} />

      {list.length === 0 ? (
        <EmptyState title={search.query ? "Ничего не найдено" : "Нет проектов"} hint={!search.query && !canCreate ? "Вам пока не назначены проекты" : undefined} />
      ) : (
        <>
        <div className="stack mobile-project-list">
          {mobileProjects.active.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              clientName={clientName}
              onOpen={() => navigate(`/projects/${project.id}`)}
            />
          ))}
          {mobileProjects.archived.length > 0 && (
            <details className="mobile-project-archive">
              <summary>
                <span>Проведённые и отменённые</span>
                <span className="mobile-project-archive__count">{mobileProjects.archived.length}</span>
              </summary>
              <div className="stack mobile-project-archive__list">
                {mobileProjects.archived.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    clientName={clientName}
                    onOpen={() => navigate(`/projects/${project.id}`)}
                  />
                ))}
              </div>
            </details>
          )}
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
              {mobileProjects.active.map((p) => (
                <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)}>
                  <td><strong>{p.name}</strong><small>#{p.id.slice(0, 8)}</small></td>
                  <td>{clientName(p.clientId)}</td>
                  <td className="data-table__mono">{p.startsAt ? new Date(p.startsAt).toLocaleDateString("ru-RU") : "—"}</td>
                  <td className="data-table__mono">{p.endsAt ? new Date(p.endsAt).toLocaleDateString("ru-RU") : "—"}</td>
                  <td><StatusBadge tone={projectStatusTone[p.status]}>{projectStatusLabel[p.status]}</StatusBadge></td>
                  <td className="data-table__arrow">→</td>
                </tr>
              ))}
            </tbody>
          </table>
          {mobileProjects.archived.length > 0 && (
            <details className="mobile-project-archive">
              <summary><span>Проведённые и отменённые</span><span className="mobile-project-archive__count">{mobileProjects.archived.length}</span></summary>
              <table className="data-table">
                <tbody>
                  {mobileProjects.archived.map((p) => (
                    <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)}>
                      <td><strong>{p.name}</strong><small>#{p.id.slice(0, 8)}</small></td>
                      <td>{clientName(p.clientId)}</td>
                      <td className="data-table__mono">{p.startsAt ? new Date(p.startsAt).toLocaleDateString("ru-RU") : "—"}</td>
                      <td className="data-table__mono">{p.endsAt ? new Date(p.endsAt).toLocaleDateString("ru-RU") : "—"}</td>
                      <td><StatusBadge tone={projectStatusTone[p.status]}>{projectStatusLabel[p.status]}</StatusBadge></td>
                      <td className="data-table__arrow">→</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
        </>
      )}

      {canCreate && <CreateProjectSheet open={createOpen} onClose={() => setCreateOpen(false)} />}
      {canCreate && <ProjectWizardSheet open={wizardOpen} onClose={() => setWizardOpen(false)} />}
    </div>
  );
}
