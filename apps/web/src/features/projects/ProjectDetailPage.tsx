import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Projects } from "@sever/contracts";
import { PROJECT_STATUSES } from "@sever/contracts";
import { Card, Button, SectionTitle, StatusBadge, Chip, Select, Field, Input, Loading, ErrorState, EmptyState } from "../../ui-kit/index.ts";
import { projectStatusLabel, projectStatusTone, dateRange, dateTime, eur } from "../../lib/labels.ts";
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
  useSetTimingAssignees,
  useDeleteTiming,
  useAddAssignment,
  useRemoveAssignment,
  useIssueResolvedUnits,
  useAllUnits,
  useProjectInvoice,
} from "./hooks.ts";
import { ResolveReservationSheet } from "./components/ResolveReservationSheet.tsx";
import { EditProjectSheet } from "./components/EditProjectSheet.tsx";
import { TimingTimeline } from "./components/TimingTimeline.tsx";
import { toLocalInput, isoFromLocal } from "../../lib/datetime.ts";

const ASSIGN_STATUS: Record<Projects.AssignmentStatus, { label: string; tone: "ok" | "info" | "warn" | "neutral" }> = {
  added: { label: "в команде", tone: "ok" },
  invited: { label: "приглашён", tone: "info" },
  accepted: { label: "принял", tone: "ok" },
  declined: { label: "отклонил", tone: "warn" },
};

