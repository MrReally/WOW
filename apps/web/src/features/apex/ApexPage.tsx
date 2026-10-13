import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ApexFinanceSummaryDTO, ApexRentalRow, Problem } from "@sever/contracts";
import {
  Card,
  Metric,
  SectionHead,
  Chip,
  Dot,
  ProgressBar,
  VenueTrace,
  ComingSoon,
  Loading,
  ErrorState,
  EmptyState,
} from "../../ui-kit/index.ts";
import { projectStatusTone } from "../../lib/labels.ts";
import { useI18n } from "../../app/i18n.tsx";
import { useApexDashboard, useResolveProblem, useOpsProjects } from "./hooks.ts";
import { ProjectStageProgress } from "../projects/components/ProjectStageProgress.tsx";

/* Hero — current operation identity (v2 OperationHeader). */
function OperationHero({ current, upcoming }: { current: ApexRentalRow[]; upcoming: ApexRentalRow[] }) {
  const { t, dateRange } = useI18n();
  const lead = current[0] ?? upcoming[0] ?? null;
  return (
    <div style={{ position: "relative", padding: "6px 4px 16px", overflow: "hidden" }}>
      <VenueTrace width={186} height={140} style={{ position: "absolute", right: -28, top: -6, opacity: 0.5, pointerEvents: "none" }} />
      <div style={{ position: "relative" }}>
        <div className="row" style={{ gap: 8 }}>
          <Dot tone={current.length ? "ok" : "warn"} glow />
          <span className="t-label">{current.length ? t("apex.currentOperation") : t("apex.nextOperation")}</span>
        </div>
        <div className="t-cond" style={{ fontSize: 36, fontWeight: 800, color: "var(--text)", lineHeight: 0.98, marginTop: 8 }}>
          {lead ? lead.project.name : t("apex.noOperations")}
        </div>
        {lead && (
          <div className="row" style={{ gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 13, color: "var(--text2)" }}>{lead.clientName}</span>
            <span className="t-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
              · {dateRange(lead.project.startsAt, lead.project.endsAt)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function NeedsRow({
  problem,
  projectName,
  onOpen,
  onResolve,
}: {
  problem: Problem;
  projectName: string | null;
  onOpen: (() => void) | null;
  /** Only resolvable ("hideable") problems get a button — e.g. утеря. */
  onResolve: (() => void) | null;
}) {
  const { problemKindLabel, t, dateTime } = useI18n();
  const tone = problem.severity === "critical" ? "alert" : problem.severity === "warning" ? "warn" : "info";
  return (
    <div className="lrow">
      <Dot tone={tone} size={8} />
      <div
        style={{ flex: 1, minWidth: 0, cursor: onOpen ? "pointer" : "default" }}
        onClick={() => onOpen?.()}
      >
        <div className="row" style={{ gap: 8 }}>
          <Chip label={problemKindLabel[problem.kind] ?? problem.kind} tone={tone} />
          {(projectName || problem.kind === "unit_lost" || problem.kind === "unit_repair") && (
            <span className="lrow__title" style={{ fontSize: 13 }}>{projectName ?? t("apex.noProject")}</span>
          )}
          {(problem.kind === "unit_lost" || problem.kind === "unit_repair") && (
            <span className="t-mono" style={{ fontSize: 11, color: "var(--text3)" }}>· {dateTime(problem.createdAt)}</span>
          )}
        </div>
        <div className="lrow__detail" style={{ marginTop: 4 }}>{problem.detail}</div>
      </div>
      {onResolve && (
        <button className="btn btn--ghost" style={{ height: 36, padding: "0 10px" }} onClick={onResolve}>
          {t("common.close")}
        </button>
      )}
    </div>
  );
}

function RentalCard({ row, onOpen }: { row: ApexRentalRow; onOpen: () => void }) {
  const { eur, dateRange, projectStatusLabel, t } = useI18n();
  return (
    <Card onClick={onOpen}>
      <div className="row row--between">
        <div style={{ minWidth: 0 }}>
          <p className="card__title">{row.project.name}</p>
          <p className="card__subtitle">{row.clientName} · {dateRange(row.project.startsAt, row.project.endsAt)}</p>
        </div>
        <Chip label={projectStatusLabel[row.project.status]} tone={projectStatusTone[row.project.status]} />
      </div>
      <div className="row" style={{ marginTop: 12, gap: 22 }}>
        <Metric value={row.unitsOnProject} label={t("apex.onProject")} />
        {row.finance && (
          <Metric value={eur(row.finance.debtEUR)} label={t("finance.clientDebt")} tone={row.finance.debtEUR > 0 ? "danger" : "ok"} />
        )}
      </div>
    </Card>
  );
}

function FinanceSummaryCard({ summary }: { summary: ApexFinanceSummaryDTO }) {
  const { eur, money, t } = useI18n();
  return (
    <Card>
      <p className="card__title">{t("apex.finance")}</p>
      <div className="row" style={{ marginTop: 12, gap: 18, flexWrap: "wrap" }}>
        <Metric value={eur(summary.revenueEUR)} label={t("finance.revenue")} />
        <Metric value={eur(summary.paidEUR)} label={t("finance.paid")} tone="ok" />
        <Metric value={eur(summary.clientDebtEUR)} label={t("finance.clientDebt")} tone={summary.clientDebtEUR ? "danger" : "ok"} />
        <Metric value={eur(summary.contractorDebtEUR)} label={t("finance.payables")} tone={summary.contractorDebtEUR ? "danger" : "ok"} />
        <Metric value={eur(summary.profitAfterRecordedCostEUR)} label={t("finance.net")} tone={summary.profitAfterRecordedCostEUR >= 0 ? "ok" : "danger"} />
      </div>
      {summary.accountBalances.length > 0 && (
        <p className="card__subtitle" style={{ marginTop: 10 }}>
          {t("finance.balances")}: {summary.accountBalances.map((a) => money(a.balance, a.currency)).join(" · ")}
        </p>
      )}
    </Card>
  );
}

export function ApexPage() {
  const { data, isLoading, error, refetch } = useApexDashboard();
  const resolve = useResolveProblem();
  const opsProjects = useOpsProjects();
  const navigate = useNavigate();
  const { eur, t, dateRange, projectStatusLabel } = useI18n();
  const [segment, setSegment] = useState<"now" | "soon" | "problems">("now");

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return null;

  const totalDebt = data.debts.reduce((a, d) => a + d.debtEUR, 0);
  const selectedRentals = segment === "now" ? data.current : data.upcoming;
  const reservedUnits = data.upcoming.reduce((sum, row) => sum + row.unitsOnProject, 0);
  const projectUnits = data.current.reduce((sum, row) => sum + row.unitsOnProject, 0);
  const repairProblems = data.problems.filter((problem) => problem.kind === "unit_repair").length;

  return (
    <div className="stack apex-glass-page">
      <div className="apex-stat-grid">
        <button className="apex-stat-tile" onClick={() => setSegment("now")}><span>Текущие</span><strong className={data.current.length ? "is-accent" : ""}>{data.current.length}</strong></button>
        <button className="apex-stat-tile" onClick={() => setSegment("soon")}><span>Предстоящие</span><strong>{data.upcoming.length}</strong></button>
        <button className="apex-stat-tile" onClick={() => setSegment("problems")}><span>Проблемы</span><strong className={data.problems.length ? "is-danger" : ""}>{data.problems.length}</strong></button>
      </div>

      <div className="apex-segments" aria-label="Фильтр обзора">
        {([['now', 'сейчас'], ['soon', 'скоро'], ['problems', 'проблемы']] as const).map(([value, label]) => <button key={value} className={segment === value ? "is-active" : ""} onClick={() => setSegment(value)}>{label}</button>)}
      </div>

      <div className="card apex-current-card">
        {segment === "problems" ? (data.problems.length ? data.problems.map((problem) => {
          const projectId = problem.refs?.projectId;
          const project = projectId ? (opsProjects.data ?? []).find((item) => item.id === projectId) : null;
          return <NeedsRow key={problem.id} problem={problem} projectName={project?.name ?? null} onOpen={projectId ? () => navigate(`/projects/${projectId}`) : null} onResolve={problem.kind === "unit_lost" ? () => resolve.mutate({ id: problem.id, scope: "equipment" }) : null} />;
        }) : <EmptyState title="Проблем нет" hint="Утери, дефициты и долги появятся здесь" />) : selectedRentals.length ? selectedRentals.map((row) => (
          <button className="apex-rental-row" key={row.project.id} onClick={() => navigate(segment === "now" ? `/operations/projects/${row.project.id}` : `/projects/${row.project.id}`)}>
            <span className="apex-rental-head"><span><strong>{row.project.name}</strong><small>{row.clientName} · {dateRange(row.project.startsAt, row.project.endsAt)}</small></span><Chip label={projectStatusLabel[row.project.status]} tone={projectStatusTone[row.project.status]} /></span>
            {segment === "now" && <ProjectStageProgress stage={row.project.operationStage} complete={Boolean(row.project.warehouseTurnoverCompletedAt)} />}
          </button>
        )) : <EmptyState title={segment === "now" ? t("apex.noActive") : t("apex.noUpcoming")} />}
      </div>

      <div className="apex-section-head"><span>Загрузка оборудования</span><button onClick={() => navigate("/warehouse")}>Склад ›</button></div>
      <Card>
        <p className="card__subtitle">Что простаивает, что в дефиците по броням</p>
        <div className="apex-stock-bar" aria-hidden="true"><i /><i /><i /><i /></div>
        <div className="apex-stock-legend">
          <Metric value={reservedUnits} label="Резерв" />
          <Metric value={projectUnits} label="На проекте" />
          <Metric value={repairProblems} label="Ремонт" tone={repairProblems ? "danger" : undefined} />
        </div>
      </Card>

      <div className="apex-section-head"><span>Финансы</span><button onClick={() => navigate("/finance")}>Finance ›</button></div>
      <Card>
        <div className="apex-finance-grid">
          <Metric value={eur(data.financeSummary.revenueEUR)} label="Выручка" />
          <Metric value={eur(data.financeSummary.recordedCostEUR)} label="Затраты" />
          <Metric value={eur(data.financeSummary.profitAfterRecordedCostEUR)} label="Прибыль" tone={data.financeSummary.profitAfterRecordedCostEUR >= 0 ? "ok" : "danger"} />
        </div>
        <div className="apex-finance-grid apex-finance-grid--second">
          <Metric value={eur(totalDebt)} label="Долг клиентов" tone={totalDebt ? "danger" : undefined} />
          <Metric value={eur(data.financeSummary.contractorDebtEUR)} label="К оплате" />
          <Metric value={data.financeSummary.accountBalances.map((account) => `${account.balance.toLocaleString("ru-RU")} ${account.currency}`).join(" · ") || eur(0)} label="На счетах" />
        </div>
      </Card>

      <div className="apex-section-head"><span>Открытые брони</span><small>· {data.upcoming.length}</small></div>
      <div className="card apex-bookings">
        {data.upcoming.length ? data.upcoming.map((row) => <button key={row.project.id} onClick={() => navigate(`/projects/${row.project.id}`)}><span><strong>{row.project.name}</strong><small>{dateRange(row.project.startsAt, row.project.endsAt)} · {row.unitsOnProject} ед.</small></span><b>›</b></button>) : <EmptyState title="Открытых броней нет" />}
      </div>
    </div>
  );
}
