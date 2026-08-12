import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useParams, useNavigate, useSearchParams } from "react-router-dom";
import type { Equipment, Finance, People, Projects, Transport } from "@sever/contracts";
import { amountAfterDiscountEUR, discountAmountEUR, PROJECT_STATUSES } from "@sever/contracts";
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
  useUpdateTiming,
  useSetTimingAssignees,
  useDeleteTiming,
  useAddAssignment,
  useRemoveAssignment,
  useCreateProjectRole,
  useUpdateProjectRole,
  useDeleteProjectRole,
  useAllUnits,
  useProjectInvoice,
  useCreateProjectPing,
  useCreateProjectReminder,
  useDeleteProjectReminder,
  useProjectPings,
  useProjectReminders,
  useReservationAvailabilities,
  useReservationAvailability,
  useContractorItems,
} from "./hooks.ts";
import { ResolveReservationSheet } from "./components/ResolveReservationSheet.tsx";
import { EditProjectSheet } from "./components/EditProjectSheet.tsx";
import { DuplicateProjectSheet } from "./components/DuplicateProjectSheet.tsx";
import { TimingTimeline } from "./components/TimingTimeline.tsx";
import { TimingReminderPicker } from "./components/TimingReminderPicker.tsx";
import { ContractorEquipment } from "./components/ContractorEquipment.tsx";
import { toLocalInput, isoFromLocal } from "../../lib/datetime.ts";
import { personName } from "../../lib/people.ts";
import { useFxRates, useInvoiceVersions, useProjectEstimateLines, useProjectEstimateSettings, useReplaceProjectEstimateLines, useSetProjectEstimateSettings } from "../finance/hooks.ts";
import { useVenues } from "../plans/hooks.ts";
import { useWarehouses } from "../warehouse/hooks.ts";
import { useRouteQuote, useTransportConfig, useVehicles } from "../transport/hooks.ts";
import { staleDurationEstimateIds } from "./estimateReconciliation.ts";

const ASSIGN_STATUS: Record<Projects.AssignmentStatus, { label: string; tone: "ok" | "info" | "warn" | "neutral" }> = {
  added: { label: "в команде", tone: "ok" },
  invited: { label: "приглашён", tone: "info" },
  accepted: { label: "принял", tone: "ok" },
  declined: { label: "отклонил", tone: "warn" },
  cancelled: { label: "отменён", tone: "neutral" },
};

const assignmentRank = (status: Projects.AssignmentStatus) =>
  status === "added" || status === "accepted" ? 0 : status === "invited" ? 1 : status === "declined" ? 2 : 3;

const PING_STATUS: Record<Projects.ProjectPingStatus, { label: string; tone: "ok" | "warn" | "neutral" }> = {
  pending: { label: "ждём", tone: "neutral" },
  confirmed: { label: "будет", tone: "ok" },
  declined: { label: "не будет", tone: "warn" },
};

const REMINDER_PRESETS = [
  { label: "1д", minutes: 24 * 60 },
  { label: "3д", minutes: 3 * 24 * 60 },
  { label: "7д", minutes: 7 * 24 * 60 },
  { label: "свой", minutes: 0 },
];
const TIMING_REMINDER_OPTIONS = [
  { label: "В момент события", minutes: 0 },
  { label: "За 5 минут", minutes: 5 },
  { label: "За 15 минут", minutes: 15 },
  { label: "За 30 минут", minutes: 30 },
  { label: "За 1 час", minutes: 60 },
  { label: "За 2 часа", minutes: 120 },
  { label: "За 1 день", minutes: 1440 },
];

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

interface FinanceDraftLine {
  id: string;
  source: Finance.ProjectEstimateLineSource;
  sourceRefId: string | null;
  section: string;
  name: string;
  qty: string;
  priceEUR: string;
  costEUR: string;
  discountType: Finance.DiscountType;
  discountValue: string;
  comment: string;
  hidden: boolean;
}

function projectTabFrom(value: string | null): ProjectTab {
  return PROJECT_TABS.some((tab) => tab.id === value) ? (value as ProjectTab) : "overview";
}

