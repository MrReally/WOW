import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Projects } from "@sever/contracts";
import { PROJECT_STATUSES } from "@sever/contracts";
import { Card, Button, SectionTitle, StatusBadge, Chip, Select, Field, Input, Loading, ErrorState, EmptyState } from "../../ui-kit/index.ts";
import { projectStatusLabel, projectStatusTone, dateRange, dateTime } from "../../lib/labels.ts";
import { useSession } from "../../app/session.ts";
import {
  useProject,
  useClients,
  useReservations,
  useTimings,
  useAssignments,
  usePeople,
  useEquipmentModels,
  useSetProjectStatus,
  useCreateReservation,
  useAddTiming,
  useAddAssignment,
  useIssueResolvedUnits,
  useAllUnits,
} from "./hooks.ts";
import { ResolveReservationSheet } from "./components/ResolveReservationSheet.tsx";
import { EditProjectSheet } from "./components/EditProjectSheet.tsx";
import { toLocalInput, isoFromLocal } from "../../lib/datetime.ts";

export function ProjectDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { can } = useSession();
  const canManage = can("projects.manage");
  const canReserve = can("projects.reservation.manage");
  const canIssue = can("warehouse.issue");
  const canTiming = can("projects.timing.manage");
  const canAssign = can("projects.assignment.manage");
  const canPlans = can("plans.view");

  const project = useProject(id);
  const clients = useClients();
  const reservations = useReservations(id);
  const timings = useTimings(id);
  const assignments = useAssignments(id);
  const people = usePeople();
  const models = useEquipmentModels();
  const allUnits = useAllUnits();

  const setStatus = useSetProjectStatus();
  const addReservation = useCreateReservation();
  const addTiming = useAddTiming();
  const addAssignment = useAddAssignment();
  const issueResolved = useIssueResolvedUnits();

  const [resModel, setResModel] = useState("");
  const [resQty, setResQty] = useState("1");
  const [timingTitle, setTimingTitle] = useState("");
  const [timingStart, setTimingStart] = useState("");
  const [timingEnd, setTimingEnd] = useState("");
  const [assignUser, setAssignUser] = useState("");
  const [resolving, setResolving] = useState<Projects.ReservationDTO | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  if (project.isLoading) return <Loading />;
  if (project.error) return <ErrorState error={project.error} onRetry={project.refetch} />;
  if (!project.data) return null;
  const p = project.data;

  const clientName = (cid: string) => (clients.data ?? []).find((c) => c.id === cid)?.name ?? "—";
  const modelName = (mid: string) => (models.data ?? []).find((m) => m.id === mid)?.name ?? mid;
  const userName = (uid: string) => (people.data ?? []).find((u) => u.id === uid)?.displayName ?? uid;

  return (
    <div className="stack">
      <Button variant="ghost" onClick={() => navigate(-1)}>← Назад</Button>

      <Card>
        <div className="row row--between">
          <div>
            <p className="card__title" style={{ fontSize: "var(--fs-lg)" }}>{p.name}</p>
            <p className="card__subtitle">{clientName(p.clientId)}</p>
          </div>
          <StatusBadge tone={projectStatusTone[p.status]}>{projectStatusLabel[p.status]}</StatusBadge>
        </div>
        <p className="card__subtitle" style={{ marginTop: "var(--space-2)" }}>{dateRange(p.startsAt, p.endsAt)}</p>
        {canManage && (
          <div className="row" style={{ marginTop: "var(--space-3)" }}>
            <div style={{ flex: 1 }}>
              <Select
                value={p.status}
                onChange={(e) => setStatus.mutate({ id: p.id, status: e.target.value as Projects.ProjectStatus })}
                options={PROJECT_STATUSES.map((s) => ({ value: s, label: projectStatusLabel[s] }))}
              />
            </div>
            <Button variant="secondary" onClick={() => setEditOpen(true)}>Редактировать</Button>
          </div>
        )}
      </Card>

      {canPlans && (
        <Button variant="secondary" block onClick={() => navigate(`/projects/${p.id}/plan`)}>
          🎛 Технический план сцены
        </Button>
      )}

      {/* Reservations */}
      <SectionTitle>Брони (по часам)</SectionTitle>
      {(reservations.data ?? []).length === 0 ? (
        <EmptyState title="Броней нет" />
      ) : (
        <div className="stack">
          {(reservations.data ?? []).map((r) => {
            const resolved = r.resolvedUnitIds.length > 0;
            const unit = (uid: string) => (allUnits.data ?? []).find((u) => u.id === uid);
            const unitTag = (uid: string) => unit(uid)?.assetTag ?? uid.slice(0, 6);
            const issued =
              resolved && r.resolvedUnitIds.every((uid) => {
                const u = unit(uid);
                return u && u.status === "on_project" && u.currentProjectId === p.id;
              });
            return (
              <Card key={r.id}>
                <div className="row row--between">
                  <p className="card__title">{modelName(r.modelId)} × {r.qty}</p>
                  <StatusBadge tone={issued ? "warn" : resolved ? "ok" : "info"}>
                    {issued ? "выдано" : resolved ? "распределено" : "по модели"}
                  </StatusBadge>
                </div>
                <p className="card__subtitle">{dateRange(r.startsAt, r.endsAt)}</p>
                {resolved && (
                  <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {r.resolvedUnitIds.map((uid) => (
                      <Chip key={uid} label={unitTag(uid)} tone={issued ? "warn" : "neutral"} />
                    ))}
                  </div>
                )}
                {(canReserve || canIssue) && (
                  <div className="row" style={{ marginTop: 10 }}>
                    {canReserve && (
                      <Button variant="secondary" block disabled={issued} onClick={() => setResolving(r)}>
                        {resolved ? "Изменить состав" : "Распределить"}
                      </Button>
                    )}
                    {resolved && canIssue &&
                      (issued ? (
                        <Button block variant="ghost" disabled>
                          ✓ Выдано
                        </Button>
                      ) : (
                        <Button
                          block
                          disabled={issueResolved.isPending}
                          onClick={() => issueResolved.mutate({ projectId: p.id, unitIds: r.resolvedUnitIds })}
                        >
                          Выдать
                        </Button>
                      ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {canReserve && (models.data ?? []).length > 0 && (
        <Card>
          <div className="row">
            <div style={{ flex: 2 }}>
              <Select
                value={resModel || (models.data ?? [])[0]?.id || ""}
                onChange={(e) => setResModel(e.target.value)}
                options={(models.data ?? []).map((m) => ({ value: m.id, label: m.name }))}
              />
            </div>
            <div style={{ width: 80 }}>
              <Input type="number" value={resQty} onChange={(e) => setResQty(e.target.value)} />
            </div>
            <Button
              onClick={() =>
                addReservation.mutate({
                  projectId: p.id,
                  modelId: resModel || (models.data ?? [])[0]!.id,
                  qty: Number(resQty),
                  startsAt: p.startsAt,
                  endsAt: p.endsAt,
                })
              }
            >
              + Бронь
            </Button>
          </div>
        </Card>
      )}

      {/* Timings */}
      <SectionTitle>Тайминги</SectionTitle>
      {(timings.data ?? []).length === 0 ? (
        <EmptyState title="Таймингов нет" />
      ) : (
        <div className="stack">
          {(timings.data ?? []).map((t) => (
            <Card key={t.id}>
              <p className="card__title">{t.title}</p>
              <p className="card__subtitle">{dateTime(t.startsAt)} – {dateTime(t.endsAt)}</p>
            </Card>
          ))}
        </div>
      )}
      {canTiming && (() => {
        const tStart = timingStart || toLocalInput(p.startsAt);
        const tEnd = timingEnd || toLocalInput(p.endsAt);
        const validRange = new Date(tEnd).getTime() > new Date(tStart).getTime();
        return (
          <Card>
            <Field label="Название (доставка / монтаж / демонтаж…)">
              <Input value={timingTitle} onChange={(e) => setTimingTitle(e.target.value)} placeholder="Монтаж" />
            </Field>
            <div className="row">
              <Field label="Начало">
                <Input type="datetime-local" value={tStart} onChange={(e) => setTimingStart(e.target.value)} />
              </Field>
              <Field label="Конец">
                <Input type="datetime-local" value={tEnd} onChange={(e) => setTimingEnd(e.target.value)} />
              </Field>
            </div>
            {!validRange && <p className="card__subtitle" style={{ color: "var(--alert)" }}>Конец должен быть позже начала</p>}
            <Button
              block
              disabled={!timingTitle || !validRange || addTiming.isPending}
              onClick={() =>
                addTiming.mutate(
                  { projectId: p.id, title: timingTitle, startsAt: isoFromLocal(tStart), endsAt: isoFromLocal(tEnd) },
                  { onSuccess: () => { setTimingTitle(""); setTimingStart(""); setTimingEnd(""); } }
                )
              }
            >
              Добавить тайминг
            </Button>
          </Card>
        );
      })()}

      {/* Assignments */}
      <SectionTitle>Команда</SectionTitle>
      {(assignments.data ?? []).length === 0 ? (
        <EmptyState title="Никто не назначен" />
      ) : (
        <div className="stack">
          {(assignments.data ?? []).map((a) => (
            <Card key={a.id}>
              <div className="row row--between">
                <p className="card__title">{userName(a.userId)}</p>
                {a.roleNote && <span className="card__subtitle">{a.roleNote}</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {canAssign && (() => {
        const assignedIds = new Set((assignments.data ?? []).map((a) => a.userId));
        const available = (people.data ?? []).filter((u) => !assignedIds.has(u.id));
        if (available.length === 0) {
          return <p className="card__subtitle" style={{ textAlign: "center", padding: 12 }}>Все доступные люди назначены</p>;
        }
        const sel = assignUser && available.some((u) => u.id === assignUser) ? assignUser : available[0]!.id;
        return (
          <Card>
            <div className="row">
              <div style={{ flex: 1 }}>
                <Select value={sel} onChange={(e) => setAssignUser(e.target.value)} options={available.map((u) => ({ value: u.id, label: u.displayName }))} />
              </div>
              <Button disabled={addAssignment.isPending} onClick={() => addAssignment.mutate({ projectId: p.id, userId: sel }, { onSuccess: () => setAssignUser("") })}>
                + В команду
              </Button>
            </div>
          </Card>
        );
      })()}

      <ResolveReservationSheet
        reservation={resolving}
        modelName={resolving ? modelName(resolving.modelId) : ""}
        onClose={() => setResolving(null)}
      />
      <EditProjectSheet open={editOpen} project={p} clients={clients.data ?? []} onClose={() => setEditOpen(false)} />
    </div>
  );
}
