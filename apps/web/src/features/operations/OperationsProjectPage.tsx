import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Projects } from "@sever/contracts";
import { Button, Card, Chip, EmptyState, ErrorState, Input, Loading, SectionHead, Select, WSGlyph } from "../../ui-kit/index.ts";
import { dateRange, dateTime, projectStatusLabel, projectStatusTone } from "../../lib/labels.ts";
import { useSession } from "../../app/session.ts";
import { usePeople, useProject } from "../projects/hooks.ts";
import {
  useCreateChecklistItem,
  useCreateProjectTask,
  useDeleteChecklistItem,
  useDeleteProjectTask,
  useProjectChecklist,
  useProjectTasks,
  useProjectTimings,
  useUpdateChecklistItem,
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
  const canManage = can("projects.timing.manage", "projects.manage");
  const canListPeople = can("people.view");

  if (project.isLoading) return <Loading />;
  if (project.error) return <ErrorState error={project.error} onRetry={project.refetch} />;
  if (!project.data) return <EmptyState title="Проект не найден" />;

  const activeTiming = currentTiming(timings.data ?? []);

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

      <TaskBoard projectId={id} canManage={canManage} canListPeople={canListPeople} userId={user?.id ?? null} />
      <Checklist projectId={id} canManage={canManage} />
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

function Checklist({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const checklist = useProjectChecklist(projectId);
  const createItem = useCreateChecklistItem(projectId);
  const updateItem = useUpdateChecklistItem(projectId);
  const deleteItem = useDeleteChecklistItem(projectId);
  const [titleByStage, setTitleByStage] = useState<Record<string, string>>({});
  const list = checklist.data ?? [];
  const done = list.filter((i) => i.done).length;

  const add = (group: Projects.ProjectChecklistGroup) => {
    const clean = (titleByStage[group] ?? "").trim();
    if (!clean) return;
    createItem.mutate({ group, title: clean }, { onSuccess: () => setTitleByStage((prev) => ({ ...prev, [group]: "" })) });
  };

  return (
    <>
      <SectionHead label="Этапы" meta={`${done}/${list.length}`} />
      <div className="stack">
        {checklist.isLoading ? (
          <Loading />
        ) : checklist.error ? (
          <ErrorState error={checklist.error} onRetry={checklist.refetch} />
        ) : (
          stageOrder.map((group) => {
            const items = list.filter((i) => i.group === group);
            const value = titleByStage[group] ?? "";
            return (
              <Card key={group}>
                <div className="row row--between">
                  <p className="card__title">{stageLabel[group]}</p>
                  <Chip label={`${items.filter((i) => i.done).length}/${items.length}`} tone={items.length > 0 && items.every((i) => i.done) ? "ok" : "neutral"} />
                </div>
                <div className="stack" style={{ marginTop: 10 }}>
                  {items.map((item) => (
                    <div key={item.id} className="row row--between">
                      <button
                        className={`icon-btn ${item.done ? "icon-btn--ok" : ""}`}
                        title={item.done ? "Готово" : "Отметить"}
                        aria-label={item.done ? "Готово" : "Отметить"}
                        disabled={updateItem.isPending}
                        onClick={() => updateItem.mutate({ id: item.id, input: { done: !item.done } })}
                      >
                        {item.done ? "✓" : <WSGlyph type="rows" size={18} />}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="card__title" style={{ fontSize: 16, textDecoration: item.done ? "line-through" : undefined }}>{item.title}</p>
                        {item.doneAt && <p className="card__subtitle">{dateTime(item.doneAt)}</p>}
                      </div>
                      {canManage && (
                        <button className="icon-btn icon-btn--danger" aria-label="Удалить" title="Удалить" disabled={deleteItem.isPending} onClick={() => deleteItem.mutate(item.id)}>
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {canManage && (
                    <CompactAdd
                      value={value}
                      placeholder="Новый пункт"
                      disabled={!value.trim() || createItem.isPending}
                      onValue={(next) => setTitleByStage((prev) => ({ ...prev, [group]: next }))}
                      onAdd={() => add(group)}
                    />
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </>
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