export function ProjectDetailPage({ projectId, embedded = false }: { projectId?: string; embedded?: boolean } = {}) {
  const { id: routeId = "" } = useParams();
  const id = projectId ?? routeId;
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = useSession();
  const { t } = useI18n();
  const canManage = can("projects.manage");
  const canReserve = can("projects.reservation.manage");
  const canTiming = can("projects.timing.manage");
  const canAssign = can("projects.assignment.manage");
  const canViewPeople = can("people.view");
  const canFinance = can("finance.view");
  const canManageFinance = can("finance.manage");
  const canPlans = can("plans.view", "plans.manage");

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
  const serverInvoiceVersions = useInvoiceVersions(id, canFinance);
  const estimateLines = useProjectEstimateLines(id, canFinance);
  const estimateSettings = useProjectEstimateSettings(id, canFinance);
  const replaceEstimateLines = useReplaceProjectEstimateLines(id);
  const setEstimateSettings = useSetProjectEstimateSettings(id);
  const fxRates = useFxRates();
  const pings = useProjectPings(id, canAssign);
  const reminders = useProjectReminders(id, canAssign);
  const reservationAvailabilities = useReservationAvailabilities(reservations.data ?? []);
  const contractorItems = useContractorItems(id);

  const setStatus = useSetProjectStatus();
  const addReservation = useCreateReservation();
  const deleteReservation = useDeleteReservation();
  const addTiming = useAddTiming();
  const updateTiming = useUpdateTiming();
  const setTimingAssignees = useSetTimingAssignees();
  const deleteTiming = useDeleteTiming();
  const addAssignment = useAddAssignment();
  const removeAssignment = useRemoveAssignment();
  const createProjectRole = useCreateProjectRole();
  const updateProjectRole = useUpdateProjectRole();
  const deleteProjectRole = useDeleteProjectRole();
  const createPing = useCreateProjectPing(id);
  const createReminder = useCreateProjectReminder(id);
  const deleteReminder = useDeleteProjectReminder(id);

  const [resModel, setResModel] = useState("");
  const [resModelQuery, setResModelQuery] = useState("");
  const [debouncedResModelQuery, setDebouncedResModelQuery] = useState("");
  const [resModelOpen, setResModelOpen] = useState(false);
  const [resQty, setResQty] = useState("1");
  const [resIsReserve, setResIsReserve] = useState(false);
  const selectedReservationAvailability = useReservationAvailability(
    resModel,
    project.data?.startsAt ?? "",
    project.data?.endsAt ?? "",
    canReserve && !!project.data && !!resModel
  );
  const [timingTitle, setTimingTitle] = useState("");
  const [timingStart, setTimingStart] = useState("");
  const [timingEnd, setTimingEnd] = useState("");
  const [editingTimingId, setEditingTimingId] = useState("");
  const [timingEditTitle, setTimingEditTitle] = useState("");
  const [timingEditStart, setTimingEditStart] = useState("");
  const [timingEditEnd, setTimingEditEnd] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [roleCount, setRoleCount] = useState("1");
  const [roleRate, setRoleRate] = useState("");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, { title: string; requiredCount: string; rateEUR: string }>>({});
  const [assignCandidates, setAssignCandidates] = useState<Record<string, string[]>>({});
  const [candidateQueries, setCandidateQueries] = useState<Record<string, string>>({});
  const [pingTitle, setPingTitle] = useState("");
  const [pingMessage, setPingMessage] = useState("");
  const [reminderPreset, setReminderPreset] = useState("1440");
  const [reminderCustomHours, setReminderCustomHours] = useState("12");
  const [reminderMode, setReminderMode] = useState<Projects.ProjectReminderRecipientMode>("project_team");
  const [reminderUserIds, setReminderUserIds] = useState<string[]>([]);
  const [reminderQuery, setReminderQuery] = useState("");
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [resolving, setResolving] = useState<Projects.ReservationDTO | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [invoiceVersions, setInvoiceVersions] = useState<StoredInvoiceVersion[]>([]);
  const [estimateDrafts, setEstimateDrafts] = useState<FinanceDraftLine[]>([]);
  const [estimateSeeded, setEstimateSeeded] = useState(false);
  const [totalDiscountType, setTotalDiscountType] = useState<Finance.DiscountType>("percent");
  const [totalDiscountValue, setTotalDiscountValue] = useState("0");
  const estimateSectionSuggestions = useMemo(() => [...new Set([
    ...(estimateLines.data ?? []).map((line) => line.section.trim()),
    ...(invoice.data?.rentalLines ?? []).map((line) => line.section.trim()),
    ...(invoice.data?.laborLines ?? []).map((line) => line.section.trim()),
  ].filter(Boolean))], [estimateLines.data, invoice.data?.rentalLines, invoice.data?.laborLines]);
  const activeTab = projectTabFrom(searchParams.get("tab"));

  useEffect(() => {
    try {
      setInvoiceVersions(JSON.parse(localStorage.getItem(`sever.invoice.versions.${id}`) || "[]"));
    } catch {
      setInvoiceVersions([]);
    }
  }, [id, activeTab]);

  useEffect(() => {
    if (!serverInvoiceVersions.data) return;
    setInvoiceVersions(serverInvoiceVersions.data);
  }, [serverInvoiceVersions.data]);

  useEffect(() => {
    if (estimateSeeded || !invoice.data || !estimateLines.data) return;
    const saved = estimateLines.data;
    const staleIds = staleDurationEstimateIds(saved, invoice.data.rentalLines, invoice.data.days);
    const missingDerived = invoice.data.rentalLines.filter((line) => !saved.some((item) => item.id === line.refId || item.sourceRefId === line.refId)).map((line) => ({
      id: line.refId,
      source: line.section === "Crew" ? "labor" as const : "equipment" as const,
      sourceRefId: line.refId,
      section: line.section,
      name: line.label,
      qty: line.qty,
      priceEUR: line.amountEUR,
      costEUR: line.costEUR,
      discountType: "percent" as const,
      discountValue: 0,
      comment: line.detail,
      hidden: false,
    }));
    const reconciledSaved = saved.map((line) => staleIds.has(line.id) ? { ...line, hidden: true } : line);
    const source = saved.length > 0 ? [...reconciledSaved, ...missingDerived] : [...invoice.data.rentalLines, ...invoice.data.laborLines].map((line) => ({
      id: line.refId,
      source: line.section === "Crew" ? "labor" as const : "equipment" as const,
      sourceRefId: line.refId,
      section: line.section,
      name: line.label,
      qty: line.qty,
      priceEUR: line.amountEUR,
      costEUR: line.costEUR,
      discountType: "percent" as const,
      discountValue: 0,
      comment: line.detail,
      hidden: false,
    }));
    setEstimateDrafts(source.map((line) => ({ id: line.id, source: line.source, sourceRefId: line.sourceRefId, section: line.section, name: line.name, qty: String(line.qty), priceEUR: String(line.priceEUR), costEUR: String(line.costEUR), discountType: line.discountType ?? "percent", discountValue: String(line.discountValue ?? 0), comment: line.comment, hidden: line.hidden ?? false })));
    setEstimateSeeded(true);
  }, [estimateLines.data, estimateSeeded, invoice.data]);

  useEffect(() => {
    if (!estimateSettings.data) return;
    setTotalDiscountType(estimateSettings.data.totalDiscountType);
    setTotalDiscountValue(String(estimateSettings.data.totalDiscountValue));
  }, [estimateSettings.data]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedResModelQuery(resModelQuery), 500);
    return () => window.clearTimeout(timer);
  }, [resModelQuery]);

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
    return model?.trackingMode === "quantity" || model?.trackingMode === "cable" ? sum : sum + r.qty;
  }, 0);
  const timingCount = (timings.data ?? []).length;
  const teamCount = (projectRoles.data ?? []).length > 0
    ? (projectRoles.data ?? []).reduce((sum, role) => sum + role.requiredCount, 0)
    : (assignments.data ?? []).filter((a) => a.status === "added" || a.status === "accepted").length;
  const contractorCost = invoice.data?.contractorCostEUR ?? 0;
  const projectPayableCost = (invoice.data?.contractorCostEUR ?? 0) + (invoice.data?.laborEUR ?? 0);
  const contractorCount = new Set((contractorItems.data ?? []).map((item) => item.contractorId)).size;
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
  const activeAssignments = (assignments.data ?? []).filter((a) => a.status === "added" || a.status === "accepted");
  const projectPeople = [...new Map(activeAssignments
    .map((a) => (people.data ?? []).find((u) => u.id === a.userId))
    .filter(Boolean)
    .map((person) => [person!.id, person!] as const)).values()];
  const reminderOffsetMinutes = reminderPreset === "0"
    ? Math.max(1, Math.round((Number(reminderCustomHours) || 1) * 60))
    : Number(reminderPreset);
  const createReminderFromForm = () => {
    createReminder.mutate({
      offsetMinutes: reminderOffsetMinutes,
      recipientMode: reminderMode,
      userIds: reminderMode === "selected" ? reminderUserIds : [],
      title: reminderTitle.trim(),
      note: reminderNote.trim() || null,
    }, {
      onSuccess: () => {
        setReminderUserIds([]);
        setReminderTitle("");
        setReminderNote("");
      },
    });
  };
  const setTimingReminderOffsets = async (timing: Projects.TimingDTO, offsets: number[]) => {
    const existing = (reminders.data ?? []).filter((reminder) => reminder.timingId === timing.id && !reminder.sentAt);
    await Promise.all(existing.map((reminder) => deleteReminder.mutateAsync(reminder.id)));
    await Promise.all([...new Set(offsets)].map((offsetMinutes) => createReminder.mutateAsync({
      timingId: timing.id,
      offsetMinutes,
      recipientMode: "selected",
      userIds: timing.assigneeIds,
      title: timing.title,
      note: `${dateTime(timing.startsAt)} – ${dateTime(timing.endsAt)}`,
    })));
  };

  return (
    <div className={`stack project-mobile-page ${embedded ? "project-desktop-embedded" : ""}`}>
      {!embedded && <button className="icon-text-action" onClick={() => navigate(-1)} aria-label="Назад">
        <ProjectGlyph type="back" />
        <span>Назад</span>
      </button>}

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
            <Button variant="secondary" onClick={() => setDuplicateOpen(true)}>Дублировать</Button>
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
            const availability = reservationAvailabilities.data?.[r.id];
            return (
              <Card key={r.id}>
                <div className="row row--between">
                  <p className="card__title">{modelName(r.modelId)} × {r.qty}</p>
                  <StatusBadge tone={availability?.shortage ? "warn" : issued ? "warn" : resolved ? "ok" : "info"}>
                    {availability?.shortage ? "дефицит" : issued ? "выдано" : resolved ? "распределено" : "по модели"}
                  </StatusBadge>
                </div>
                {r.isReserve && <Chip label="Резерв · не в счёт" tone="neutral" />}
                {availability && (
                  <ReservationAvailabilityLine availability={availability} compact />
                )}
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
                {canReserve && (
                  <div className="row" style={{ marginTop: 10 }}>
                    <Button variant="secondary" block disabled={issued} onClick={() => setResolving(r)}>
                      {resolved ? "Изменить" : "Распределить"}
                    </Button>
                    <button
                      className="icon-btn icon-btn--danger"
                      aria-label="Удалить бронь"
                      title="Удалить"
                      disabled={deleteReservation.isPending || issuedCount > 0}
                      onClick={() => confirm("Удалить эту бронь?") && deleteReservation.mutate(r.id)}
                    >
                      <ProjectGlyph type="close" />
                    </button>
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
          <div className="stack" style={{ gap: 10 }}>
            <div className="row">
            <div style={{ flex: 2 }}>
              <ModelAutocomplete
                models={models.data ?? []}
                value={resModel}
                query={resModelQuery}
                debouncedQuery={debouncedResModelQuery}
                open={resModelOpen}
                onOpen={setResModelOpen}
                onQuery={(value) => {
                  setResModelQuery(value);
                  setResModel("");
                  setResModelOpen(true);
                }}
                onSelect={(model) => {
                  setResModel(model.id);
                  setResModelQuery(model.name);
                  setResQty("1");
                  setResModelOpen(false);
                }}
              />
            </div>
            <div style={{ width: 80 }}>
              <Input type="number" value={resQty} onChange={(e) => setResQty(e.target.value)} />
            </div>
            </div>
            <div className="row row--between">
            <label style={{ cursor: "pointer" }}>
              <span className="row" style={{ gap: 6, whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={resIsReserve} onChange={(e) => setResIsReserve(e.target.checked)} />
                В резерв · не добавлять в счёт
              </span>
            </label>
            <Button
              disabled={!resModel || addReservation.isPending}
              onClick={() =>
                addReservation.mutate({
                  projectId: p.id,
                  modelId: resModel,
                  qty: Number(resQty),
                  isReserve: resIsReserve,
                  startsAt: p.startsAt,
                  endsAt: p.endsAt,
                }, { onSuccess: () => { setResModel(""); setResModelQuery(""); setResQty("1"); setResIsReserve(false); setResModelOpen(false); } })
              }
            >
              + Бронь
            </Button>
            </div>
          </div>
          {selectedReservationAvailability.data && (
            <ReservationAvailabilityLine availability={selectedReservationAvailability.data} requested={Number(resQty) || 0} />
          )}
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
          const timingReminders = (reminders.data ?? []).filter((reminder) => reminder.timingId === t.id && !reminder.sentAt);
          const timingOffsets = timingReminders.map((reminder) => reminder.offsetMinutes);
          return (
            <Card key={t.id}>
              {editingTimingId === t.id ? (
                <div className="stack" style={{ gap: 8 }}>
                  <Input value={timingEditTitle} onChange={(e) => setTimingEditTitle(e.target.value)} placeholder="Название события" />
                  <div className="row">
                    <Input type="datetime-local" value={timingEditStart} onChange={(e) => setTimingEditStart(e.target.value)} />
                    <Input type="datetime-local" value={timingEditEnd} onChange={(e) => setTimingEditEnd(e.target.value)} />
                  </div>
                  <div className="row">
                    <Button block disabled={!timingEditTitle.trim() || new Date(timingEditEnd).getTime() <= new Date(timingEditStart).getTime() || updateTiming.isPending} onClick={() => updateTiming.mutate({ id: t.id, input: { title: timingEditTitle.trim(), startsAt: isoFromLocal(timingEditStart), endsAt: isoFromLocal(timingEditEnd) } }, { onSuccess: () => setEditingTimingId("") })}>Сохранить</Button>
                    <Button block variant="ghost" onClick={() => setEditingTimingId("")}>Отмена</Button>
                  </div>
                </div>
              ) : <>
              <div className="row row--between">
                <div style={{ minWidth: 0 }}>
                  <p className="card__title">{t.title}</p>
                  <p className="card__subtitle">{dateTime(t.startsAt)} – {dateTime(t.endsAt)}</p>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <Button variant="ghost" onClick={() => { setEditingTimingId(t.id); setTimingEditTitle(t.title); setTimingEditStart(toLocalInput(t.startsAt)); setTimingEditEnd(toLocalInput(t.endsAt)); }}>Изменить</Button>
                  <button className="icon-btn icon-btn--danger" aria-label="Удалить тайминг" title="Удалить" onClick={() => deleteTiming.mutate(t.id)}><ProjectGlyph type="close" /></button>
                </div>
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
              <div className="row row--between" style={{ marginTop: 8, alignItems: "flex-start" }}>
                <label className="row" style={{ gap: 8 }}>
                  <input type="checkbox" checked={timingOffsets.length > 0} disabled={t.assigneeIds.length === 0 || createReminder.isPending || deleteReminder.isPending} onChange={(e) => void setTimingReminderOffsets(t, e.target.checked ? [60] : [])} />
                  <span>Пинг в ТГ</span>
                </label>
                {timingOffsets.length > 0 && (
                  <TimingReminderPicker
                    options={TIMING_REMINDER_OPTIONS}
                    value={timingOffsets}
                    disabled={createReminder.isPending || deleteReminder.isPending}
                    onSave={(offsets) => setTimingReminderOffsets(t, offsets)}
                  />
                )}
              </div>
              </>}
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
            const declined = roleAssignments.filter((a) => a.status === "declined").length;
            const cancelled = roleAssignments.filter((a) => a.status === "cancelled").length;
            const openSeats = Math.max(0, role.requiredCount - filled);
            const closed = filled >= role.requiredCount;
            const draft = roleDrafts[role.id] ?? {
              title: role.title,
              requiredCount: String(role.requiredCount),
              rateEUR: role.rateEUR == null ? "" : String(role.rateEUR),
            };
            const confirmedIds = new Set(
              (assignments.data ?? [])
                .filter((a) => a.status === "added" || a.status === "accepted")
                .map((a) => a.userId)
            );
            const roleActiveIds = new Set(roleAssignments.filter((a) => a.status !== "declined" && a.status !== "cancelled").map((a) => a.userId));
            const available = closed ? [] : (people.data ?? []).filter((u) => !confirmedIds.has(u.id) && !roleActiveIds.has(u.id));
            const selected = (assignCandidates[role.id] ?? []).filter((uid) => available.some((u) => u.id === uid));
            const directAddAllowed = selected.length > 0 && selected.length <= openSeats;
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
                    <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      <Chip label={`${filled}/${role.requiredCount}`} tone={closed ? "ok" : "warn"} />
                      {pending > 0 && <Chip label={`ждут ${pending}`} tone="info" />}
                      {openSeats > 0 && <Chip label={`мест ${openSeats}`} tone="neutral" />}
                      {closed && <Chip label="закрыто" tone="ok" />}
                      {role.rateEUR != null && <Chip label={`${role.requiredCount * role.rateEUR} €`} tone="neutral" />}
                    </div>
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
                    {[...roleAssignments].sort((a, b) => assignmentRank(a.status) - assignmentRank(b.status)).map((a) => {
                      const st = ASSIGN_STATUS[a.status];
                      return (
                        <div key={a.id} className="row row--between" style={{ gap: 8 }}>
                          <div className="row" style={{ gap: 6, minWidth: 0 }}>
                            <Chip label={userName(a.userId)} tone={a.status === "declined" || a.status === "cancelled" ? "neutral" : "ok"} />
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
                        <CandidatePicker
                          people={available}
                          selectedIds={selected}
                          query={candidateQueries[role.id] ?? ""}
                          onQuery={(value) => setCandidateQueries((prev) => ({ ...prev, [role.id]: value }))}
                          onToggle={toggleCandidate}
                        />
                        <div className="row">
                          <Button
                            variant="secondary"
                            block
                            disabled={!directAddAllowed || addAssignment.isPending}
                            title={selected.length > openSeats ? `Свободно мест: ${openSeats}` : "Добавить без Telegram"}
                            onClick={() => void submit(false)}
                          >
                            ✓
                          </Button>
                          <Button block disabled={selected.length === 0 || addAssignment.isPending} onClick={() => void submit(true)}>
                            TG
                          </Button>
                        </div>
                      </>
                    )}
                    {(declined > 0 || cancelled > 0) && (
                      <p className="card__subtitle">
                        {declined > 0 ? `отклонено ${declined}` : ""}{declined > 0 && cancelled > 0 ? " · " : ""}{cancelled > 0 ? `отменено ${cancelled}` : ""}
                      </p>
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
      {canAssign && (
        <TeamPingPanel
          people={projectPeople}
          pings={pings.data ?? []}
          reminders={reminders.data ?? []}
          pingTitle={pingTitle}
          onPingTitle={setPingTitle}
          pingMessage={pingMessage}
          onPingMessage={setPingMessage}
          onPing={(userId) => createPing.mutate({ userId, title: pingTitle.trim(), message: pingMessage.trim() || null })}
          pingPending={createPing.isPending}
          reminderPreset={reminderPreset}
          onReminderPreset={setReminderPreset}
          reminderCustomHours={reminderCustomHours}
          onReminderCustomHours={setReminderCustomHours}
          reminderMode={reminderMode}
          onReminderMode={setReminderMode}
          reminderUserIds={reminderUserIds}
          onReminderUserIds={setReminderUserIds}
          reminderQuery={reminderQuery}
          onReminderQuery={setReminderQuery}
          reminderTitle={reminderTitle}
          onReminderTitle={setReminderTitle}
          reminderNote={reminderNote}
          onReminderNote={setReminderNote}
          onCreateReminder={createReminderFromForm}
          createReminderPending={createReminder.isPending}
          onDeleteReminder={(reminderId) => deleteReminder.mutate(reminderId)}
          deleteReminderPending={deleteReminder.isPending}
        />
      )}
        </>
      )}

      {/* Contractor (subrent) equipment */}
      {currentTab === "contractors" && (canReserve || (invoice.data && (invoice.data.contractorCostEUR > 0))) && (
        <>
          <SectionTitle>{t("contractors.title")}</SectionTitle>
          <ContractorEquipment projectId={id} projectEndsAt={p.endsAt} canManage={canReserve} canManageFinance={canManageFinance} />
        </>
      )}

      {currentTab === "finance" && canFinance && invoice.data && (() => {
        const inv = invoice.data;
        const rsdRateToEUR = (fxRates.data ?? []).find((rate) => rate.currency === "RSD")?.rateToEUR ?? 0;
        const visibleEstimateDrafts = estimateDrafts.filter((line) => !line.hidden);
        const draftSubtotalEUR = visibleEstimateDrafts.reduce((sum, line) => sum + amountAfterDiscountEUR(Number(line.priceEUR) || 0, line.discountType, Number(line.discountValue) || 0, rsdRateToEUR), 0);
        const totalDraftDiscountEUR = discountAmountEUR(draftSubtotalEUR, totalDiscountType, Number(totalDiscountValue) || 0, rsdRateToEUR);
        const draftTotalEUR = Math.max(0, draftSubtotalEUR - totalDraftDiscountEUR);
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
            <SectionTitle>Экономика проекта · €</SectionTitle>
            {canManageFinance && <DeliveryCalculator venueId={p.venueId} people={projectPeople} onApply={(quote, vehicle) => setEstimateDrafts((rows) => {
              const next = { id: `manual-delivery-${Date.now()}`, source: "manual" as const, sourceRefId: null, section: "Доставка", name: `Доставка · ${vehicle.model} ${vehicle.plateNumber}`, qty: "1", priceEUR: String(quote.fuelCostEUR), costEUR: String(quote.fuelCostEUR), discountType: "percent" as const, discountValue: "0", comment: `${quote.distanceKm} км · ${quote.fuelLitres} л${quote.roundTrip ? " · туда и обратно" : ""}`, hidden: false };
              const index = rows.findIndex((line) => line.id.startsWith("manual-delivery-") || (line.source === "manual" && line.section.toLowerCase() === "доставка"));
              return index < 0 ? [...rows, next] : rows.map((line, i) => i === index ? { ...next, id: line.id } : line);
            })} />}
            <Card>
              <div className="row row--between">
                <div>
                  <p className="card__title">Себестоимость и цена клиенту</p>
                  <p className="card__subtitle">Это единственный источник строк для счёта.</p>
                </div>
                {canManageFinance && <Button variant="secondary" onClick={() => setEstimateDrafts((lines) => [...lines, { id: `manual-${Date.now()}`, source: "manual", sourceRefId: null, section: "Прочее", name: "", qty: "1", priceEUR: "0", costEUR: "0", discountType: "percent", discountValue: "0", comment: "", hidden: false }])}>+ Позиция</Button>}
              </div>
              <div className="stack" style={{ marginTop: 10 }}>
                {estimateDrafts.map((line, index) => !line.hidden && (
                  <div className="invoice-line" key={line.id}>
                    <div className="row" style={{ gap: 6 }}>
                      <Input disabled={!canManageFinance} value={line.name} onChange={(e) => setEstimateDrafts((rows) => rows.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} placeholder="Наименование" />
                      {canManageFinance && <button className="icon-btn icon-btn--danger" onClick={() => setEstimateDrafts((rows) => rows.filter((_, i) => i !== index))} aria-label="Удалить позицию">×</button>}
                    </div>
                    <div className="invoice-line-grid">
                      <Input disabled={!canManageFinance} value={line.section} list="project-estimate-sections" autoComplete="on" onChange={(e) => setEstimateDrafts((rows) => rows.map((row, i) => i === index ? { ...row, section: e.target.value } : row))} placeholder="Категория" />
                      <Input disabled={!canManageFinance} type="number" value={line.qty} onChange={(e) => setEstimateDrafts((rows) => rows.map((row, i) => i === index ? { ...row, qty: e.target.value } : row))} placeholder="К" />
                      <Input disabled={!canManageFinance} type="number" step="0.01" value={line.priceEUR} onChange={(e) => setEstimateDrafts((rows) => rows.map((row, i) => i === index ? { ...row, priceEUR: e.target.value } : row))} placeholder="Ц · клиенту" />
                      <Input disabled={!canManageFinance} type="number" step="0.01" value={line.costEUR} onChange={(e) => setEstimateDrafts((rows) => rows.map((row, i) => i === index ? { ...row, costEUR: e.target.value } : row))} placeholder="СС" />
                    </div>
                    <DiscountControl
                      type={line.discountType}
                      value={line.discountValue}
                      resultEUR={amountAfterDiscountEUR(Number(line.priceEUR) || 0, line.discountType, Number(line.discountValue) || 0, rsdRateToEUR)}
                      disabled={!canManageFinance}
                      onType={(discountType) => setEstimateDrafts((rows) => rows.map((row, i) => i === index ? { ...row, discountType } : row))}
                      onValue={(discountValue) => setEstimateDrafts((rows) => rows.map((row, i) => i === index ? { ...row, discountValue } : row))}
                    />
                    <Input disabled={!canManageFinance} value={line.comment} onChange={(e) => setEstimateDrafts((rows) => rows.map((row, i) => i === index ? { ...row, comment: e.target.value } : row))} placeholder="Комментарий" />
                  </div>
                ))}
              </div>
              <datalist id="project-estimate-sections">{estimateSectionSuggestions.map((section) => <option key={section} value={section} />)}</datalist>
              <div className="project-estimate-total">
                <div>
                  <p className="card__title">Скидка на общую сумму</p>
                  <p className="card__subtitle">До общей скидки {eur(draftSubtotalEUR)} · скидка {eur(totalDraftDiscountEUR)}</p>
                </div>
                <DiscountControl type={totalDiscountType} value={totalDiscountValue} resultEUR={draftTotalEUR} disabled={!canManageFinance} onType={setTotalDiscountType} onValue={setTotalDiscountValue} />
                <div className="row row--between"><span className="card__title">Итого клиенту</span><span className="card__title">{eur(draftTotalEUR)}</span></div>
              </div>
              {!rsdRateToEUR && (totalDiscountType === "fixed_rsd" || estimateDrafts.some((line) => line.discountType === "fixed_rsd")) && <p className="card__subtitle discount-rate-warning">Чтобы применить скидку в динарах, задайте курс RSD в настройках.</p>}
              {canManageFinance && <Button block disabled={replaceEstimateLines.isPending || setEstimateSettings.isPending || estimateDrafts.some((line) => !line.name.trim() || !(Number(line.qty) > 0) || (line.discountType === "percent" && Number(line.discountValue) > 100)) || (totalDiscountType === "percent" && Number(totalDiscountValue) > 100)} onClick={() => void Promise.all([
                replaceEstimateLines.mutateAsync(estimateDrafts.map((line) => ({
                  ...(line.id.startsWith("manual-") ? {} : { id: line.id }), source: line.source, sourceRefId: line.sourceRefId, section: line.section.trim(), name: line.name.trim(), qty: Number(line.qty), priceEUR: Number(line.priceEUR) || 0, costEUR: Number(line.costEUR) || 0, discountType: line.discountType, discountValue: Math.max(0, Number(line.discountValue) || 0), comment: line.comment, hidden: line.hidden,
                }))),
                setEstimateSettings.mutateAsync({ totalDiscountType, totalDiscountValue: Math.max(0, Number(totalDiscountValue) || 0) }),
              ])}>Сохранить €</Button>}
            </Card>
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
              {inv.discountEUR > 0 && <>
                <div className="row row--between" style={{ padding: "4px 0", marginTop: 6 }}><span className="card__subtitle">До общей скидки</span><span>{eur(inv.subtotalEUR)}</span></div>
                <div className="row row--between" style={{ padding: "4px 0" }}><span className="card__subtitle">Общая скидка</span><span>−{eur(inv.discountEUR)}</span></div>
              </>}
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
              Сформировать счёт
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
      <DuplicateProjectSheet open={duplicateOpen} project={p} onClose={() => setDuplicateOpen(false)} />
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

function DiscountControl({ type, value, resultEUR, disabled, onType, onValue }: {
  type: Finance.DiscountType;
  value: string;
  resultEUR: number;
  disabled: boolean;
  onType: (type: Finance.DiscountType) => void;
  onValue: (value: string) => void;
}) {
  return (
    <div className="discount-control">
      <div className="discount-switch" role="group" aria-label="Тип скидки">
        <button type="button" className={type === "percent" ? "is-active" : ""} aria-pressed={type === "percent"} disabled={disabled} onClick={() => onType("percent")}>%</button>
        <button type="button" className={type === "fixed_rsd" ? "is-active" : ""} aria-pressed={type === "fixed_rsd"} disabled={disabled} onClick={() => onType("fixed_rsd")}>дин.</button>
      </div>
      <Input disabled={disabled} type="number" min="0" max={type === "percent" ? "100" : undefined} step="0.01" value={value} onChange={(event) => onValue(event.target.value)} aria-label={type === "percent" ? "Скидка в процентах" : "Скидка в динарах"} />
      <span className="discount-result">После скидки {eur(resultEUR)}</span>
    </div>
  );
}

function DeliveryCalculator({ venueId, people, onApply }: { venueId: string | null; people: People.UserDTO[]; onApply: (quote: Transport.RouteQuoteDTO, vehicle: Transport.VehicleDTO) => void }) {
  const venues = useVenues(), warehouses = useWarehouses(), vehicles = useVehicles(), config = useTransportConfig(), quote = useRouteQuote();
  const venue = (venues.data ?? []).find((item) => item.id === venueId);
  const [warehouseId, setWarehouseId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [fuelPrice, setFuelPrice] = useState("1.6");
  const [distance, setDistance] = useState("");
  const [roundTrip, setRoundTrip] = useState(true);
  const selectedWarehouse = (warehouses.data ?? []).find((item) => item.id === (warehouseId || warehouses.data?.find((item) => item.isDefault)?.id));
  const selectedVehicle = (vehicles.data ?? []).find((item) => item.id === (vehicleId || vehicles.data?.[0]?.id));
  const compatibleDrivers = selectedVehicle ? people.filter((person) => person.drivingLicenseCategories.includes(selectedVehicle.requiredLicenseCategory)) : [];
  const calculate = () => {
    if (!selectedWarehouse?.address || !venue?.address || !selectedVehicle) return;
    quote.mutate({ originAddress: selectedWarehouse.address, destinationAddress: venue.address, vehicleId: selectedVehicle.id, fuelPriceEURPerL: Number(fuelPrice) || 0, roundTrip, distanceKmOverride: distance ? Number(distance) : null });
  };
  return <Card><div className="row row--between"><div><p className="card__title">Доставка</p><p className="card__subtitle">Маршрут, километраж и топливо по автомобилю</p></div>{config.data && <Chip label={config.data.googleMapsConfigured ? "Google Maps" : "ручной км"} tone={config.data.googleMapsConfigured ? "ok" : "warn"} />}</div>
    <div className="row" style={{ marginTop: 10 }}><Field label="Откуда"><Select value={warehouseId || selectedWarehouse?.id || ""} onChange={e => setWarehouseId(e.target.value)} options={(warehouses.data ?? []).map(item => ({ value: item.id, label: item.name }))} /></Field><Field label="Куда"><Input disabled value={venue?.address ?? "Укажите адрес площадки"} /></Field></div>
    <div className="row"><Field label="Автомобиль"><Select value={vehicleId || selectedVehicle?.id || ""} onChange={e => setVehicleId(e.target.value)} options={(vehicles.data ?? []).map(item => ({ value: item.id, label: `${item.plateNumber} · ${item.model} · права ${item.requiredLicenseCategory}` }))} /></Field><Field label="Топливо, €/л"><Input type="number" step="0.01" value={fuelPrice} onChange={e => setFuelPrice(e.target.value)} /></Field>{!config.data?.googleMapsConfigured && <Field label="Км в одну сторону"><Input type="number" step="0.1" value={distance} onChange={e => setDistance(e.target.value)} placeholder="25" /></Field>}</div>
    {selectedVehicle && <p className="card__subtitle" style={{ marginBottom: 8 }}>Совместимые водители в команде: {compatibleDrivers.length ? compatibleDrivers.map(person => personName(person)).join(", ") : `нет людей с категорией ${selectedVehicle.requiredLicenseCategory}`}</p>}
    <label className="row" style={{ marginBottom: 10 }}><input type="checkbox" checked={roundTrip} onChange={e => setRoundTrip(e.target.checked)} /> Туда и обратно</label>
    <Button block disabled={!selectedWarehouse?.address || !venue?.address || !selectedVehicle || (!config.data?.googleMapsConfigured && !(Number(distance) > 0)) || quote.isPending} onClick={calculate}>Рассчитать доставку</Button>
    {quote.data && <div className="row row--between" style={{ marginTop: 10 }}><span>{quote.data.distanceKm} км · {quote.data.fuelLitres} л · СС {eur(quote.data.fuelCostEUR)}</span><Button variant="secondary" onClick={() => onApply(quote.data!, selectedVehicle!)}>Добавить в €</Button></div>}
  </Card>;
}

function TeamPingPanel({
  people,
  pings,
  reminders,
  pingTitle,
  onPingTitle,
  pingMessage,
  onPingMessage,
  onPing,
  pingPending,
  reminderPreset,
  onReminderPreset,
  reminderCustomHours,
  onReminderCustomHours,
  reminderMode,
  onReminderMode,
  reminderUserIds,
  onReminderUserIds,
  reminderQuery,
  onReminderQuery,
  reminderTitle,
  onReminderTitle,
  reminderNote,
  onReminderNote,
  onCreateReminder,
  createReminderPending,
  onDeleteReminder,
  deleteReminderPending,
}: {
  people: People.UserDTO[];
  pings: Projects.ProjectPingDTO[];
  reminders: Projects.ProjectReminderDTO[];
  pingTitle: string;
  onPingTitle: (value: string) => void;
  pingMessage: string;
  onPingMessage: (value: string) => void;
  onPing: (userId: string) => void;
  pingPending: boolean;
  reminderPreset: string;
  onReminderPreset: (value: string) => void;
  reminderCustomHours: string;
  onReminderCustomHours: (value: string) => void;
  reminderMode: Projects.ProjectReminderRecipientMode;
  onReminderMode: (value: Projects.ProjectReminderRecipientMode) => void;
  reminderUserIds: string[];
  onReminderUserIds: (value: string[]) => void;
  reminderQuery: string;
  onReminderQuery: (value: string) => void;
  reminderTitle: string;
  onReminderTitle: (value: string) => void;
  reminderNote: string;
  onReminderNote: (value: string) => void;
  onCreateReminder: () => void;
  createReminderPending: boolean;
  onDeleteReminder: (reminderId: string) => void;
  deleteReminderPending: boolean;
}) {
  const selectedModeHasPeople = reminderMode !== "selected" || reminderUserIds.length > 0;
  const canCreateReminder = people.length > 0 && selectedModeHasPeople && !!reminderTitle.trim() && !createReminderPending;
  const toggleReminderUser = (userId: string) => {
    onReminderUserIds(reminderUserIds.includes(userId) ? reminderUserIds.filter((id) => id !== userId) : [...reminderUserIds, userId]);
  };
  const nameById = (userId: string) => personName(people.find((person) => person.id === userId), "Человек");

  return (
    <Card>
      <div className="row row--between" style={{ alignItems: "center" }}>
        <p className="card__title">Пинги и напоминания</p>
        <Chip label={String(people.length)} tone="info" />
      </div>

      <div className="stack" style={{ gap: 10, marginTop: 10 }}>
        <p className="card__subtitle">Отправить пинг сейчас</p>
        <Field label="Название">
          <Input value={pingTitle} onChange={(e) => onPingTitle(e.target.value)} placeholder="Например, подтверждение участия" />
        </Field>
        <Field label="Описание">
          <Input value={pingMessage} onChange={(e) => onPingMessage(e.target.value)} placeholder="Сообщение для получателя" />
        </Field>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {people.map((person) => (
            <button
              key={person.id}
              className="chip chip--neutral"
              style={{ border: "none", cursor: pingPending || !pingTitle.trim() ? "not-allowed" : "pointer" }}
              disabled={pingPending || !pingTitle.trim()}
              onClick={() => onPing(person.id)}
              type="button"
              title="Отправить пинг"
            >
              {personName(person)} · TG
            </button>
          ))}
          {people.length === 0 && <span className="card__subtitle">В команде пока никого</span>}
        </div>
      </div>

      <div className="stack" style={{ gap: 10, marginTop: 14 }}>
        <p className="card__subtitle">Запланировать напоминание</p>
        <Field label="Название">
          <Input value={reminderTitle} onChange={(e) => onReminderTitle(e.target.value)} placeholder="Например, подтверждение участия" />
        </Field>
        <Field label="Описание">
          <Input value={reminderNote} onChange={(e) => onReminderNote(e.target.value)} placeholder="Сообщение для получателя" />
        </Field>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {REMINDER_PRESETS.map((preset) => (
            <button
              key={preset.minutes}
              type="button"
              className={`chip ${reminderPreset === String(preset.minutes) ? "chip--accent chip--solid" : "chip--neutral"}`}
              style={{ border: "none", cursor: "pointer" }}
              onClick={() => onReminderPreset(String(preset.minutes))}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {reminderPreset === "0" && (
          <Field label="Часы до старта">
            <Input type="number" min="1" value={reminderCustomHours} onChange={(e) => onReminderCustomHours(e.target.value)} placeholder="12" />
          </Field>
        )}
        <div className="row">
          <Field label="Кому">
            <Select
              value={reminderMode}
              onChange={(e) => onReminderMode(e.target.value as Projects.ProjectReminderRecipientMode)}
              options={[
                { value: "project_team", label: "Вся команда" },
                { value: "selected", label: "Выбрать" },
              ]}
            />
          </Field>
          <Button variant="secondary" disabled={!canCreateReminder} onClick={onCreateReminder}>
            +
          </Button>
        </div>
        {reminderMode === "selected" && (
          <CandidatePicker
            people={people}
            selectedIds={reminderUserIds}
            query={reminderQuery}
            onQuery={onReminderQuery}
            onToggle={toggleReminderUser}
          />
        )}
      </div>

      {reminders.length > 0 && (
        <div className="stack" style={{ gap: 6, marginTop: 14 }}>
          {reminders.map((reminder) => (
            <div key={reminder.id} className="row row--between" style={{ gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: "var(--text)", fontWeight: 800 }}>{reminder.title}</div>
                <div className="card__subtitle">
                  {reminderOffsetLabel(reminder.offsetMinutes)} до старта · {reminder.recipientMode === "project_team" ? "вся команда" : `${reminder.userIds.length} выбрано`}
                  {reminder.sentAt ? ` · отправлено ${dateTime(reminder.sentAt)}` : ""}
                </div>
              </div>
              {!reminder.sentAt && (
                <Button variant="ghost" disabled={deleteReminderPending} onClick={() => onDeleteReminder(reminder.id)}>
                  ×
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {pings.length > 0 && (
        <div className="stack" style={{ gap: 6, marginTop: 14 }}>
          {pings.slice(0, 6).map((ping) => {
            const status = PING_STATUS[ping.status];
            return (
              <div key={ping.id} className="row row--between" style={{ gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "var(--text)", fontWeight: 800 }}>{ping.title}</div>
                  <div className="card__subtitle">{nameById(ping.userId)} · {dateTime(ping.createdAt)}</div>
                </div>
                <Chip label={status.label} tone={status.tone} />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function reminderOffsetLabel(minutes: number): string {
  if (minutes >= 24 * 60 && minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}д`;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}ч`;
  return `${minutes}м`;
}

function CandidatePicker({
  people,
  selectedIds,
  query,
  onQuery,
  onToggle,
}: {
  people: People.UserDTO[];
  selectedIds: string[];
  query: string;
  onQuery: (value: string) => void;
  onToggle: (userId: string) => void;
}) {
  const selected = selectedIds.map((id) => people.find((p) => p.id === id)).filter(Boolean) as People.UserDTO[];
  const q = query.trim().toLowerCase();
  const results = people
    .filter((p) => !selectedIds.includes(p.id))
    .filter((p) => {
      if (!q) return true;
      const hay = [p.nickname, p.displayName, p.email, p.telegramUsername].filter(Boolean).join(" ").toLocaleLowerCase();
      return hay.includes(q);
    })
    .slice(0, 8);

  return (
    <div className="stack" style={{ gap: 8 }}>
      {selected.length > 0 && (
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {selected.map((u) => (
            <button
              key={u.id}
              className="chip chip--accent chip--solid"
              style={{ border: "none", cursor: "pointer" }}
              onClick={() => onToggle(u.id)}
              type="button"
              title="Убрать из выбора"
            >
              {personName(u)} ×
            </button>
          ))}
        </div>
      )}
      <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Найти человека" />
      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        {results.map((u) => (
          <button
            key={u.id}
            className="chip chip--neutral"
            style={{ border: "none", cursor: "pointer" }}
            onClick={() => onToggle(u.id)}
            type="button"
          >
            {personName(u)}
          </button>
        ))}
        {results.length === 0 && <span className="card__subtitle">Никого не найдено</span>}
      </div>
    </div>
  );
}

function ReservationAvailabilityLine({
  availability,
  requested = 0,
  compact = false,
}: {
  availability: Projects.ReservationAvailabilityDTO;
  requested?: number;
  compact?: boolean;
}) {
  const shortageAfterRequest = Math.max(0, availability.booked + requested - availability.total);
  const freeAfterRequest = Math.max(0, availability.total - availability.booked - requested);
  const shortage = requested > 0 ? shortageAfterRequest : availability.shortage;
  const free = requested > 0 ? freeAfterRequest : availability.free;
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: compact ? 6 : 10 }}>
      <Chip label={`свободно ${free}`} tone={shortage ? "warn" : "ok"} />
      <Chip label={`забронировано ${availability.booked}`} tone="neutral" />
      <Chip label={`всего ${availability.total}`} tone="neutral" />
      {shortage > 0 && <Chip label={`не хватает ${shortage}`} tone="warn" />}
    </div>
  );
}

function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function modelMatches(model: Equipment.EquipmentModelDTO, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return false;
  const hay = normalizeSearch(model.name);
  const compactHay = hay.replace(/\s+/g, "");
  const compactQ = q.replace(/\s+/g, "");
  if (compactQ && compactHay.includes(compactQ)) return true;
  return q.split(/\s+/).every((part) => hay.includes(part));
}

function ModelAutocomplete({
  models,
  value,
  query,
  debouncedQuery,
  open,
  onOpen,
  onQuery,
  onSelect,
}: {
  models: Equipment.EquipmentModelDTO[];
  value: string;
  query: string;
  debouncedQuery: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  onQuery: (value: string) => void;
  onSelect: (model: Equipment.EquipmentModelDTO) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<"top" | "bottom">("bottom");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = models.find((model) => model.id === value) ?? null;
  const results = useMemo(
    () => models.filter((model) => modelMatches(model, debouncedQuery)).slice(0, 8),
    [debouncedQuery, models]
  );
  const searching = query.trim() !== debouncedQuery.trim();
  const showList = open && query.trim().length > 0;
  useEffect(() => {
    if (!showList) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom;
    const above = rect.top;
    setPlacement(below < 260 && above > below ? "top" : "bottom");
  }, [showList, query, debouncedQuery]);
  useEffect(() => setActiveIndex(0), [debouncedQuery]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      onOpen(true);
      if (!results.length) return;
      setActiveIndex((current) => event.key === "ArrowDown"
        ? (current + 1) % results.length
        : (current - 1 + results.length) % results.length);
    } else if (event.key === "Enter" && showList && results[activeIndex]) {
      event.preventDefault();
      onSelect(results[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onOpen(false);
    }
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <Input
        value={query}
        onFocus={() => onOpen(true)}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showList}
        aria-controls="equipment-model-results"
        aria-activedescendant={showList && results[activeIndex] ? `equipment-model-${results[activeIndex].id}` : undefined}
        placeholder="Найти модель"
      />
      {selected && (
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          <Chip label={selected.name} tone="ok" />
        </div>
      )}
      {showList && (
        <div
          id="equipment-model-results"
          role="listbox"
          className="stack"
          style={{
            position: "absolute",
            zIndex: 120,
            top: placement === "bottom" ? "calc(100% + 6px)" : undefined,
            bottom: placement === "top" ? "calc(100% + 6px)" : undefined,
            left: 0,
            right: 0,
            gap: 4,
            maxHeight: Math.min(280, Math.max(180, placement === "top" ? rootRef.current?.getBoundingClientRect().top ?? 240 : window.innerHeight - (rootRef.current?.getBoundingClientRect().bottom ?? 0) - 18)),
            overflow: "auto",
            padding: 6,
            border: "1px solid var(--bdr-hi)",
            borderRadius: 10,
            background: "var(--bg)",
            boxShadow: "0 18px 44px rgba(0,0,0,.48)",
          }}
        >
          {searching ? (
            <span className="card__subtitle" style={{ padding: 8 }}>Ищу…</span>
          ) : results.length === 0 ? (
            <span className="card__subtitle" style={{ padding: 8 }}>Модель не найдена</span>
          ) : (
            results.map((model, index) => (
              <button
                id={`equipment-model-${model.id}`}
                role="option"
                aria-selected={index === activeIndex}
                key={model.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelect(model)}
                style={{
                  border: "none",
                  borderRadius: 8,
                  background: index === activeIndex || model.id === value ? "var(--accent)" : "transparent",
                  color: index === activeIndex || model.id === value ? "#fff" : "var(--text)",
                  padding: "10px 12px",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "block", fontWeight: 800 }}>{model.name}</span>
                <span className="card__subtitle">{model.trackingMode === "cable" ? "cable" : model.trackingMode === "quantity" ? "quantity" : "serial"} · {eur(model.dailyPriceEUR)}/сут</span>
              </button>
            ))
          )}
        </div>
      )}
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
