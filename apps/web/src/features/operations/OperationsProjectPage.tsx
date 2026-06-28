import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Equipment, Projects } from "@sever/contracts";
import { Button, Card, Chip, EmptyState, ErrorState, Input, Loading, SectionHead, Select, WSGlyph } from "../../ui-kit/index.ts";
import { dateRange, dateTime, projectStatusLabel, projectStatusTone } from "../../lib/labels.ts";
import { useSession } from "../../app/session.ts";
import { useAllUnits, useEquipmentModels, usePeople, useProject, useReservations } from "../projects/hooks.ts";
import { useChangeStatus, useWarehouses } from "../warehouse/hooks.ts";
import {
  useClearOperationUnitMark,
  useCreateProjectTask,
  useDeleteProjectTask,
  useOperationEvents,
  useOperationUnitMarks,
  useProjectTasks,
  useProjectTimings,
  useSetOperationStage,
  useSetOperationUnitMark,
  useUpdateProjectTask,
} from "./hooks.ts";

const stageOrder: Projects.ProjectChecklistGroup[] = ["prep", "pickup", "delivery", "mount", "show", "dismantle", "return"];

const stageLabel: Record<Projects.ProjectChecklistGroup, string> = {
  prep: "Подготовка",
  pickup: "Забор",
  delivery: "Доставка",
  mount: "Монтаж",
  show: "Событие",
  dismantle: "Демонтаж",
  return: "Возврат",
};

const taskStatusLabel: Record<Projects.ProjectTaskStatus, string> = {
  todo: "Нужно",
  in_progress: "В работе",
  done: "Готово",
};

const markLabel: Record<Projects.OperationUnitMarkStatus, string> = {
  ready: "готово",
  packed: "сложено",
  picked: "забрано",
  missing: "нет",
  left: "оставлено",
  delivered: "на месте",
  mounted: "монтаж",
  collected: "собрано",
  broken: "ремонт",
  lost: "утеря",
  returned: "склад",
};

const stageMarkActions: Partial<Record<Projects.ProjectChecklistGroup, { status: Projects.OperationUnitMarkStatus; label: string; tone?: "ok" | "warn" | "danger" }[]>> = {
  prep: [
    { status: "ready", label: "✓", tone: "ok" },
    { status: "packed", label: "▣", tone: "ok" },
  ],
  pickup: [
    { status: "picked", label: "✓", tone: "ok" },
    { status: "missing", label: "?", tone: "warn" },
    { status: "left", label: "–", tone: "warn" },
  ],
  delivery: [
    { status: "delivered", label: "✓", tone: "ok" },
  ],
  mount: [
    { status: "mounted", label: "✓", tone: "ok" },
  ],
  dismantle: [
    { status: "collected", label: "✓", tone: "ok" },
    { status: "broken", label: "!", tone: "warn" },
    { status: "lost", label: "×", tone: "danger" },
  ],
  return: [
    { status: "returned", label: "✓", tone: "ok" },
  ],
};

function nextStage(stage: Projects.ProjectChecklistGroup): Projects.ProjectChecklistGroup | null {
  const i = stageOrder.indexOf(stage);
  return i >= 0 && i < stageOrder.length - 1 ? stageOrder[i + 1]! : null;
}

function previousStage(stage: Projects.ProjectChecklistGroup): Projects.ProjectChecklistGroup | null {
  const i = stageOrder.indexOf(stage);
  return i > 0 ? stageOrder[i - 1]! : null;
}

function currentTiming(list: Projects.TimingDTO[]) {
  const now = Date.now();
  return list.find((t) => Date.parse(t.startsAt) <= now && Date.parse(t.endsAt) >= now) ?? list.find((t) => Date.parse(t.startsAt) > now) ?? null;
}