export function ProjectDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { can } = useSession();
  const canManage = can("projects.manage");
  const canReserve = can("projects.reservation.manage");
  const canIssue = can("warehouse.issue");
  const canTiming = can("projects.timing.manage");
  const canAssign = can("projects.assignment.manage");
  const canViewPeople = can("people.view");
  const canFinance = can("finance.view");
  const canPlans = can("plans.view");

  const project = useProject(id);
  const clients = useClients();
  const reservations = useReservations(id);
  const timings = useTimings(id);
  const assignments = useAssignments(id);
  const people = usePeople(canViewPeople);
  const models = useEquipmentModels();
  const allUnits = useAllUnits();
  const invoice = useProjectInvoice(id, canFinance);

  const setStatus = useSetProjectStatus();
  const addReservation = useCreateReservation();
  const addTiming = useAddTiming();
  const setTimingAssignees = useSetTimingAssignees();
  const deleteTiming = useDeleteTiming();
  const addAssignment = useAddAssignment();
  const removeAssignment = useRemoveAssignment();
  const issueResolved = useIssueResolvedUnits();

  const [resModel, setResModel] = useState("");
  const [resQty, setResQty] = useState("1");
  const [timingTitle, setTimingTitle] = useState("");
  const [timingStart, setTimingStart] = useState("");
  const [timingEnd, setTimingEnd] = useState("");
  const [assignUser, setAssignUser] = useState("");
  const [assignRole, setAssignRole] = useState("");
  const [assignRate, setAssignRate] = useState("");
  const [resolving, setResolving] = useState<Projects.ReservationDTO | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  if (project.isLoading) return <Loading />;
  if (project.error) return <ErrorState error={project.error} onRetry={project.refetch} />;
  if (!project.data) return null;
  const p = project.data;

  const clientName = (cid: string) => (clients.data ?? []).find((c) => c.id === cid)?.name ?? "—";
  const modelName = (mid: string) => (models.data ?? []).find((m) => m.id === mid)?.name ?? mid;
  const userName = (uid: string) => (people.data ?? []).find((u) => u.id === uid)?.displayName ?? "";

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

      {/* Timings — parallel timeline (everyone sees the blocks they may see; the
          whole picture needs the «весь тайминг» permission, enforced by the API) */}
      <SectionTitle>Тайминги</SectionTitle>
      {(timings.data ?? []).length === 0 ? (
        <EmptyState title={canTiming ? "Таймингов нет" : "Вас пока нет ни в одном событии"} />
      ) : (
        <Card>
          <TimingTimeline timings={timings.data ?? []} userName={userName} />
        </Card>
      )}

      {/* Per-block people editing (for those who manage timings) */}
      {canTiming &&
        (timings.data ?? []).map((t) => {
          const onProject = (assignments.data ?? []).map((a) => a.userId);
          const candidates = onProject.filter((uid) => !t.assigneeIds.includes(uid));
          return (
            <Card key={t.id}>
              <div className="row row--between">
                <div style={{ minWidth: 0 }}>
                  <p className="card__title">{t.title}</p>
                  <p className="card__subtitle">{dateTime(t.startsAt)} – {dateTime(t.endsAt)}</p>
                </div>
                <Button variant="ghost" onClick={() => deleteTiming.mutate(t.id)}>Удалить</Button>
              </div>
              <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {t.assigneeIds.length === 0 && <span className="card__subtitle">Никого не назначено</span>}
                {t.assigneeIds.map((uid) => (
                  <button
                    key={uid}
                    className="chip"
                    style={{ cursor: "pointer", border: "1px solid var(--bdr)" }}
                    title="Убрать из события"
                    onClick={() => setTimingAssignees.mutate({ timingId: t.id, userIds: t.assigneeIds.filter((x) => x !== uid) })}
                  >
                    {userName(uid)} ✕
                  </button>
                ))}
              </div>
              {candidates.length > 0 && (
                <div className="row" style={{ marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Select
                      value=""
                      onChange={(e) => e.target.value && setTimingAssignees.mutate({ timingId: t.id, userIds: [...t.assigneeIds, e.target.value] })}
                      options={[{ value: "", label: "+ добавить человека в событие" }, ...candidates.map((uid) => ({ value: uid, label: userName(uid) }))]}
                    />
                  </div>
                </div>
              )}
            </Card>
          );
        })}
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

      {/* Assignments — hidden unless you can see the people directory, so field
          crew without people.view never get a section full of raw ids. */}
      {canViewPeople && (
        <>
      <SectionTitle>Команда</SectionTitle>
      {(assignments.data ?? []).length === 0 ? (
        <EmptyState title="Никто не назначен" />
      ) : (
        <div className="stack">
          {(assignments.data ?? []).map((a) => {
            const st = ASSIGN_STATUS[a.status];
            return (
              <Card key={a.id}>
                <div className="row row--between">
                  <p className="card__title">{userName(a.userId)}</p>
                  <div className="row" style={{ gap: 8 }}>
                    <Chip label={st.label} tone={st.tone} />
                    {canAssign && (
                      <Button variant="ghost" disabled={removeAssignment.isPending} onClick={() => removeAssignment.mutate(a.id)}>
                        Снять
                      </Button>
                    )}
                  </div>
                </div>
                <p className="card__subtitle" style={{ marginTop: 2 }}>
                  {a.roleNote || "роль не указана"}
                  {a.rateEUR != null ? ` · ${a.rateEUR} €` : ""}
                </p>
              </Card>
            );
          })}
        </div>
      )}
      {canAssign && (() => {
        const assignedIds = new Set((assignments.data ?? []).map((a) => a.userId));
        const available = (people.data ?? []).filter((u) => !assignedIds.has(u.id));
        if (available.length === 0) {
          return <p className="card__subtitle" style={{ textAlign: "center", padding: 12 }}>Все доступные люди назначены</p>;
        }
        const sel = assignUser && available.some((u) => u.id === assignUser) ? assignUser : available[0]!.id;
        const rateNum = assignRate ? Number(assignRate) : null;
        const submit = (invite: boolean) =>
          addAssignment.mutate(
            { projectId: p.id, userId: sel, roleNote: assignRole || null, rateEUR: rateNum, invite },
            { onSuccess: () => { setAssignUser(""); setAssignRole(""); setAssignRate(""); } }
          );
        return (
          <Card>
            <Field label="Человек">
              <Select value={sel} onChange={(e) => setAssignUser(e.target.value)} options={available.map((u) => ({ value: u.id, label: u.displayName }))} />
            </Field>
            <div className="row">
              <Field label="Роль">
                <Input value={assignRole} onChange={(e) => setAssignRole(e.target.value)} placeholder="Световик / шеф монтажа…" />
              </Field>
              <Field label="Ставка, €">
                <Input type="number" value={assignRate} onChange={(e) => setAssignRate(e.target.value)} placeholder="напр. 150" />
              </Field>
            </div>
            <div className="row" style={{ marginTop: 4 }}>
              <Button variant="secondary" block disabled={addAssignment.isPending} onClick={() => submit(false)}>
                Добавить
              </Button>
              <Button block disabled={addAssignment.isPending} onClick={() => submit(true)}>
                Пригласить в Telegram
              </Button>
            </div>
            <p className="card__subtitle" style={{ marginTop: 8 }}>
              «Пригласить» отправит человеку в Telegram дату, роль и ставку — он примет или откажется прямо в чате.
            </p>
          </Card>
        );
      })()}
        </>
      )}

      {canFinance && invoice.data && (() => {
        const inv = invoice.data;
        const Line = ({ l }: { l: { refId: string; label: string; detail: string; amountEUR: number } }) => (
          <div className="row row--between" style={{ padding: "4px 0", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "var(--text)" }}>{l.label}</div>
              <div className="card__subtitle">{l.detail}</div>
            </div>
            <span style={{ color: "var(--text)", whiteSpace: "nowrap" }}>{eur(l.amountEUR)}</span>
          </div>
        );
        return (
          <>
            <SectionTitle>Смета и счёт</SectionTitle>
            <Card>
              <p className="card__title">Счёт за прокат · {inv.days} сут</p>
              {inv.rentalLines.length === 0 ? (
                <p className="card__subtitle" style={{ marginTop: 4 }}>Броней оборудования нет</p>
              ) : (
                <div style={{ marginTop: 6 }}>{inv.rentalLines.map((l) => <Line key={l.refId} l={l} />)}</div>
              )}
              <div className="row row--between" style={{ marginTop: 8, borderTop: "1px solid var(--bdr)", paddingTop: 8 }}>
                <span className="card__title">К оплате клиентом</span>
                <span className="card__title">{eur(inv.invoiceEUR)}</span>
              </div>
            </Card>

            <Card>
              <p className="card__title">Расходы по проекту</p>
              <div style={{ marginTop: 6 }}>{inv.laborLines.map((l) => <Line key={l.refId} l={l} />)}</div>
              <div className="row row--between" style={{ padding: "4px 0" }}>
                <span className="card__subtitle">Команда, итого</span>
                <span style={{ color: "var(--text)" }}>{eur(inv.laborEUR)}</span>
              </div>
              {inv.recordedExpenseEUR > 0 && (
                <div className="row row--between" style={{ padding: "4px 0" }}>
                  <span className="card__subtitle">Прочие расходы (ремонт/закупки)</span>
                  <span style={{ color: "var(--text)" }}>{eur(inv.recordedExpenseEUR)}</span>
                </div>
              )}
              <div className="row row--between" style={{ marginTop: 8, borderTop: "1px solid var(--bdr)", paddingTop: 8 }}>
                <span className="card__title">Итого расходы</span>
                <span className="card__title">{eur(inv.costEUR)}</span>
              </div>
            </Card>

            <Card>
              <div className="row row--between">
                <span className="card__title">Прибыль (оценка)</span>
                <span className="card__title" style={{ color: inv.profitEUR >= 0 ? "var(--ok)" : "var(--alert)" }}>{eur(inv.profitEUR)}</span>
              </div>
              <p className="card__subtitle" style={{ marginTop: 6 }}>
                Оплачено клиентом: {eur(inv.paidEUR)} · осталось получить: {eur(inv.dueEUR)}
              </p>
            </Card>
            <Button block variant="secondary" onClick={() => navigate(`/projects/${p.id}/invoice`)}>
              📄 Сформировать счёт (с правкой цен)
            </Button>
          </>
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
