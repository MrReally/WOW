import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Projects } from "@sever/contracts";
import {
  Card,
  Button,
  SectionHead,
  Chip,
  Dot,
  VenueTrace,
  Loading,
  ErrorState,
  EmptyState,
  Field,
  Input,
  Select,
  WSGlyph,
} from "../../ui-kit/index.ts";
import { dateRange, dateTime, projectStatusLabel, projectStatusTone } from "../../lib/labels.ts";
import { useSession } from "../../app/session.ts";
import { usePeople } from "../projects/hooks.ts";
import { OpsSheet } from "../warehouse/components/OpsSheet.tsx";
import {
  useCreateChecklistItem,
  useCreateProjectTask,
  useDeleteChecklistItem,
  useDeleteProjectTask,
  useMyProjects,
  useOpsModels,
  useProjectChecklist,
  useProjectTasks,
  useProjectTimings,
  useUpdateChecklistItem,
  useUpdateProjectTask,
} from "./hooks.ts";

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
  const { can, user } = useSession();
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
  const upcoming = list.filter((p) => Date.parse(p.startsAt) > Date.now() && p.status !== "cancelled" && p.status !== "completed");
  const lead = current ?? upcoming[0] ?? null;

  return (
    <div>
      {/* Current operation hero */}
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

      {lead && (
        <OperationHub
          project={lead}
          canManage={can("projects.timing.manage", "projects.manage")}
          canListPeople={can("people.view")}
          userId={user?.id ?? null}
        />
      )}

      <SectionHead label="Мои проекты" meta={`${list.length}`} />
      {list.length === 0 ? (
        <EmptyState title="Вам пока не назначены проекты" hint="Назначения делает менеджер в Planning" />
      ) : (
        <div className="stack">
          {list.map((p) => (
            <Card key={p.id} onClick={() => navigate(`/projects/${p.id}`)}>
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

      {lead && (
        <>
          <SectionHead label="Быстро" />
          <div className="row">
            <Button block variant="secondary" onClick={() => navigate(`/projects/${lead.id}/plan`)}>
              Схема
            </Button>
            <Button block variant="secondary" onClick={() => navigate(`/projects/${lead.id}`)}>
              Проект
            </Button>
          </div>
        </>
      )}

      <OpsSheet open={opsOpen} onClose={() => setOpsOpen(false)} projects={list} models={models.data ?? []} />
    </div>
  );
}

function OperationHub({
  project,
  canManage,
  canListPeople,
  userId,
}: {
  project: Projects.ProjectDTO;
  canManage: boolean;
  canListPeople: boolean;
  userId: string | null;
}) {
  return (
    <>
      <Timings projectId={project.id} />
      <TaskBoard projectId={project.id} canManage={canManage} canListPeople={canListPeople} userId={userId} />
      <Checklist projectId={project.id} canManage={canManage} />
    </>
  );
}

function Timings({ projectId }: { projectId: string }) {
  const timings = useProjectTimings(projectId);
  const list = timings.data ?? [];
  if (list.length === 0) return null;
  const now = Date.now();
  const current = list.find((t) => Date.parse(t.startsAt) <= now && Date.parse(t.endsAt) >= now);
  const next = list.find((t) => Date.parse(t.startsAt) > now);
  return (
    <>
      <SectionHead label="Сейчас" meta={current ? "live" : next ? "next" : "done"} />
      <div className="stack">
        {(current ?? next) ? (
          <Card>
            <div className="row row--between">
              <div style={{ minWidth: 0 }}>
                <p className="card__title">{(current ?? next)!.title}</p>
                <p className="card__subtitle">{dateTime((current ?? next)!.startsAt)} → {dateTime((current ?? next)!.endsAt)}</p>
              </div>
              <Chip label={current ? "сейчас" : "дальше"} tone={current ? "ok" : "info"} />
            </div>
          </Card>
        ) : (
          <Card>
            <p className="card__title">Тайминг завершён</p>
            <p className="card__subtitle">{list.length} событий</p>
          </Card>
        )}
      </div>
    </>
  );
}

const taskStatusLabel: Record<Projects.ProjectTaskStatus, string> = {
  todo: "Нужно",
  in_progress: "В работе",
  done: "Готово",
};

const checklistLabels: Record<Projects.ProjectChecklistGroup, string> = {
  mount: "Монтаж",
  show: "Шоу",
  dismantle: "Демонтаж",
  return: "Возврат",
};

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
  const timingMap = new Map((timings.data ?? []).map((t) => [t.id, t]));
  const now = Date.now();
  const list = tasks.data ?? [];
  const open = list.filter((t) => t.status !== "done");
  const overdue = open.filter((t) => {
    const timing = t.timingId ? timingMap.get(t.timingId) : null;
    return timing ? Date.parse(timing.endsAt) < now : false;
  });
  const current = open.filter((t) => {
    const timing = t.timingId ? timingMap.get(t.timingId) : null;
    return timing ? Date.parse(timing.startsAt) <= now && Date.parse(timing.endsAt) >= now : false;
  });
  const next = open.filter((t) => !overdue.includes(t) && !current.includes(t));
  const done = list.filter((t) => t.status === "done").slice(0, 3);

  const add = () => {
    const clean = title.trim();
    if (!clean) return;
    createTask.mutate(
      {
        title: clean,
        assigneeId: assigneeId || null,
        timingId: timingId || null,
      },
      { onSuccess: () => { setTitle(""); setAssigneeId(""); setTimingId(""); } }
    );
  };

  return (
    <>
      <SectionHead label="Задачи" meta={`${open.length}`} />
      <div className="stack">
        {canManage && (
          <Card>
            <div className="stack">
              <Field label="Новая задача">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Что сделать" />
              </Field>
              <div className="row">
                <Field label="Кто">
                  <Select
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    options={[
                      { value: "", label: "Любой" },
                      ...(userId ? [{ value: userId, label: "Я" }] : []),
                      ...((people.data ?? [])
                        .filter((p) => p.id !== userId)
                        .map((p) => ({ value: p.id, label: p.nickname || p.displayName }))),
                    ]}
                  />
                </Field>
                <Field label="Когда">
                  <Select
                    value={timingId}
                    onChange={(e) => setTimingId(e.target.value)}
                    options={[
                      { value: "", label: "Без тайминга" },
                      ...((timings.data ?? []).map((t) => ({ value: t.id, label: t.title }))),
                    ]}
                  />
                </Field>
              </div>
              <Button block disabled={!title.trim() || createTask.isPending} onClick={add}>+ Задача</Button>
            </div>
          </Card>
        )}

        {tasks.isLoading ? (
          <Loading />
        ) : tasks.error ? (
          <ErrorState error={tasks.error} onRetry={tasks.refetch} />
        ) : list.length === 0 ? (
          <EmptyState title="Задач пока нет" />
        ) : (
          <>
            <TaskGroup label="Просрочено" tone="danger" items={overdue} timingMap={timingMap} canManage={canManage} updateTask={updateTask} deleteTask={deleteTask} />
            <TaskGroup label="Сейчас" tone="ok" items={current} timingMap={timingMap} canManage={canManage} updateTask={updateTask} deleteTask={deleteTask} />
            <TaskGroup label="Дальше" tone="info" items={next} timingMap={timingMap} canManage={canManage} updateTask={updateTask} deleteTask={deleteTask} />
            {done.length > 0 && <TaskGroup label="Готово" tone="neutral" items={done} timingMap={timingMap} canManage={canManage} updateTask={updateTask} deleteTask={deleteTask} />}
          </>
        )}
      </div>
    </>
  );
}

function TaskGroup({
  label,
  tone,
  items,
  timingMap,
  canManage,
  updateTask,
  deleteTask,
}: {
  label: string;
  tone: "danger" | "ok" | "info" | "neutral";
  items: Projects.ProjectTaskDTO[];
  timingMap: Map<string, Projects.TimingDTO>;
  canManage: boolean;
  updateTask: ReturnType<typeof useUpdateProjectTask>;
  deleteTask: ReturnType<typeof useDeleteProjectTask>;
}) {
  if (items.length === 0) return null;
  const nextStatus = (status: Projects.ProjectTaskStatus): Projects.ProjectTaskStatus =>
    status === "todo" ? "in_progress" : status === "in_progress" ? "done" : "todo";
  return (
    <div className="stack">
      <div className="row row--between">
        <Chip label={label} tone={tone} />
        <span className="t-mono" style={{ color: "var(--text3)" }}>{items.length}</span>
      </div>
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
                <p className="card__subtitle">{timing ? dateRange(timing.startsAt, timing.endsAt) : "Без тайминга"}</p>
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
  const [group, setGroup] = useState<Projects.ProjectChecklistGroup>("mount");
  const [title, setTitle] = useState("");
  const list = checklist.data ?? [];
  const done = list.filter((i) => i.done).length;
  const add = () => {
    const clean = title.trim();
    if (!clean) return;
    createItem.mutate({ group, title: clean }, { onSuccess: () => setTitle("") });
  };

  return (
    <>
      <SectionHead label="Чек-лист" meta={`${done}/${list.length}`} />
      <div className="stack">
        {canManage && (
          <Card>
            <div className="row">
              <Field label="Этап">
                <Select
                  value={group}
                  onChange={(e) => setGroup(e.target.value as Projects.ProjectChecklistGroup)}
                  options={(Object.keys(checklistLabels) as Projects.ProjectChecklistGroup[]).map((key) => ({ value: key, label: checklistLabels[key] }))}
                />
              </Field>
              <Field label="Пункт">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Проверить..." />
              </Field>
            </div>
            <Button block variant="secondary" disabled={!title.trim() || createItem.isPending} onClick={add}>+ Пункт</Button>
          </Card>
        )}
        {checklist.isLoading ? (
          <Loading />
        ) : checklist.error ? (
          <ErrorState error={checklist.error} onRetry={checklist.refetch} />
        ) : list.length === 0 ? (
          <EmptyState title="Чек-лист пуст" />
        ) : (
          (Object.keys(checklistLabels) as Projects.ProjectChecklistGroup[]).map((key) => {
            const items = list.filter((i) => i.group === key);
            if (items.length === 0) return null;
            return (
              <Card key={key}>
                <div className="row row--between">
                  <p className="card__title">{checklistLabels[key]}</p>
                  <Chip label={`${items.filter((i) => i.done).length}/${items.length}`} tone={items.every((i) => i.done) ? "ok" : "neutral"} />
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
                </div>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