export function OperationsProjectPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { can, user } = useSession();
  const project = useProject(id);
  const timings = useProjectTimings(id);
  const events = useOperationEvents(id);
  const setStage = useSetOperationStage(id);
  const canManage = can("projects.timing.manage", "projects.manage");
  const canStepBack = can("operations.stage.back", "projects.timing.manage", "projects.manage");
  const canListPeople = can("people.view");

  if (project.isLoading) return <Loading />;
  if (project.error) return <ErrorState error={project.error} onRetry={project.refetch} />;
  if (!project.data) return <EmptyState title="Проект не найден" />;

  const activeTiming = currentTiming(timings.data ?? []);
  const activeStage = project.data.operationStage ?? "prep";
  const upcomingStage = nextStage(activeStage);
  const rollbackStage = previousStage(activeStage);

  return (
    <div className="stack">
      <Button variant="ghost" onClick={() => navigate("/operations")}>← Operations</Button>

      <Card>
        <div className="row row--between">
          <div style={{ minWidth: 0 }}>
            <p className="card__title">{project.data.name}</p>
            <p className="card__subtitle">{dateRange(project.data.startsAt, project.data.endsAt)}</p>
          </div>
          <Chip label={projectStatusLabel[project.data.status]} tone={projectStatusTone[project.data.status]} />
        </div>
      </Card>

      <SectionHead label="Сейчас" />
      {activeTiming ? (
        <Card>
          <p className="card__title">{activeTiming.title}</p>
          <p className="card__subtitle">{dateTime(activeTiming.startsAt)} → {dateTime(activeTiming.endsAt)}</p>
        </Card>
      ) : (
        <EmptyState title="Тайминга нет" />
      )}

      <div className="row">
        <Button block variant="secondary" onClick={() => navigate(`/projects/${id}/plan`)}>Схема</Button>
        <Button block variant="secondary" onClick={() => navigate(`/projects/${id}`)}>Проект</Button>
      </div>

      <SectionHead label="Этап" />
      <Card>
        <div className="row row--between">
          <div style={{ minWidth: 0 }}>
            <p className="card__title">{stageLabel[activeStage]}</p>
            <p className="card__subtitle">{upcomingStage ? `Дальше: ${stageLabel[upcomingStage]}` : "Финальный этап"}</p>
          </div>
          <Chip label={`${stageOrder.indexOf(activeStage) + 1}/${stageOrder.length}`} tone="accent" />
        </div>
        {(rollbackStage && canStepBack) || upcomingStage ? (
          <div className="row" style={{ marginTop: 12 }}>
            {rollbackStage && canStepBack && (
              <Button
                block
                variant="secondary"
                disabled={setStage.isPending}
                onClick={() => setStage.mutate(rollbackStage)}
              >
                Назад · {stageLabel[rollbackStage]}
              </Button>
            )}
            {upcomingStage && (
              <Button
                block
                variant="primary"
                disabled={setStage.isPending}
                onClick={() => setStage.mutate(upcomingStage)}
              >
                Далее · {stageLabel[upcomingStage]}
              </Button>
            )}
          </div>
        ) : null}
      </Card>

      <StageEquipmentPanel projectId={id} stage={activeStage} />
      <TaskBoard projectId={id} canManage={canManage} canListPeople={canListPeople} userId={user?.id ?? null} />
      <StageHistory events={events.data ?? []} />
    </div>
  );
}

