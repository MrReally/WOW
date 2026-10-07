import { useNavigate } from "react-router-dom";
import type { Projects } from "@sever/contracts";
import { Card, SectionHead, Chip, Dot, VenueTrace, Loading, ErrorState, EmptyState, ProjectSearch } from "../../ui-kit/index.ts";
import { dateRange, projectStatusLabel, projectStatusTone } from "../../lib/labels.ts";
import { useProjectSearch } from "../../lib/useProjectSearch.ts";
import { useMyProjects, useOperationVenues } from "./hooks.ts";
import { MapRouteButton } from "./components/MapRouteButton.tsx";

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
          {leadVenue && <div className="row" style={{ gap: 6, marginTop: 4 }}><div className="t-mono" style={{ minWidth: 0, fontSize: 12, color: "var(--text2)" }}>📍 {[leadVenue.name, leadVenue.address].filter(Boolean).join(" · ")}</div><MapRouteButton venue={leadVenue} /></div>}
        </div>
      </div>

      <ProjectSearch open={search.isOpen} query={search.query} onToggle={search.toggle} onQueryChange={search.setQuery} />
      <SectionHead label="Мои проекты" meta={search.query ? `${list.length} из ${allProjects.length}` : `${list.length}`} />
      {list.length === 0 ? (
        <EmptyState title={search.query ? "Ничего не найдено" : "Вам пока не назначены проекты"} />
      ) : (
        <div className="stack">
          {list.map((p) => (
            <Card key={p.id} onClick={() => navigate(`/operations/projects/${p.id}`)}>
              <div className="row row--between">
                <div style={{ minWidth: 0 }}>
                  <p className="card__title">{p.name}</p>
                  <p className="card__subtitle">{dateRange(p.startsAt, p.endsAt)}</p>
                  {p.venueId && venueById.get(p.venueId) && <div className="row" style={{ gap: 6 }}><p className="card__subtitle" style={{ minWidth: 0 }}>📍 {[venueById.get(p.venueId)?.name, venueById.get(p.venueId)?.address].filter(Boolean).join(" · ")}</p><MapRouteButton venue={venueById.get(p.venueId)!} /></div>}
                </div>
                <Chip label={projectStatusLabel[p.status]} tone={projectStatusTone[p.status]} />
              </div>
            </Card>
          ))}
        </div>
      )}

    </div>
  );
}
