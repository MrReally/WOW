import { ProjectStageProgress } from "../projects/components/ProjectStageProgress.tsx";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Equipment, People, Projects } from "@sever/contracts";
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, Input, Loading, SectionHead, Select, WSGlyph } from "../../ui-kit/index.ts";
import { dateRange, dateTime, projectStatusLabel, projectStatusTone } from "../../lib/labels.ts";
import { personInitials, personName } from "../../lib/people.ts";
import { useSession } from "../../app/session.ts";
import { useAllUnits, useAssignments, useEquipmentModels, useIssueProjectQuantity, useIssueResolvedUnits, usePeople, useProject, useProjectEquipmentJournal, useProjectInvoice, useReservations, useReturnProjectQuantity, useUpdateAssignment } from "../projects/hooks.ts";
import { useAccounts, useCreateTransaction } from "../finance/hooks.ts";
import { useChangeStatus, useReturnUnits, useWarehouses } from "../warehouse/hooks.ts";
import {
  useClearOperationUnitMark,
  useCompleteWarehouseTurnover,
  useCreateProjectTask,
  useDeleteProjectTask,
  useMarkBrokenUnit,
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
    { status: "missing", label: "?", tone: "warn" },
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
  const completeTurnover = useCompleteWarehouseTurnover(id);
  const canManage = can("projects.timing.manage", "projects.manage");
  const canStepBack = can("operations.stage.back", "projects.timing.manage", "projects.manage");
  const canListPeople = can("people.view", "operations.payroll.view", "operations.payroll.manage");
  const people = usePeople(canListPeople);

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
            {(project.data.dressCodeLabel || project.data.dressCodeUniform) && <p className="card__subtitle">👔 {[project.data.dressCodeLabel, project.data.dressCodeUniform ? "форма SEVER" : null].filter(Boolean).join(" · ")}</p>}
          </div>
          <Chip label={projectStatusLabel[project.data.status]} tone={projectStatusTone[project.data.status]} />
        </div>
        <ProjectStageProgress stage={activeStage} complete={!!project.data.warehouseTurnoverCompletedAt} />
      </Card>

      {(can("operations.finance.view", "operations.finance.manage") || can("operations.payroll.view", "operations.payroll.manage")) && <OperationsFinancePanel projectId={id} canClientView={can("operations.finance.view", "operations.finance.manage")} canClientManage={can("operations.finance.manage")} canPayrollView={can("operations.payroll.view", "operations.payroll.manage")} canPayrollManage={can("operations.payroll.manage")} />}

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

      {!project.data.warehouseTurnoverCompletedAt && <StageEquipmentPanel projectId={id} stage={activeStage} />}
      <TaskBoard projectId={id} canManage={canManage} canListPeople={canListPeople} currentUser={user ?? null} />
      <SectionHead label="Этап" />
      <Card>
        <div className="row row--between">
          <div style={{ minWidth: 0 }}>
            <p className="card__title">{stageLabel[activeStage]}</p>
            <p className="card__subtitle">{upcomingStage ? `Дальше: ${stageLabel[upcomingStage]}` : project.data.warehouseTurnoverCompletedAt ? "Складской оборот завершён" : "Финальный этап"}</p>
          </div>
          <Chip label={`${stageOrder.indexOf(activeStage) + 1}/${stageOrder.length}`} tone="accent" />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          {rollbackStage && canStepBack && <Button block variant="secondary" disabled={setStage.isPending} onClick={() => setStage.mutate(rollbackStage)}>Назад · {stageLabel[rollbackStage]}</Button>}
          {upcomingStage && <Button block variant="primary" disabled={setStage.isPending} onClick={() => setStage.mutate(upcomingStage)}>Далее · {stageLabel[upcomingStage]}</Button>}
          {!upcomingStage && !project.data.warehouseTurnoverCompletedAt && <Button block variant="primary" disabled={completeTurnover.isPending} onClick={() => completeTurnover.mutate()}>Завершить оборот</Button>}
        </div>
      </Card>
      <StageHistory events={events.data ?? []} people={people.data ?? []} currentUser={user ?? null} />
    </div>
  );
}

