import { useNavigate } from "react-router-dom";
import type { Projects } from "@sever/contracts";
import { Card, Button, SectionHead, Chip, Loading, ErrorState, EmptyState, ProjectSearch } from "../../ui-kit/index.ts";
import { dateRange, projectStatusLabel, projectStatusTone } from "../../lib/labels.ts";
import { useProjectSearch } from "../../lib/useProjectSearch.ts";
import { useMyProjects, useOperationVenues } from "./hooks.ts";
import { MapRouteButton } from "./components/MapRouteButton.tsx";
import { ProjectStageProgress } from "../projects/components/ProjectStageProgress.tsx";
import { projectStagePresentation } from "../../lib/labels.ts";

function isLive(p: Projects.ProjectDTO): boolean {
  const now = Date.now();
  return !!p.startsAt && !!p.endsAt && (p.status === "in_progress" || p.status === "confirmed") && Date.parse(p.startsAt) <= now && Date.parse(p.endsAt) >= now;
}

function operationsProjectSort(a: Projects.ProjectDTO, b: Projects.ProjectDTO): number {
  const aDone = a.status === "completed";
  const bDone = b.status === "completed";
  if (aDone !== bDone) return aDone ? 1 : -1;
  return (a.startsAt ? Date.parse(a.startsAt) : Number.POSITIVE_INFINITY) - (b.startsAt ? Date.parse(b.startsAt) : Number.POSITIVE_INFINITY);
}

export function OperationsPage() {
  const navigate = useNavigate();
  const projects = useMyProjects();
  const venues = useOperationVenues();
  const allProjects = (projects.data ?? [])
    .filter((p) => p.status !== "cancelled")
    .slice()
    .sort(operationsProjectSort);
  const search = useProjectSearch(allProjects, venues.data ?? []);

  if (projects.isLoading) return <Loading />;
  if (projects.error) return <ErrorState error={projects.error} onRetry={projects.refetch} />;

  const list = search.filteredProjects;
  const current = allProjects.find(isLive) ?? null;
  const upcoming = allProjects.filter((p) => !!p.startsAt && Date.parse(p.startsAt) > Date.now() && p.status !== "completed");
  const lead = current ?? upcoming[0] ?? null;
  const venueById = new Map((venues.data ?? []).map((venue) => [venue.id, venue]));
  const leadVenue = lead?.venueId ? venueById.get(lead.venueId) : null;

  return (
    <div className="stack operations-home">
      {lead ? <Card className="operations-live-card" onClick={() => navigate(`/operations/projects/${lead.id}`)}>
        <div className="operations-live-head"><span>{current ? "ТЕКУЩАЯ ОПЕРАЦИЯ" : "БЛИЖАЙШАЯ ОПЕРАЦИЯ"}</span><Chip label={projectStagePresentation[lead.operationStage].label.toLowerCase()} tone="info" /></div>
        <div><p className="operations-live-title">{lead.name}</p>{leadVenue && <div className="operations-live-venue">📍 {[leadVenue.name, leadVenue.address].filter(Boolean).join(" · ")} <MapRouteButton venue={leadVenue} /></div>}</div>
        <ProjectStageProgress stage={lead.operationStage} complete={Boolean(lead.warehouseTurnoverCompletedAt)} />
        <Button block onClick={(event) => { event.stopPropagation(); navigate(`/operations/projects/${lead.id}`); }}>Открыть оборот</Button>
      </Card> : <Card><EmptyState title="Нет проектов в работе" hint="Проект появится здесь после подтверждения в Planning" /><Button block variant="secondary" onClick={() => navigate("/projects")}>Открыть Planning</Button></Card>}

      <ProjectSearch alwaysOpen open={search.isOpen} query={search.query} onToggle={search.toggle} onQueryChange={search.setQuery} />
      <SectionHead label="Мои проекты" meta={search.query ? `${list.length} из ${allProjects.length}` : `${list.length}`} />
      {list.length === 0 ? (
        <EmptyState title={search.query ? "Ничего не найдено" : "Вам пока не назначены проекты"} />
      ) : (
        <div className="card operations-project-list">
          {list.map((p) => (
            <button className="operations-project-row" key={p.id} onClick={() => navigate(`/operations/projects/${p.id}`)}>
              <div className="row row--between">
                <div style={{ minWidth: 0 }}>
                  <p className="card__title">{p.name}</p>
                  <p className="card__subtitle">{dateRange(p.startsAt, p.endsAt)}</p>
                  {p.venueId && venueById.get(p.venueId) && <div className="row" style={{ gap: 6 }}><p className="card__subtitle" style={{ minWidth: 0 }}>📍 {[venueById.get(p.venueId)?.name, venueById.get(p.venueId)?.address].filter(Boolean).join(" · ")}</p><MapRouteButton venue={venueById.get(p.venueId)!} /></div>}
                </div>
                <Chip label={p.warehouseTurnoverCompletedAt ? "завершён" : projectStagePresentation[p.operationStage].label.toLowerCase()} tone={p.warehouseTurnoverCompletedAt ? "ok" : projectStatusTone[p.status]} />
              </div>
              <span className="more-chevron">›</span>
            </button>
          ))}
        </div>
      )}

    </div>
  );
}
