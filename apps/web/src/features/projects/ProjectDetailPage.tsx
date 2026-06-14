import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Projects } from "@sever/contracts";
import { PROJECT_STATUSES } from "@sever/contracts";
import { Card, Button, SectionTitle, StatusBadge, Select, Field, Input, Loading, ErrorState, EmptyState } from "../../ui-kit/index.ts";
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
} from "./hooks.ts";

export function ProjectDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { role } = useSession();
  const canEdit = role === "admin" || role === "warehouse";

  const project = useProject(id);
  const clients = useClients();
  const reservations = useReservations(id);
  const timings = useTimings(id);
  const assignments = useAssignments(id);
  const people = usePeople();
  const models = useEquipmentModels();

  const setStatus = useSetProjectStatus();
  const addReservation = useCreateReservation();
  const addTiming = useAddTiming();
  const addAssignment = useAddAssignment();

  const [resModel, setResModel] = useState("");
  const [resQty, setResQty] = useState("1");
  const [timingTitle, setTimingTitle] = useState("");
  const [assignUser, setAssignUser] = useState("");

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
        {canEdit && (
          <div style={{ marginTop: "var(--space-3)" }}>
            <Select
              value={p.status}
              onChange={(e) => setStatus.mutate({ id: p.id, status: e.target.value as Projects.ProjectStatus })}
              options={PROJECT_STATUSES.map((s) => ({ value: s, label: projectStatusLabel[s] }))}
            />
          </div>
        )}
      </Card>

      {/* Reservations */}
      <SectionTitle>Брони (по часам)</SectionTitle>
      {(reservations.data ?? []).length === 0 ? (
        <EmptyState title="Броней нет" />
      ) : (
        <div className="stack">
          {(reservations.data ?? []).map((r) => (
            <Card key={r.id}>
              <div className="row row--between">
                <p className="card__title">{modelName(r.modelId)} × {r.qty}</p>
                <StatusBadge tone={r.resolvedUnitIds.length ? "ok" : "info"}>
                  {r.resolvedUnitIds.length ? "распределено" : "по модели"}
                </StatusBadge>
              </div>
              <p className="card__subtitle">{dateRange(r.startsAt, r.endsAt)}</p>
            </Card>
          ))}
        </div>
      )}
      {canEdit && (models.data ?? []).length > 0 && (
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
      <Card>
        <Field label="Новый тайминг">
          <Input value={timingTitle} onChange={(e) => setTimingTitle(e.target.value)} placeholder="Монтаж" />
        </Field>
        <Button
          block
          disabled={!timingTitle}
          onClick={() =>
            addTiming.mutate(
              { projectId: p.id, title: timingTitle, startsAt: p.startsAt, endsAt: p.endsAt },
              { onSuccess: () => setTimingTitle("") }
            )
          }
        >
          Добавить тайминг
        </Button>
      </Card>

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
      {canEdit && (people.data ?? []).length > 0 && (
        <Card>
          <div className="row">
            <div style={{ flex: 1 }}>
              <Select
                value={assignUser || (people.data ?? [])[0]?.id || ""}
                onChange={(e) => setAssignUser(e.target.value)}
                options={(people.data ?? []).map((u) => ({ value: u.id, label: u.displayName }))}
              />
            </div>
            <Button
              onClick={() =>
                addAssignment.mutate({ projectId: p.id, userId: assignUser || (people.data ?? [])[0]!.id })
              }
            >
              + В команду
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