function OperationsFinancePanel({ projectId, canClientView, canClientManage, canPayrollView, canPayrollManage }: { projectId: string; canClientView: boolean; canClientManage: boolean; canPayrollView: boolean; canPayrollManage: boolean }) {
  const invoice = useProjectInvoice(projectId, canClientView), accounts = useAccounts(canClientView), createTransaction = useCreateTransaction(), assignments = useAssignments(projectId), people = usePeople(canPayrollView), updateAssignment = useUpdateAssignment();
  const [amount,setAmount] = useState(""), [accountId,setAccountId] = useState("");
  const account = (accounts.data ?? []).find(x => x.id === accountId) ?? accounts.data?.[0];
  const active = (assignments.data ?? []).filter(x => x.status === "added" || x.status === "accepted");
  const name = (id:string) => (people.data ?? []).find(x => x.id === id)?.displayName ?? id;
  const money = (value: number | null | undefined) => {
    const amount = Number(value);
    return `${(Number.isFinite(amount) ? amount : 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} €`;
  };
  return <>
    <SectionHead label="Финансы проекта" />
    {canClientView && <Card>
      <div className="row row--between">
        <div><p className="card__subtitle">Счёт</p><p className="card__title">{money(invoice.data?.invoiceEUR ?? 0)}</p></div>
        <div><p className="card__subtitle">Получено</p><p className="card__title">{money(invoice.data?.paidEUR ?? 0)}</p></div>
        <div><p className="card__subtitle">{(invoice.data?.dueEUR ?? 0) >= 0 ? "Осталось" : "Переплата"}</p><p className="card__title">{money(Math.abs(invoice.data?.dueEUR ?? 0))}</p></div>
      </div>
      {canClientManage && <div className="row" style={{marginTop:12}}>
        <Select value={account?.id ?? ""} onChange={e=>setAccountId(e.target.value)} options={(accounts.data ?? []).map(x=>({value:x.id,label:`${x.name} · ${x.currency}`}))}/>
        <Input type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Оплата клиента"/>
        <Button disabled={!account || !(Number(amount)>0) || createTransaction.isPending} onClick={()=>createTransaction.mutate({accountId:account!.id,projectId,kind:"income",category:(invoice.data?.paidEUR ?? 0)>0?"debt_settlement":"prepayment",amount:Number(amount),currency:account!.currency,note:"Оплата клиента из Operations"},{onSuccess:()=>{setAmount("");invoice.refetch();}})}>Внести</Button>
      </div>}
    </Card>}
    {canPayrollView && <Card><p className="card__title">Выплаты команде</p><div className="stack" style={{marginTop:10}}>{active.map(assignment => {
      const due = assignment.rateEUR ?? 0;
      const paid = Number.isFinite(Number(assignment.paidEUR)) ? Number(assignment.paidEUR) : 0;
      const rest = Math.max(0, due - paid);
      return <div className="row row--between" key={assignment.id}>
        <div><p>{name(assignment.userId)} · {assignment.roleNote ?? "Роль"}</p><p className="card__subtitle">ставка {money(due)} · выплачено {money(paid)}{rest ? ` · осталось ${money(rest)}` : ""}</p></div>
        {canPayrollManage && <PayrollPaymentEditor paidEUR={paid} rateEUR={due} pending={updateAssignment.isPending} onSave={paidEUR => updateAssignment.mutate({ id: assignment.id, input: { paidEUR } })} />}
      </div>;
    })}</div></Card>}
  </>;
}

function PayrollPaymentEditor({ paidEUR, rateEUR, pending, onSave }: { paidEUR: number; rateEUR: number; pending: boolean; onSave: (paidEUR: number) => void }) {
  const [draft, setDraft] = useState(String(paidEUR));
  useEffect(() => setDraft(String(paidEUR)), [paidEUR]);
  const value = Math.max(0, Number(draft) || 0);
  return <div className="row"><Input type="number" min="0" value={draft} onChange={event => setDraft(event.target.value)} /><Button variant="secondary" disabled={pending || value === paidEUR} onClick={() => onSave(value)}>Сохранить</Button><label className="chip chip--neutral"><input type="checkbox" checked={rateEUR > 0 && paidEUR >= rateEUR} disabled={pending || rateEUR <= 0} onChange={event => onSave(event.target.checked ? rateEUR : 0)} /> выплачено полностью</label></div>;
}

