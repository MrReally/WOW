import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Projects } from "@sever/contracts";
import { Card, Button, SectionHead, Chip, Dot, VenueTrace, Loading, ErrorState, EmptyState } from "../../ui-kit/index.ts";
import { dateRange, projectStatusLabel, projectStatusTone } from "../../lib/labels.ts";
import { useSession } from "../../app/session.ts";
import { OpsSheet } from "../warehouse/components/OpsSheet.tsx";
import { useMyProjects, useOpsModels } from "./hooks.ts";

function isLive(p: Projects.ProjectDTO): boolean {
  const now = Date.now();
  return (p.status === "in_progress" || p.status === "confirmed") && Date.parse(p.startsAt) <= now && Date.parse(p.endsAt) >= now;
}

function operationsProjectSort(a: Projects.ProjectDTO, b: Projects.ProjectDTO): number {
  const aDone = a.status === "completed";
  const bDone = b.status === "completed";
  if (aDone !== bDone) return aDone ? 1 : -1;
  return Date.parse(a.startsAt) - Date.parse(b.startsAt);
}

export function OperationsPage() {
  const { can } = useSession();
  const navigate = useNavigate();
  const projects = useMyProjects();
  const models = useOpsModels();
  const [opsOpen, setOpsOpen] = useState(false);

  if (projects.isLoading) return <Loading />;
  if (projects.error) return <ErrorState error={projects.error} onRetry={projects.refetch} />;

  const list = (projects.data ?? [])
    .filter((p) => p.status !== "cancelled")
    .slice()
    .sort(operationsProjectSort);
  const current = list.find(isLive) ?? null;
  const upcoming = list.filter((p) => Date.parse(p.startsAt) > Date.now() && p.status !== "completed");
  const lead = current ?? upcoming[0] ?? null;

  return (
    <div>
      <div style={{ position: "relative", padding: "6px 4px 16px", overflow: "hidden" }}>
        <VenueTrace width={186} height={140} style={{ position: "absolute", right: -28, top: -6, opacity: 0.5, pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <div className="row" style={{ gap: 8 }}>
            <Dot tone={current ? "ok" : "warn"} glow />
            <span className="t-label">{current ? "ТЕКУЩАЯ ОПЕРАЦИЯ" : "БЛИЖАЙШАЯ ОПЕРАЦИЯ"}</span>
          </div>
          <div className="t-cond" style={{ fontSize: 34, fontWeight: 800, color: "var(--text)", lineHeight: 0.98, marginTop: 8 }}>
            {lead ? lead.name : "Нет назначенных операций"}
          </div>
          {lead && <div className="t-mono" style={{ fontSize: 12, color: "var(--text3)", marginTop: 6 }}>{dateRange(lead.startsAt, lead.endsAt)}</div>}
        </div>
      </div>

      {can("warehouse.issue") && (
        <div style={{ marginBottom: 12 }}>
          <Button block variant="primary" onClick={() => setOpsOpen(true)}>+ Перемещение</Button>
        </div>
      )}

      <SectionHead label="Мои проекты" meta={`${list.length}`} />
      {list.length === 0 ? (
        <EmptyState title="Вам пока не назначены проекты" />
      ) : (
        <div className="stack">
          {list.map((p) => (
            <Card key={p.id} onClick={() => navigate(`/operations/projects/${p.id}`)}>
              <div className="row row--between">
                <div style={{ minWidth: 0 }}>
                  <p className="card__title">{p.name}</p>
                  <p className="card__subtitle">{dateRange(p.startsAt, p.endsAt)}</p>
                </div>
                <Chip label={projectStatusLabel[p.status]} tone={projectStatusTone[p.status]} />
              </div>
            </Card>
          ))}
        </div>
      )}

      <OpsSheet open={opsOpen} onClose={() => setOpsOpen(false)} projects={list} models={models.data ?? []} />
    </div>
  );
}