function StageHistory({ events }: { events: Projects.ProjectOperationEventDTO[] }) {
  if (events.length === 0) return null;
  return (
    <>
      <SectionHead label="История" meta={`${events.length}`} />
      <Card>
        <div className="stack">
          {events.slice(0, 5).map((event) => (
            <div key={event.id} className="row row--between">
              <div style={{ minWidth: 0 }}>
                <p className="card__title" style={{ fontSize: 15 }}>
                  {event.fromStage ? `${stageLabel[event.fromStage]} → ${stageLabel[event.toStage]}` : stageLabel[event.toStage]}
                </p>
                <p className="card__subtitle">{dateTime(event.createdAt)}</p>
              </div>
              <Chip label="этап" tone="neutral" />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function StageEquipmentPanel({ projectId, stage }: { projectId: string; stage: Projects.ProjectChecklistGroup }) {
  const navigate = useNavigate();
  const { can } = useSession();
  const reservations = useReservations(projectId);
  const models = useEquipmentModels();
  const units = useAllUnits();
  const warehouses = useWarehouses();
  const marks = useOperationUnitMarks(projectId);
  const setMark = useSetOperationUnitMark(projectId);
  const clearMark = useClearOperationUnitMark(projectId);
  const changeStatus = useChangeStatus();
  const canMarkStatus = can("warehouse.unit.status");
  const shouldShow = stage !== "show";
  if (!shouldShow) return null;

  const modelName = (modelId: string) => models.data?.find((m) => m.id === modelId)?.name ?? modelId;
  const unitById = new Map((units.data ?? []).map((unit) => [unit.id, unit]));
  const marksByUnit = new Map<string, Projects.OperationUnitMarkDTO[]>();
  for (const mark of (marks.data ?? []).filter((item) => item.stage === stage)) {
    if (!marksByUnit.has(mark.unitId)) marksByUnit.set(mark.unitId, []);
    marksByUnit.get(mark.unitId)!.push(mark);
  }
  const warehouseName = (warehouseId: string | null | undefined) =>
    (warehouses.data ?? []).find((w) => w.id === warehouseId)?.name ?? "Склад ?";
  const resolved = (reservations.data ?? []).flatMap((reservation) =>
    reservation.resolvedUnitIds.map((unitId) => ({ reservation, unit: unitById.get(unitId) }))
  );
  const byWarehouse = new Map<string, { warehouseId: string | null; rows: typeof resolved }>();
  for (const row of resolved) {
    const key = row.unit?.warehouseId ?? "none";
    if (!byWarehouse.has(key)) byWarehouse.set(key, { warehouseId: row.unit?.warehouseId ?? null, rows: [] });
    byWarehouse.get(key)!.rows.push(row);
  }
  const unresolved = (reservations.data ?? []).filter((reservation) => reservation.resolvedUnitIds.length < reservation.qty);
  const title =
    stage === "return"
      ? "Вернуть"
      : stage === "dismantle"
        ? "Собрать"
        : stage === "mount"
          ? "Монтаж"
          : stage === "delivery"
            ? "Доставка"
            : stage === "pickup"
              ? "Забрать"
              : "Подготовить";
  const actions = stageMarkActions[stage] ?? [];
  const markUnit = (unitId: string, status: Projects.OperationUnitMarkStatus, active: boolean) => {
    if (active) {
      clearMark.mutate({ stage, unitId, status });
      return;
    }
    setMark.mutate({ stage, unitId, status });
    if (status === "broken" && canMarkStatus) {
      changeStatus.mutate({ id: unitId, status: "in_repair", note: `Демонтаж · ${projectId}` });
    }
    if (status === "lost" && canMarkStatus) {
      changeStatus.mutate({ id: unitId, status: "lost", note: `Демонтаж · ${projectId}` });
    }
  };

  return (
    <>
      <SectionHead label="По приборам" meta={title} />
      <div className="stack">
        {reservations.isLoading || models.isLoading || units.isLoading || warehouses.isLoading || marks.isLoading ? (
          <Loading />
        ) : marks.error ? (
          <ErrorState error={marks.error} onRetry={marks.refetch} />
        ) : resolved.length === 0 && unresolved.length === 0 ? (
          <EmptyState title="Список пуст" />
        ) : (
          <>
            {[...byWarehouse.values()].map((group) => (
              <Card key={group.warehouseId ?? "none"}>
                <div className="row row--between">
                  <p className="card__title">{warehouseName(group.warehouseId)}</p>
                  <Chip label={`${group.rows.length}`} tone="neutral" />
                </div>
                <div className="stack" style={{ marginTop: 10 }}>
                  {group.rows.map(({ reservation, unit }) => (
                    <UnitStageRow
                      key={`${reservation.id}:${unit?.id ?? "missing"}`}
                      unit={unit}
                      modelName={modelName(reservation.modelId)}
                      marks={unit ? (marksByUnit.get(unit.id) ?? []) : []}
                      actions={actions}
                      disabled={setMark.isPending || clearMark.isPending || changeStatus.isPending}
                      onOpen={() => unit && navigate(`/warehouse/units/${unit.id}`, { state: { from: `/operations/projects/${projectId}` } })}
                      onMark={(status, active) => unit && markUnit(unit.id, status, active)}
                    />
                  ))}
                </div>
              </Card>
            ))}
            {unresolved.length > 0 && (
              <Card>
                <div className="row row--between">
                  <p className="card__title">Не распределено</p>
                  <Chip label={`${unresolved.length}`} tone="warn" />
                </div>
                <div className="stack" style={{ marginTop: 10 }}>
                  {unresolved.map((reservation) => (
                    <div key={reservation.id} className="row row--between">
                      <div style={{ minWidth: 0 }}>
                        <p className="card__title" style={{ fontSize: 16 }}>{modelName(reservation.modelId)}</p>
                        <p className="card__subtitle">{reservation.resolvedUnitIds.length}/{reservation.qty}</p>
                      </div>
                      <Chip label="резерв" tone="warn" />
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}

function UnitStageRow({
  unit,
  modelName,
  marks,
  actions,
  disabled,
  onOpen,
  onMark,
}: {
  unit: Equipment.EquipmentUnitDTO | undefined;
  modelName: string;
  marks: Projects.OperationUnitMarkDTO[];
  actions: { status: Projects.OperationUnitMarkStatus; label: string; tone?: "ok" | "warn" | "danger" }[];
  disabled: boolean;
  onOpen: () => void;
  onMark: (status: Projects.OperationUnitMarkStatus, active: boolean) => void;
}) {
  const activeStatuses = new Set(marks.map((mark) => mark.status));
  const markText = marks.length > 0 ? marks.map((mark) => markLabel[mark.status]).join(" · ") : "не отмечено";
  const hasProblem = marks.some((mark) => mark.status === "lost" || mark.status === "broken" || mark.status === "missing" || mark.status === "left");
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row row--between" style={{ width: "100%", gap: 8 }}>
        <button
          style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", color: "inherit", padding: 0, textAlign: "left", cursor: unit ? "pointer" : "default" }}
          disabled={!unit}
          onClick={onOpen}
        >
          <p className="card__title" style={{ fontSize: 16 }}>{unit?.assetTag ?? "Не найдено"}</p>
          <p className="card__subtitle">{modelName}</p>
        </button>
        <Chip label={markText} tone={marks.length > 0 ? (hasProblem ? "warn" : "ok") : "neutral"} />
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {unit && actions.map((action) => {
          const active = activeStatuses.has(action.status);
          return (
            <button
              key={action.status}
              className={`chip ${active ? "chip--accent chip--solid" : action.tone === "danger" ? "chip--danger" : action.tone === "ok" ? "chip--ok" : "chip--neutral"}`}
              style={{ border: "none", cursor: "pointer" }}
              aria-label={active ? `Снять: ${markLabel[action.status]}` : markLabel[action.status]}
              title={active ? `Снять: ${markLabel[action.status]}` : markLabel[action.status]}
              disabled={disabled}
              onClick={() => onMark(action.status, active)}
            >
              {action.label} {markLabel[action.status]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TaskBoard({
  projectId,
  canManage,
  canListPeople,
  userId,
}: {
  projectId: string;
  canManage: boolean;
  canListPeople: boolean;
  userId: string | null;
}) {
  const timings = useProjectTimings(projectId);
  const tasks = useProjectTasks(projectId);
  const people = usePeople(canManage && canListPeople);
  const createTask = useCreateProjectTask(projectId);
  const updateTask = useUpdateProjectTask(projectId);
  const deleteTask = useDeleteProjectTask(projectId);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [timingId, setTimingId] = useState("");
  const [pick, setPick] = useState<"person" | "time" | null>(null);
  const timingMap = useMemo(() => new Map((timings.data ?? []).map((t) => [t.id, t])), [timings.data]);
  const list = tasks.data ?? [];
  const open = list.filter((t) => t.status !== "done");
  const done = list.filter((t) => t.status === "done");

  const add = () => {
    const clean = title.trim();
    if (!clean) return;
    createTask.mutate(
      { title: clean, assigneeId: assigneeId || null, timingId: timingId || null },
      { onSuccess: () => { setTitle(""); setAssigneeId(""); setTimingId(""); setPick(null); } }
    );
  };

  return (
    <>
      <SectionHead label="Задачи" meta={`${open.length}`} />
      <div className="stack">
        {canManage && (
          <CompactAdd
            value={title}
            placeholder="Новая задача"
            disabled={!title.trim() || createTask.isPending}
            pick={pick}
            onPick={setPick}
            onValue={setTitle}
            onAdd={add}
            personSlot={
              <Select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                options={[
                  { value: "", label: "Любой" },
                  ...(userId ? [{ value: userId, label: "Я" }] : []),
                  ...((people.data ?? []).filter((p) => p.id !== userId).map((p) => ({ value: p.id, label: p.nickname || p.displayName }))),
                ]}
              />
            }
            timeSlot={
              <Select
                value={timingId}
                onChange={(e) => setTimingId(e.target.value)}
                options={[
                  { value: "", label: "Без события" },
                  ...((timings.data ?? []).map((t) => ({ value: t.id, label: t.title }))),
                ]}
              />
            }
          />
        )}
        {tasks.isLoading ? (
          <Loading />
        ) : tasks.error ? (
          <ErrorState error={tasks.error} onRetry={tasks.refetch} />
        ) : list.length === 0 ? (
          <EmptyState title="Задач нет" />
        ) : (
          <>
            <TaskList items={open} timingMap={timingMap} canManage={canManage} updateTask={updateTask} deleteTask={deleteTask} />
            {done.length > 0 && <TaskList items={done.slice(0, 4)} timingMap={timingMap} canManage={canManage} updateTask={updateTask} deleteTask={deleteTask} />}
          </>
        )}
      </div>
    </>
  );
}

function TaskList({
  items,
  timingMap,
  canManage,
  updateTask,
  deleteTask,
}: {
  items: Projects.ProjectTaskDTO[];
  timingMap: Map<string, Projects.TimingDTO>;
  canManage: boolean;
  updateTask: ReturnType<typeof useUpdateProjectTask>;
  deleteTask: ReturnType<typeof useDeleteProjectTask>;
}) {
  const nextStatus = (status: Projects.ProjectTaskStatus): Projects.ProjectTaskStatus =>
    status === "todo" ? "in_progress" : status === "in_progress" ? "done" : "todo";
  return (
    <div className="stack">
      {items.map((task) => {
        const timing = task.timingId ? timingMap.get(task.timingId) : null;
        return (
          <Card key={task.id}>
            <div className="row row--between" style={{ alignItems: "flex-start" }}>
              <button
                className={`icon-btn ${task.status === "done" ? "icon-btn--ok" : ""}`}
                title={taskStatusLabel[task.status]}
                aria-label={taskStatusLabel[task.status]}
                disabled={updateTask.isPending}
                onClick={() => updateTask.mutate({ id: task.id, input: { status: nextStatus(task.status) } })}
              >
                {task.status === "done" ? "✓" : task.status === "in_progress" ? "…" : "○"}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="card__title" style={{ textDecoration: task.status === "done" ? "line-through" : undefined }}>{task.title}</p>
                <p className="card__subtitle">{timing ? timing.title : "Без события"}</p>
              </div>
              {canManage && (
                <button className="icon-btn icon-btn--danger" aria-label="Удалить" title="Удалить" disabled={deleteTask.isPending} onClick={() => deleteTask.mutate(task.id)}>
                  ×
                </button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function CompactAdd({
  value,
  placeholder,
  disabled,
  pick,
  personSlot,
  timeSlot,
  onPick,
  onValue,
  onAdd,
}: {
  value: string;
  placeholder: string;
  disabled: boolean;
  pick?: "person" | "time" | null;
  personSlot?: ReactNode;
  timeSlot?: ReactNode;
  onPick?: (pick: "person" | "time" | null) => void;
  onValue: (value: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 6 }}>
        <Input
          value={value}
          onChange={(e) => onValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !disabled) onAdd(); }}
          placeholder={placeholder}
          style={{ height: 42 }}
        />
        {personSlot && (
          <button className="icon-btn" aria-label="Назначить" title="Назначить" onClick={() => onPick?.(pick === "person" ? null : "person")}>
            <WSGlyph type="person" size={18} />
          </button>
        )}
        {timeSlot && (
          <button className="icon-btn" aria-label="Событие" title="Событие" onClick={() => onPick?.(pick === "time" ? null : "time")}>
            <WSGlyph type="rows" size={18} />
          </button>
        )}
        <button className="icon-btn icon-btn--ok" aria-label="Добавить" title="Добавить" disabled={disabled} onClick={onAdd}>
          +
        </button>
      </div>
      {pick === "person" && personSlot}
      {pick === "time" && timeSlot}
    </div>
  );
}