function avatarUrl(user: People.UserDTO | null | undefined): string | null {
  return user?.usePhotoAsAvatar ? user.photoUrl : null;
}

function StageHistory({
  events,
  people,
  currentUser,
}: {
  events: Projects.ProjectOperationEventDTO[];
  people: People.UserDTO[];
  currentUser: People.UserDTO | null;
}) {
  if (events.length === 0) return null;
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const actorName = (actorId: string | null) => {
    if (!actorId) return "Система";
    if (actorId === currentUser?.id) return personName(currentUser, "Вы");
    return personName(peopleById.get(actorId), "Кто-то");
  };
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
                <p className="card__subtitle">{dateTime(event.createdAt)} · {actorName(event.actorId)}</p>
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
  const markBroken = useMarkBrokenUnit(projectId);
  const issueUnits = useIssueResolvedUnits();
  const returnUnits = useReturnUnits();
  const journal = useProjectEquipmentJournal(projectId);
  const issueQuantity = useIssueProjectQuantity();
  const returnQuantity = useReturnProjectQuantity();
  const canMarkStatus = can("warehouse.unit.status");
  const [returnWarehouseByUnit, setReturnWarehouseByUnit] = useState<Record<string,string>>({});
  const [actualUnitIdsByReservation, setActualUnitIdsByReservation] = useState<Record<string, string[]>>({});
  const [actualQuantityByModel, setActualQuantityByModel] = useState<Record<string, string>>({});
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
  const reservedRows = (reservations.data ?? []).flatMap((reservation) =>
    reservation.resolvedUnitIds.map((unitId) => ({ key: `${reservation.id}:${unitId}`, modelId: reservation.modelId, unit: unitById.get(unitId) }))
  );
  const reservedUnitIds = new Set(reservedRows.map((row) => row.unit?.id).filter(Boolean));
  // Also show units that were issued without being resolved into a reservation.
  // This is what makes legacy rentals such as Space X Wedding returnable again.
  const issuedExtras = (units.data ?? []).filter((unit) => unit.status === "on_project" && unit.currentProjectId === projectId && !reservedUnitIds.has(unit.id)).map((unit) => ({ key: `issued:${unit.id}`, modelId: unit.modelId, unit }));
  const resolved = [...reservedRows, ...issuedExtras];
  const byWarehouse = new Map<string, { warehouseId: string | null; rows: typeof resolved }>();
  for (const row of resolved) {
    const key = row.unit?.warehouseId ?? "none";
    if (!byWarehouse.has(key)) byWarehouse.set(key, { warehouseId: row.unit?.warehouseId ?? null, rows: [] });
    byWarehouse.get(key)!.rows.push(row);
  }
  const serialModelIds = new Set((models.data ?? []).filter((model) => model.trackingMode === "serial").map((model) => model.id));
  const modelById = new Map((models.data ?? []).map((model) => [model.id, model]));
  const planningUnresolved = (reservations.data ?? []).filter((reservation) => serialModelIds.has(reservation.modelId) && (modelById.get(reservation.modelId)?.effectiveReservationAssignmentMode ?? "planning") === "planning" && reservation.resolvedUnitIds.length < reservation.qty);
  const operationsReservations = (reservations.data ?? []).filter((reservation) => serialModelIds.has(reservation.modelId) && modelById.get(reservation.modelId)?.effectiveReservationAssignmentMode === "operations");
  const quantityNeeds = [...(reservations.data ?? []).filter((reservation) => !serialModelIds.has(reservation.modelId)).reduce((map, reservation) => {
    map.set(reservation.modelId, (map.get(reservation.modelId) ?? 0) + reservation.qty);
    return map;
  }, new Map<string, number>())].map(([modelId, qty]) => ({ modelId, qty }));
  const quantityOutstanding = (modelId: string) => Math.max(0, (journal.data ?? []).filter((entry) => entry.modelId === modelId).reduce((total, entry) =>
    total + (entry.action === "issued" ? entry.qty ?? 0 : entry.action === "returned" || entry.action === "return_incomplete" ? -(entry.qty ?? 0) : 0), 0));
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
  const markUnit = (unitId: string, status: Projects.OperationUnitMarkStatus, active: boolean, note?: string | null) => {
    if (stage === "return" && status === "returned" && active) return;
    if (active) {
      clearMark.mutate({ stage, unitId, status });
      return;
    }
    const unit = unitById.get(unitId);
    if (stage === "pickup" && status === "picked" && unit && unit.status !== "on_project") {
      issueUnits.mutate({ projectId, unitIds: [unitId] }, { onSuccess: () => setMark.mutate({ stage, unitId, status }) });
      return;
    }
    if (stage === "return" && status === "returned" && unit?.status === "on_project") {
      returnUnits.mutate({ projectId, returnedUnitIds: [unitId], expectedUnitIds: [unitId], warehouseId: returnWarehouseByUnit[unitId] || (warehouses.data ?? []).find(w => w.isDefault)?.id }, { onSuccess: () => setMark.mutate({ stage, unitId, status }) });
      return;
    }
    if (status === "broken" && canMarkStatus) {
      const problem = note?.trim();
      if (!problem) return;
      markBroken.mutate({ unitId, stage, problem });
      return;
    }
    setMark.mutate({ stage, unitId, status, note });
    if (status === "lost" && canMarkStatus) {
      changeStatus.mutate({ id: unitId, status: "lost", note: `Демонтаж · ${projectId}` });
    }
  };

  return (
    <>
      <SectionHead label="По приборам" meta={title} />
      <div className="stack">
        {reservations.isLoading || models.isLoading || units.isLoading || warehouses.isLoading || marks.isLoading || journal.isLoading ? (
          <Loading />
        ) : marks.error ? (
          <ErrorState error={marks.error} onRetry={marks.refetch} />
        ) : resolved.length === 0 && planningUnresolved.length === 0 && operationsReservations.length === 0 && quantityNeeds.length === 0 ? (
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
                  {group.rows.map(({ key, modelId, unit }) => (
                    <UnitStageRow
                      key={key}
                      unit={unit}
                      modelName={modelName(modelId)}
                      marks={unit ? (marksByUnit.get(unit.id) ?? []) : []}
                      actions={actions}
                      kitComponents={(models.data?.find((model) => model.id === modelId)?.requiredComponentModelIds ?? []).map((componentId) => ({ id: componentId, name: modelName(componentId) }))}
                      disabled={setMark.isPending || clearMark.isPending || changeStatus.isPending || markBroken.isPending || issueUnits.isPending || returnUnits.isPending}
                      onOpen={() => unit && navigate(`/warehouse/units/${unit.id}`, { state: { from: `/operations/projects/${projectId}` } })}
                      onMark={(status, active, note) => unit && markUnit(unit.id, status, active, note)}
                      returnWarehouses={stage === "return" ? (warehouses.data ?? []) : []}
                      selectedWarehouseId={unit ? (returnWarehouseByUnit[unit.id] || (warehouses.data ?? []).find(w => w.isDefault)?.id || "") : ""}
                      onSelectWarehouse={warehouseId => unit && setReturnWarehouseByUnit(current => ({ ...current, [unit.id]: warehouseId }))}
                    />
                  ))}
                </div>
              </Card>
            ))}
            {quantityNeeds.length > 0 && (
              <Card>
                <div className="row row--between">
                  <p className="card__title">Количество / кабели</p>
                  <Chip label={`${quantityNeeds.length}`} tone="neutral" />
                </div>
                <div className="stack" style={{ marginTop: 10 }}>
                  {quantityNeeds.map((need) => {
                    const outstanding = quantityOutstanding(need.modelId);
                    const remaining = Math.max(0, need.qty - outstanding);
                    const assignByFact = modelById.get(need.modelId)?.effectiveReservationAssignmentMode === "operations";
                    const actualQuantity = Math.max(0, Math.trunc(Number(actualQuantityByModel[need.modelId] ?? remaining) || 0));
                    return <div key={need.modelId} className="row row--between">
                      <div style={{ minWidth: 0 }}>
                        <p className="card__title" style={{ fontSize: 16 }}>{modelName(need.modelId)} × {need.qty}</p>
                        <p className="card__subtitle">{outstanding > 0 ? `на проекте ${outstanding}` : assignByFact ? "количество отмечается по факту" : "на складе"}</p>
                      </div>
                      {stage === "pickup" && assignByFact ? <div className="row"><Input type="number" min="1" value={actualQuantityByModel[need.modelId] ?? String(remaining || 1)} onChange={event => setActualQuantityByModel(current => ({ ...current, [need.modelId]: event.target.value }))} /><Button disabled={issueQuantity.isPending || actualQuantity < 1} onClick={() => issueQuantity.mutate({ projectId, modelId: need.modelId, qty: actualQuantity }, { onSuccess: () => setActualQuantityByModel(current => ({ ...current, [need.modelId]: "" })) })}>Выдать {actualQuantity}</Button></div>
                        : stage === "pickup" && remaining > 0 ? <Button disabled={issueQuantity.isPending} onClick={() => issueQuantity.mutate({ projectId, modelId: need.modelId, qty: remaining })}>Выдать {remaining}</Button>
                        : stage === "return" && outstanding > 0 ? <Button disabled={returnQuantity.isPending} onClick={() => returnQuantity.mutate({ projectId, modelId: need.modelId, qty: outstanding })}>Вернуть {outstanding}</Button>
                        : <Chip label={outstanding > 0 ? "ВЫДАНО" : "ОЖИДАЕТ"} tone={outstanding > 0 ? "warn" : "neutral"} />}
                    </div>;
                  })}
                </div>
              </Card>
            )}
            {operationsReservations.length > 0 && (
              <Card>
                <div className="row row--between">
                  <p className="card__title">По факту при заборе</p>
                  <Chip label={`${operationsReservations.length}`} tone="info" />
                </div>
                <div className="stack" style={{ marginTop: 10 }}>
                  {operationsReservations.map((reservation) => {
                    const selected = new Set(actualUnitIdsByReservation[reservation.id] ?? []);
                    const available = (units.data ?? []).filter(unit => unit.modelId === reservation.modelId && unit.status === "in_stock");
                    const issuedCount = (units.data ?? []).filter(unit => unit.modelId === reservation.modelId && unit.status === "on_project" && unit.currentProjectId === projectId).length;
                    const toggle = (unitId: string) => setActualUnitIdsByReservation(current => ({ ...current, [reservation.id]: selected.has(unitId) ? [...selected].filter(id => id !== unitId) : [...selected, unitId] }));
                    return <div key={reservation.id} className="stack" style={{ gap: 8 }}>
                      <div className="row row--between"><div><p className="card__title" style={{ fontSize: 16 }}>{modelName(reservation.modelId)}</p><p className="card__subtitle">план {reservation.qty} · уже взято {issuedCount} · выбрано {selected.size}</p></div>{stage !== "pickup" && <Chip label="выбор на заборе" tone="neutral" />}</div>
                      {stage === "pickup" && <>
                        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>{available.map(unit => <label key={unit.id} className={`chip ${selected.has(unit.id) ? "chip--info chip--solid" : "chip--neutral"}`}><input type="checkbox" checked={selected.has(unit.id)} onChange={() => toggle(unit.id)} /> {unit.assetTag}</label>)}</div>
                        {available.length === 0 ? <p className="card__subtitle">Нет свободных единиц на складе.</p> : <Button disabled={selected.size === 0 || issueUnits.isPending} onClick={() => issueUnits.mutate({ projectId, unitIds: [...selected] }, { onSuccess: () => { for (const unitId of selected) setMark.mutate({ stage: "pickup", unitId, status: "picked" }); setActualUnitIdsByReservation(current => ({ ...current, [reservation.id]: [] })); } })}>Выдать по факту · {selected.size}</Button>}
                      </>}
                    </div>;
                  })}
                </div>
              </Card>
            )}
            {planningUnresolved.length > 0 && (
              <Card>
                <div className="row row--between">
                  <p className="card__title">Не распределено</p>
                  <Chip label={`${planningUnresolved.length}`} tone="warn" />
                </div>
                <div className="stack" style={{ marginTop: 10 }}>
                  {planningUnresolved.map((reservation) => (
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
  kitComponents,
  disabled,
  onOpen,
  onMark,
  returnWarehouses,
  selectedWarehouseId,
  onSelectWarehouse,
}: {
  unit: Equipment.EquipmentUnitDTO | undefined;
  modelName: string;
  marks: Projects.OperationUnitMarkDTO[];
  actions: { status: Projects.OperationUnitMarkStatus; label: string; tone?: "ok" | "warn" | "danger" }[];
  kitComponents: { id: string; name: string }[];
  disabled: boolean;
  onOpen: () => void;
  onMark: (status: Projects.OperationUnitMarkStatus, active: boolean, note?: string | null) => void;
  returnWarehouses: Equipment.WarehouseDTO[];
  selectedWarehouseId: string;
  onSelectWarehouse: (warehouseId: string) => void;
}) {
  const missingMark = marks.find((mark) => mark.status === "missing");
  const [editingMissing, setEditingMissing] = useState(false);
  const [editingBroken, setEditingBroken] = useState(false);
  const [brokenDescription, setBrokenDescription] = useState("");
  const [missingIds, setMissingIds] = useState<string[]>(() => missingMark?.note?.split(",").filter(Boolean) ?? []);
  useEffect(() => setMissingIds(missingMark?.note?.split(",").filter(Boolean) ?? []), [missingMark?.note]);
  const activeStatuses = new Set(marks.map((mark) => mark.status));
  const missingNames = kitComponents.filter((item) => missingIds.includes(item.id)).map((item) => item.name);
  const markText = marks.length > 0 ? marks.map((mark) => mark.status === "missing" && missingNames.length ? `нет: ${missingNames.join(", ")}` : mark.status === "broken" && mark.note ? `ремонт: ${mark.note}` : markLabel[mark.status]).join(" · ") : "не отмечено";
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
        {unit && returnWarehouses.length > 0 && (activeStatuses.has("returned") ? <Chip label={returnWarehouses.find(w => w.id === unit.warehouseId)?.name ?? "Возвращено"} tone="ok" /> : <Select value={selectedWarehouseId} onChange={e => onSelectWarehouse(e.target.value)} options={returnWarehouses.map(w => ({ value: w.id, label: `Вернуть: ${w.name}` }))} />)}
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
              onClick={() => action.status === "missing" && kitComponents.length
                ? setEditingMissing(!editingMissing)
                : action.status === "broken" && !active
                  ? setEditingBroken(!editingBroken)
                  : onMark(action.status, active)}
            >
              {action.label} {markLabel[action.status]}
            </button>
          );
        })}
      </div>
      {editingMissing && (
        <div className="card card--flat" style={{ padding: 10 }}>
          <p className="card__subtitle">Чего именно нет в комплекте</p>
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            {kitComponents.map((item) => <label key={item.id} className="row"><input type="checkbox" checked={missingIds.includes(item.id)} onChange={() => setMissingIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /> <span>{item.name}</span></label>)}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <Button block disabled={disabled || missingIds.length === 0} onClick={() => { onMark("missing", false, missingIds.join(",")); setEditingMissing(false); }}>Отметить некомплект</Button>
            {missingMark && <Button block variant="secondary" disabled={disabled} onClick={() => { onMark("missing", true); setEditingMissing(false); }}>Снять отметку</Button>}
          </div>
        </div>
      )}
      {editingBroken && (
        <div className="card card--flat" style={{ padding: 10 }}>
          <p className="card__subtitle">Опишите, что сломано</p>
          <Input value={brokenDescription} onChange={(event) => setBrokenDescription(event.target.value)} placeholder="Например: не включается, повреждён разъём" />
          <div className="row" style={{ marginTop: 8 }}>
            <Button block disabled={disabled || !brokenDescription.trim()} onClick={() => { onMark("broken", false, brokenDescription.trim()); setEditingBroken(false); }}>Отправить в ремонт</Button>
            <Button block variant="secondary" disabled={disabled} onClick={() => setEditingBroken(false)}>Отмена</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskBoard({
  projectId,
  canManage,
  canListPeople,
  currentUser,
}: {
  projectId: string;
  canManage: boolean;
  canListPeople: boolean;
  currentUser: People.UserDTO | null;
}) {
  const timings = useProjectTimings(projectId);
  const tasks = useProjectTasks(projectId);
  const people = usePeople(canListPeople);
  const createTask = useCreateProjectTask(projectId);
  const updateTask = useUpdateProjectTask(projectId);
  const deleteTask = useDeleteProjectTask(projectId);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [timingId, setTimingId] = useState("");
  const [pick, setPick] = useState<"person" | "time" | null>(null);
  const timingMap = useMemo(() => new Map((timings.data ?? []).map((t) => [t.id, t])), [timings.data]);
  const userId = currentUser?.id ?? null;
  const peopleById = useMemo(() => new Map((people.data ?? []).map((person) => [person.id, person])), [people.data]);
  const selectedAssignee = assigneeId ? (assigneeId === userId ? currentUser : peopleById.get(assigneeId)) : null;
  const taskRank = (task: Projects.ProjectTaskDTO) => task.assigneeId === userId ? 0 : task.assigneeId ? 2 : 1;
  const list = [...(tasks.data ?? [])].sort((a, b) =>
    taskRank(a) - taskRank(b) ||
    Date.parse(a.createdAt) - Date.parse(b.createdAt)
  );
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
            personActive={!!assigneeId}
            timeActive={!!timingId}
            personIcon={selectedAssignee ? (
              <Avatar initials={personInitials(selectedAssignee)} src={avatarUrl(selectedAssignee)} size={24} />
            ) : undefined}
            personSlot={
              <Select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                options={[
                  { value: "", label: "Любой" },
                  ...(userId ? [{ value: userId, label: "Я" }] : []),
                  ...((canListPeople ? (people.data ?? []) : []).filter((p) => p.id !== userId).map((p) => ({ value: p.id, label: p.nickname || p.displayName }))),
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
            <TaskList items={open} timingMap={timingMap} peopleById={peopleById} currentUser={currentUser} canManage={canManage} updateTask={updateTask} deleteTask={deleteTask} />
            {done.length > 0 && <TaskList items={done.slice(0, 4)} timingMap={timingMap} peopleById={peopleById} currentUser={currentUser} canManage={canManage} updateTask={updateTask} deleteTask={deleteTask} />}
          </>
        )}
      </div>
    </>
  );
}

function TaskList({
  items,
  timingMap,
  peopleById,
  currentUser,
  canManage,
  updateTask,
  deleteTask,
}: {
  items: Projects.ProjectTaskDTO[];
  timingMap: Map<string, Projects.TimingDTO>;
  peopleById: Map<string, People.UserDTO>;
  currentUser: People.UserDTO | null;
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
        const assignee = task.assigneeId === currentUser?.id ? currentUser : task.assigneeId ? peopleById.get(task.assigneeId) : null;
        const isMine = !!task.assigneeId && task.assigneeId === currentUser?.id;
        return (
          <Card
            key={task.id}
            style={isMine ? { borderColor: "color-mix(in srgb, var(--accent) 55%, var(--bdr))", background: "color-mix(in srgb, var(--accent) 10%, var(--s1))" } : undefined}
          >
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
                <p className="card__subtitle" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {assignee && <Avatar initials={personInitials(assignee)} src={avatarUrl(assignee)} size={20} />}
                  <span>{timing ? timing.title : "Без события"}</span>
                </p>
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
  personIcon,
  personActive,
  timeActive,
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
  personIcon?: ReactNode;
  personActive?: boolean;
  timeActive?: boolean;
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
          <button className={`icon-btn ${personActive ? "icon-btn--active" : ""}`} aria-label="Назначить" title="Назначить" onClick={() => onPick?.(pick === "person" ? null : "person")}>
            {personIcon ?? <WSGlyph type="person" size={18} />}
          </button>
        )}
        {timeSlot && (
          <button className={`icon-btn ${timeActive ? "icon-btn--warn" : ""}`} aria-label="Событие" title="Событие" onClick={() => onPick?.(pick === "time" ? null : "time")}>
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
