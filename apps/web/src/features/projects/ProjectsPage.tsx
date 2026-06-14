import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button, StatusBadge, Loading, ErrorState, EmptyState } from "../../ui-kit/index.ts";
import { projectStatusLabel, projectStatusTone, dateRange } from "../../lib/labels.ts";
import { useSession } from "../../app/session.ts";
import { useProjects, useClients } from "./hooks.ts";
import { CreateProjectSheet } from "./components/CreateProjectSheet.tsx";

export function ProjectsPage() {
  const { role } = useSession();
  const canCreate = role === "admin" || role === "warehouse";
  const navigate = useNavigate();
  const projects = useProjects();
  const clients = useClients();
  const [createOpen, setCreateOpen] = useState(false);

  if (projects.isLoading) return <Loading />;
  if (projects.error) return <ErrorState error={projects.error} onRetry={projects.refetch} />;

  const clientName = (id: string) => (clients.data ?? []).find((c) => c.id === id)?.name ?? "—";
  const list = projects.data ?? [];

  return (
    <div className="stack">
      {canCreate && <Button block onClick={() => setCreateOpen(true)}>+ Новый проект</Button>}

      {list.length === 0 ? (
        <EmptyState title="Нет проектов" hint={role === "tech" ? "Вам пока не назначены проекты" : undefined} />
      ) : (
        <div className="stack">
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
      )}

      {canCreate && <CreateProjectSheet open={createOpen} onClose={() => setCreateOpen(false)} />}
    </div>
  );
}
