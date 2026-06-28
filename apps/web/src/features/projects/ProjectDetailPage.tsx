import { useEffect, useState } from "react";
import { useLocation, useParams, useNavigate, useSearchParams } from "react-router-dom";
import type { Projects } from "@sever/contracts";
import { PROJECT_STATUSES } from "@sever/contracts";
import { Card, Button, SectionTitle, StatusBadge, Chip, Select, Field, Input, Loading, ErrorState, EmptyState } from "../../ui-kit/index.ts";
import { projectStatusLabel, projectStatusTone, dateRange, dateTime, eur } from "../../lib/labels.ts";
import { useSession } from "../../app/session.ts";
import { useI18n } from "../../app/i18n.tsx";
import {
  useProject,
  useClients,
  useReservations,
  useTimings,
  useAssignments,
  useProjectRoles,
  usePeople,
  useEquipmentModels,
  useSetProjectStatus,
  useCreateReservation,
  useDeleteReservation,
  useAddTiming,
  useSetTimingAssignees,
  useDeleteTiming,
  useAddAssignment,
  useRemoveAssignment,
  useCreateProjectRole,
  useUpdateProjectRole,
  useDeleteProjectRole,
  useIssueResolvedUnits,
  useAllUnits,
  useProjectInvoice,
} from "./hooks.ts";
import { ResolveReservationSheet } from "./components/ResolveReservationSheet.tsx";
import { EditProjectSheet } from "./components/EditProjectSheet.tsx";
import { TimingTimeline } from "./components/TimingTimeline.tsx";
import { ContractorEquipment } from "./components/ContractorEquipment.tsx";
import { toLocalInput, isoFromLocal } from "../../lib/datetime.ts";
import { personName } from "../../lib/people.ts";

const ASSIGN_STATUS: Record<Projects.AssignmentStatus, { label: string; tone: "ok" | "info" | "warn" | "neutral" }> = {
  added: { label: "в команде", tone: "ok" },
  invited: { label: "приглашён", tone: "info" },
  accepted: { label: "принял", tone: "ok" },
  declined: { label: "отклонил", tone: "warn" },
};

type ProjectTab = "overview" | "reservations" | "timing" | "team" | "contractors" | "finance";
type ProjectTabIcon = ProjectTab | "plan" | "invoice" | "back" | "close";

const PROJECT_TABS: { id: ProjectTab; label: string; shortLabel: string; count?: "reservations" | "timing" | "team" | "contractors"; tone?: "accent" | "warn" | "info" | "ok" }[] = [
  { id: "overview", label: "Обзор", shortLabel: "Обзор", tone: "accent" },
  { id: "reservations", label: "Брони", shortLabel: "Брони", count: "reservations", tone: "info" },
  { id: "timing", label: "Тайминг", shortLabel: "План", count: "timing", tone: "warn" },
  { id: "team", label: "Команда", shortLabel: "Люди", count: "team", tone: "ok" },
  { id: "contractors", label: "Подрядчики", shortLabel: "Подряд", count: "contractors", tone: "warn" },
  { id: "finance", label: "Финансы", shortLabel: "€", tone: "accent" },
];

interface StoredInvoiceVersion {
  id: string;
  number: string;
  date: string;
  totalEUR: number;
  currency: string;
  lang: string;
  createdAt: string;
}

function projectTabFrom(value: string | null): ProjectTab {
  return PROJECT_TABS.some((tab) => tab.id === value) ? (value as ProjectTab) : "overview";
}

export function ProjectDetailPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = useSession();
  const { t } = useI18n();
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
  const projectRoles = useProjectRoles(id);
  const people = usePeople(canViewPeople);
  const models = useEquipmentModels();
  const allUnits = useAllUnits();
  const invoice = useProjectInvoice(id, canFinance);

  const setStatus = useSetProjectStatus();
  const addReservation = useCreateReservation();
  const deleteReservation = useDeleteReservation();
  const addTiming = useAddTiming();
  const setTimingAssignees = useSetTimingAssignees();
  const deleteTiming = useDeleteTiming();
  const addAssignment = useAddAssignment();
  const removeAssignment = useRemoveAssignment();
  const createProjectRole = useCreateProjectRole();
  const updateProjectRole = useUpdateProjectRole();
  const deleteProjectRole = useDeleteProjectRole();
  const issueResolved = useIssueResolvedUnits();

  const [resModel, setResModel] = useState("");
  const [resQty, setResQty] = useState("1");
  const [timingTitle, setTimingTitle] = useState("");
  const [timingStart, setTimingStart] = useState("");
  const [timingEnd, setTimingEnd] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [roleCount, setRoleCount] = useState("1");
  const [roleRate, setRoleRate] = useState("");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, { title: string; requiredCount: string; rateEUR: string }>>({});
  const [assignCandidates, setAssignCandidates] = useState<Record<string, string[]>>({});
  const [resolving, setResolving] = useState<Projects.ReservationDTO | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [invoiceVersions, setInvoiceVersions] = useState<StoredInvoiceVersion[]>([]);
  const activeTab = projectTabFrom(searchParams.get("tab"));

  useEffect(() => {
    try {
      setInvoiceVersions(JSON.parse(localStorage.getItem(`sever.invoice.versions.${id}`) || "[]"));
    } catch {
      setInvoiceVersions([]);
    }
  }, [id, activeTab]);

  const reopen = location.state as { reopenReservationId?: string; selectedUnitIds?: string[] } | null;
  useEffect(() => {
    if (!reopen?.reopenReservationId || resolving || !reservations.data) return;
    const found = reservations.data.find((r) => r.id === reopen.reopenReservationId);
    if (found) {
      setResolving(reopen.selectedUnitIds ? { ...found, resolvedUnitIds: reopen.selectedUnitIds } : found);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, navigate, reopen?.reopenReservationId, reopen?.selectedUnitIds, reservations.data, resolving]);

  if (project.isLoading) return <Loading />;
  if (project.error) return <ErrorState error={project.error} onRetry={project.refetch} />;
  if (!project.data) return null;
  const p = project.data;

  const clientName = (cid: string) => (clients.data ?? []).find((c) => c.id === cid)?.name ?? "—";
  const modelName = (mid: string) => (models.data ?? []).find((m) => m.id === mid)?.name ?? mid;
  const userName = (uid: string) => {
    const user = (people.data ?? []).find((u) => u.id === uid);
    return personName(user, "");
  };
  const setActiveTab = (tab: ProjectTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === "overview") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next);
  };
  const reservationCount = (reservations.data ?? []).length;
  const reservedUnitCount = (reservations.data ?? []).reduce((sum, r) => {
    const model = (models.data ?? []).find((m) => m.id === r.modelId);
    return model?.trackingMode === "quantity" ? sum : sum + r.qty;
  }, 0);
  const timingCount = (timings.data ?? []).length;
  const teamCount = (projectRoles.data ?? []).length > 0
    ? (projectRoles.data ?? []).reduce((sum, role) => sum + role.requiredCount, 0)
    : (assignments.data ?? []).filter((a) => a.status === "added" || a.status === "accepted").length;
  const contractorCost = invoice.data?.contractorCostEUR ?? 0;
  const projectPayableCost = (invoice.data?.contractorCostEUR ?? 0) + (invoice.data?.laborEUR ?? 0);
  const contractorCount = new Set(
    (invoice.data?.rentalLines ?? [])
      .filter((line) => line.section.startsWith("Vendor:"))
      .map((line) => line.section)
  ).size;
  const tabCount = (kind?: "reservations" | "timing" | "team" | "contractors") => {
    if (kind === "reservations") return reservationCount;
    if (kind === "timing") return timingCount;
    if (kind === "team") return teamCount;
    if (kind === "contractors") return contractorCount;
    return 0;
  };
  const visibleTabs = PROJECT_TABS.filter((tab) => {
    if (tab.id === "team") return canViewPeople;
    if (tab.id === "contractors") return canReserve || contractorCost > 0;
    if (tab.id === "finance") return canFinance && !!invoice.data;
    return true;
  });
  const currentTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : "overview";

  return (
    <div className="stack project-mobile-page">
      <button className="icon-text-action" onClick={() => navigate(-1)} aria-label="Назад">
        <ProjectGlyph type="back" />
        <span>Назад</span>
      </button>

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

      {currentTab === "overview" && (
        <div className="stack">
          <Card>
            <p className="card__title">Сводка проекта</p>
            <div className="project-stat-grid">
              <FinanceTile icon="reservations" label="Брони" value={String(reservedUnitCount)} onClick={() => setActiveTab("reservations")} />
              <FinanceTile icon="timing" label="События" value={String(timingCount)} onClick={() => setActiveTab("timing")} />
              {canViewPeople && <FinanceTile icon="team" label="Команда" value={String(teamCount)} onClick={() => setActiveTab("team")} />}
              <FinanceTile icon="contractors" label="Подряд" value={String(contractorCount)} tone={contractorCost > 0 ? "var(--warn)" : "var(--text)"} onClick={() => setActiveTab("contractors")} />
            </div>
          </Card>
          {canPlans && (
            <ProjectActionButton icon="plan" label="План сцены" meta="схема" onClick={() => navigate(`/projects/${p.id}/plan`)} />
          )}
          {canFinance && invoice.data && (
            <ProjectActionButton icon="invoice" label="Счёт" meta="PDF" onClick={() => navigate(`/projects/${p.id}/invoice`)} />
          )}
        </div>
      )}

      {/* Reservations */}
      {currentTab === "reservations" && (
        <>
      <SectionTitle>Брони (по часам)</SectionTitle>
      {(reservations.data ?? []).length === 0 ? (
        <EmptyState title="Броней нет" />
      ) : (
        <div className="stack">
          {(reservations.data ?? []).map((r) => {
            const resolved = r.resolvedUnitIds.length > 0;
            const unit = (uid: string) => (allUnits.data ?? []).find((u) => u.id === uid);
            const unitTag = (uid: string) => unit(uid)?.assetTag ?? uid.slice(0, 6);
            const issuedUnits = (allUnits.data ?? []).filter((u) => u.modelId === r.modelId && u.status === "on_project" && u.currentProjectId === p.id);
            const issuedCount = issuedUnits.length;
            const issued = issuedCount >= r.qty;
            const shownIds = [...new Set([...r.resolvedUnitIds, ...issuedUnits.map((u) => u.id)])];
            return (
              <Card key={r.id}>
                <div className="row row--between">
                  <p className="card__title">{modelName(r.modelId)} × {r.qty}</p>
                  <StatusBadge tone={issued ? "warn" : resolved ? "ok" : "info"}>
                    {issued ? "выдано" : resolved ? "распределено" : "по модели"}
                  </StatusBadge>
                </div>
                {issuedCount > 0 && (
                  <p className="card__subtitle">выдано {Math.min(issuedCount, r.qty)}/{r.qty}</p>
                )}
                {shownIds.length > 0 && (
                  <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {shownIds.map((uid) => (
                      <Chip key={uid} label={unitTag(uid)} tone={unit(uid)?.status === "on_project" ? "warn" : "neutral"} />
                    ))}
                  </div>
                )}
                {(canReserve || canIssue) && (
                  <div className="row" style={{ marginTop: 10 }}>
                    {canReserve && (
                      <Button variant="secondary" block disabled={issued} onClick={() => setResolving(r)}>
                        {resolved ? "Изменить" : "Распределить"}
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
                    {canReserve && (
                      <button
                        className="icon-btn icon-btn--danger"
                        aria-label="Удалить бронь"
                        title="Удалить"
                        disabled={deleteReservation.isPending || issuedCount > 0}
                        onClick={() => confirm("Удалить эту бронь?") && deleteReservation.mutate(r.id)}
                      >
                        <ProjectGlyph type="close" />
                      </button>
                    )}
                  </div>
                )}
                {issuedCount > 0 && canReserve && (
                  <p className="card__subtitle" style={{ marginTop: 6 }}>
                    Бронь нельзя удалить, пока по этой модели есть выданное на проект оборудование.
                  </p>
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
        </>
      )}

      {/* Timings — parallel timeline (everyone sees the blocks they may see; the
          whole picture needs the «весь тайминг» permission, enforced by the API) */}
      {currentTab === "timing" && (
        <>
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
          const onProject = (assignments.data ?? [])
            .filter((a) => a.status === "added" || a.status === "accepted")
            .map((a) => a.userId);
          const candidates = onProject.filter((uid) => !t.assigneeIds.includes(uid));
          return (
            <Card key={t.id}>
              <div className="row row--between">
                <div style={{ minWidth: 0 }}>
                  <p className="card__title">{t.title}</p>
                  <p className="card__subtitle">{dateTime(t.startsAt)} – {dateTime(t.endsAt)}</p>
                </div>
                <button className="icon-btn icon-btn--danger" aria-label="Удалить тайминг" title="Удалить" onClick={() => deleteTiming.mutate(t.id)}>
                  <ProjectGlyph type="close" />
                </button>
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
        </>
      )}

      {/* Assignments — hidden unless you can see the people directory, so field
          crew without people.view never get a section full of raw ids. */}
      {currentTab === "team" && canViewPeople && (
        <>
      <SectionTitle>Команда</SectionTitle>
      {(projectRoles.data ?? []).length === 0 && (assignments.data ?? []).length === 0 ? (
        <EmptyState title="Ролей пока нет" />
      ) : (
        <div className="stack">
          {(projectRoles.data ?? []).map((role) => {
            const roleAssignments = (assignments.data ?? []).filter((a) => a.roleId === role.id);
            const filled = roleAssignments.filter((a) => a.status === "added" || a.status === "accepted").length;
            const pending = roleAssignments.filter((a) => a.status === "invited").length;
            const draft = roleDrafts[role.id] ?? {
              title: role.title,
              requiredCount: String(role.requiredCount),
              rateEUR: role.rateEUR == null ? "" : String(role.rateEUR),
            };
            const activeIds = new Set(
              (assignments.data ?? [])
                .filter((a) => a.status !== "declined")
                .map((a) => a.userId)
            );
            const available = (people.data ?? []).filter((u) => !activeIds.has(u.id));
            const selected = (assignCandidates[role.id] ?? []).filter((uid) => available.some((u) => u.id === uid));
            const toggleCandidate = (uid: string) =>
              setAssignCandidates((prev) => {
                const current = prev[role.id] ?? [];
                return {
                  ...prev,
                  [role.id]: current.includes(uid) ? current.filter((x) => x !== uid) : [...current, uid],
                };
              });
            const submit = async (invite: boolean) => {
              if (selected.length === 0) return;
              for (const userId of selected) {
                await addAssignment.mutateAsync({ projectId: p.id, roleId: role.id, userId, invite });
              }
              setAssignCandidates((prev) => ({ ...prev, [role.id]: [] }));
            };
            const saveRole = () => {
              const requiredCount = Math.max(1, Number(draft.requiredCount) || 1);
              const rateEUR = draft.rateEUR.trim() ? Number(draft.rateEUR) : null;
              updateProjectRole.mutate({ id: role.id, input: { title: draft.title.trim(), requiredCount, rateEUR } });
            };
            return (
              <Card key={role.id}>
                <div className="row row--between">
                  <div style={{ minWidth: 0 }}>
                    <p className="card__title">{role.title}</p>
                    <p className="card__subtitle">
                      {filled}/{role.requiredCount} мест
                      {pending > 0 ? ` · ${pending} ждут` : ""}
                      {role.rateEUR != null ? ` · ${role.rateEUR} €` : ""}
                    </p>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    {canAssign && (
                      <button
                        className="icon-btn icon-btn--danger"
                        aria-label="Удалить роль"
                        title="Удалить роль"
                        disabled={deleteProjectRole.isPending}
                        onClick={() => confirm("Удалить роль вместе с кандидатами?") && deleteProjectRole.mutate(role.id)}
                      >
                        <ProjectGlyph type="close" />
                      </button>
                    )}
                  </div>
                </div>
                {roleAssignments.length > 0 && (
                  <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                    {roleAssignments.map((a) => {
                      const st = ASSIGN_STATUS[a.status];
                      return (
                        <div key={a.id} className="row row--between" style={{ gap: 8 }}>
                          <div className="row" style={{ gap: 6, minWidth: 0 }}>
                            <Chip label={userName(a.userId)} tone={a.status === "declined" ? "neutral" : "ok"} />
                            <Chip label={st.label} tone={st.tone} />
                          </div>
                          {canAssign && (
                            <button
                              className="icon-btn"
                              aria-label="Снять кандидата"
                              title="Снять"
                              disabled={removeAssignment.isPending}
                              onClick={() => removeAssignment.mutate(a.id)}
                            >
                              <ProjectGlyph type="close" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {canAssign && (
                  <div className="stack" style={{ gap: 8, marginTop: 10 }}>
                    <div className="row">
                      <Field label="Роль">
                        <Input
                          value={draft.title}
                          onChange={(e) => setRoleDrafts((prev) => ({ ...prev, [role.id]: { ...draft, title: e.target.value } }))}
                        />
                      </Field>
                      <Field label="Нужно">
                        <Input
                          type="number"
                          min="1"
                          value={draft.requiredCount}
                          onChange={(e) => setRoleDrafts((prev) => ({ ...prev, [role.id]: { ...draft, requiredCount: e.target.value } }))}
                        />
                      </Field>
                      <Field label="€">
                        <Input
                          type="number"
                          min="0"
                          value={draft.rateEUR}
                          onChange={(e) => setRoleDrafts((prev) => ({ ...prev, [role.id]: { ...draft, rateEUR: e.target.value } }))}
                        />
                      </Field>
                      <Button variant="secondary" disabled={updateProjectRole.isPending || !draft.title.trim()} onClick={saveRole}>
                        ✓
                      </Button>
                    </div>
                    {available.length > 0 && (
                      <>
                        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                          {available.map((u) => {
                            const picked = selected.includes(u.id);
                            return (
                              <button
                                key={u.id}
                                className={`chip ${picked ? "chip--accent chip--solid" : "chip--neutral"}`}
                                style={{ border: "none", cursor: "pointer" }}
                                onClick={() => toggleCandidate(u.id)}
                                type="button"
                              >
                                {personName(u)}
                              </button>
                            );
                          })}
                        </div>
                        <div className="row">
                          <Button variant="secondary" block disabled={selected.length === 0 || addAssignment.isPending} onClick={() => void submit(false)}>
                            Добавить
                          </Button>
                          <Button block disabled={selected.length === 0 || addAssignment.isPending} onClick={() => void submit(true)}>
                            TG
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
          {(projectRoles.data ?? []).length === 0 && (assignments.data ?? []).map((a) => {
            const st = ASSIGN_STATUS[a.status];
            return (
              <Card key={a.id}>
                <div className="row row--between">
                  <p className="card__title">{a.roleNote || "Роль"}</p>
                  <Chip label={st.label} tone={st.tone} />
                </div>
                <p className="card__subtitle" style={{ marginTop: 2 }}>
                  {userName(a.userId)}{a.rateEUR != null ? ` · ${a.rateEUR} €` : ""}
                </p>
              </Card>
            );
          })}
        </div>
      )}
      {canAssign && (() => {
        const count = Math.max(1, Number(roleCount) || 1);
        const rateNum = roleRate.trim() ? Number(roleRate) : null;
        return (
          <Card>
            <div className="row">
              <Field label="Роль">
                <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="Шеф монтажа" />
              </Field>
              <Field label="Нужно">
                <Input type="number" min="1" value={roleCount} onChange={(e) => setRoleCount(e.target.value)} />
              </Field>
              <Field label="€">
                <Input type="number" min="0" value={roleRate} onChange={(e) => setRoleRate(e.target.value)} placeholder="150" />
              </Field>
              <Button
                disabled={!roleTitle.trim() || createProjectRole.isPending}
                onClick={() =>
                  createProjectRole.mutate(
                    { projectId: p.id, input: { title: roleTitle.trim(), requiredCount: count, rateEUR: rateNum } },
                    { onSuccess: () => { setRoleTitle(""); setRoleCount("1"); setRoleRate(""); } }
                  )
                }
              >
                +
              </Button>
            </div>
          </Card>
        );
      })()}
        </>
      )}

      {/* Contractor (subrent) equipment */}
      {currentTab === "contractors" && (canReserve || (invoice.data && (invoice.data.contractorCostEUR > 0))) && (
        <>
          <SectionTitle>{t("contractors.title")}</SectionTitle>
          <ContractorEquipment projectId={id} canManage={canReserve} />
        </>
      )}

      {currentTab === "finance" && canFinance && invoice.data && (() => {
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
              <p className="card__title">Деньги по проекту</p>
              <div className="project-stat-grid">
                <FinanceTile
                  icon="finance"
                  label={inv.dueEUR >= 0 ? t("finance.clientDebt") : "Переплата"}
                  value={eur(Math.abs(inv.dueEUR))}
                  tone={inv.dueEUR > 0 ? "var(--danger)" : "var(--ok)"}
                />
                <FinanceTile
                  icon="contractors"
                  label={t("finance.payables")}
                  value={eur(inv.contractorCostEUR + inv.laborEUR)}
                  tone={inv.contractorCostEUR + inv.laborEUR > 0 ? "var(--warn)" : "var(--ok)"}
                />
                <FinanceTile icon="invoice" label={t("finance.revenue")} value={eur(inv.invoiceEUR)} />
                <FinanceTile icon="overview" label={t("finance.net")} value={eur(inv.profitEUR)} tone={inv.profitEUR >= 0 ? "var(--ok)" : "var(--alert)"} />
              </div>
              <p className="card__subtitle" style={{ marginTop: 8 }}>
                {t("finance.clientDebt")} — по смете и оплатам.
              </p>
            </Card>
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
              {inv.contractorCostEUR > 0 && (
                <div className="row row--between" style={{ padding: "4px 0" }}>
                <span className="card__subtitle">{t("finance.subrentCost")}</span>
                  <span style={{ color: "var(--text)" }}>{eur(inv.contractorCostEUR)}</span>
                </div>
              )}
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

            <Button block variant="secondary" onClick={() => navigate(`/projects/${p.id}/invoice`)}>
              Счёт
            </Button>
            {invoiceVersions.length > 0 && (
              <Card>
                <p className="card__title">Версии сметы</p>
                <div style={{ marginTop: 6 }}>
                  {invoiceVersions.slice(0, 5).map((version) => (
                    <div key={version.id} className="row row--between" style={{ padding: "5px 0", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: "var(--text)" }}>{version.number || "Смета"} · {version.lang}</div>
                        <div className="card__subtitle">{version.date} · {dateTime(version.createdAt)}</div>
                      </div>
                      <span style={{ color: "var(--text)", whiteSpace: "nowrap" }}>{eur(version.totalEUR)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        );
      })()}

      <ResolveReservationSheet
        reservation={resolving}
        modelName={resolving ? modelName(resolving.modelId) : ""}
        onClose={() => setResolving(null)}
      />
      <EditProjectSheet open={editOpen} project={p} clients={clients.data ?? []} onClose={() => setEditOpen(false)} />
      <div className="project-tabbar" role="tablist" aria-label="Разделы проекта">
        {visibleTabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const count = tabCount(tab.count);
          return (
            <button
              key={tab.id}
              className={`project-tabbar__item ${isActive ? "project-tabbar__item--active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
              aria-label={tab.label}
              aria-selected={isActive}
              role="tab"
              type="button"
              style={{ ["--tab-c" as string]: tab.tone ? `var(--${tab.tone === "accent" ? "accent" : tab.tone})` : "var(--accent)" }}
            >
              <span className="project-tabbar__icon">
                <ProjectGlyph type={tab.id} />
                {count > 0 && <span className="project-tabbar__badge">{count > 9 ? "9+" : count}</span>}
              </span>
              <span className="project-tabbar__label">{tab.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FinanceTile({ icon, label, value, tone = "var(--text)", onClick }: { icon: ProjectTabIcon; label: string; value: string; tone?: string; onClick?: () => void }) {
  const content = (
    <>
      <span className="project-stat-tile__icon"><ProjectGlyph type={icon} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="card__subtitle">{label}</div>
        <div className="card__title" style={{ color: tone, marginTop: 2 }}>{value}</div>
      </div>
    </>
  );
  if (onClick) {
    return (
      <button className="project-stat-tile project-stat-tile--button" onClick={onClick} type="button">
        {content}
      </button>
    );
  }
  return (
    <div className="project-stat-tile">
      {content}
    </div>
  );
}

function ProjectActionButton({ icon, label, meta, onClick }: { icon: ProjectTabIcon; label: string; meta?: string; onClick: () => void }) {
  return (
    <button className="project-action" onClick={onClick} type="button">
      <span className="project-action__icon"><ProjectGlyph type={icon} /></span>
      <span className="project-action__text">
        <span className="project-action__label">{label}</span>
        {meta && <span className="project-action__meta">{meta}</span>}
      </span>
    </button>
  );
}

function ProjectGlyph({ type }: { type: ProjectTabIcon }) {
  const p = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (type) {
    case "overview":
      return <svg viewBox="0 0 24 24"><rect x="4.5" y="5" width="6" height="6" rx="1.4" {...p} /><rect x="13.5" y="5" width="6" height="6" rx="1.4" {...p} /><rect x="4.5" y="14" width="6" height="5" rx="1.4" {...p} /><rect x="13.5" y="14" width="6" height="5" rx="1.4" {...p} /></svg>;
    case "back":
      return <svg viewBox="0 0 24 24"><path d="M5 12h14" {...p} /><path d="M12 5l-7 7 7 7" {...p} /></svg>;
    case "reservations":
      return <svg viewBox="0 0 24 24"><rect x="4.5" y="6.5" width="15" height="12" rx="2.4" {...p} /><path d="M8 4.5v4M16 4.5v4M4.5 10.5h15" {...p} /></svg>;
    case "timing":
      return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" {...p} /><path d="M12 7.5v5l3.2 2" {...p} /></svg>;
    case "team":
      return <svg viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3" {...p} /><path d="M4 19c.5-3.1 2.5-5 5-5s4.5 1.9 5 5" {...p} /><path d="M15.4 11.4a2.5 2.5 0 10-.1-4.8M15.8 14.2c2.2.4 3.7 2 4.2 4.8" {...p} /></svg>;
    case "contractors":
      return <svg viewBox="0 0 24 24"><rect x="4.5" y="7" width="15" height="11" rx="2" {...p} /><path d="M8.5 7V5.8A1.8 1.8 0 0110.3 4h3.4a1.8 1.8 0 011.8 1.8V7M8 12h8M8 15h5" {...p} /></svg>;
    case "finance":
      return <svg viewBox="0 0 24 24"><path d="M7 8.2h8.8M7 12h7M7 15.8h8.8" {...p} /><path d="M18 5.5c-1.2-.9-2.6-1.3-4.2-1.3-4.2 0-7.3 3.3-7.3 7.8s3.1 7.8 7.3 7.8c1.6 0 3-.4 4.2-1.3" {...p} /></svg>;
    case "plan":
      return <svg viewBox="0 0 24 24"><path d="M4.5 18.5h15M6 16l4-8 3 5 2-3 3 6" {...p} /><circle cx="10" cy="8" r="1.3" fill="currentColor" stroke="none" /></svg>;
    case "invoice":
      return <svg viewBox="0 0 24 24"><path d="M7 4.5h8l3 3v12H7z" {...p} /><path d="M15 4.5v3h3M9.5 12h5M9.5 15.5h5" {...p} /></svg>;
    case "close":
      return <svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...p} /></svg>;
    default:
      return null;
  }
}
