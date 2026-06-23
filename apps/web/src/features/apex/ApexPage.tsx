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
  const { problemKindLabel, t } = useI18n();
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
          {projectName && <span className="lrow__title" style={{ fontSize: 13 }}>{projectName}</span>}
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
  const { eur, t } = useI18n();

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return null;

  const totalDebt = data.debts.reduce((a, d) => a + d.debtEUR, 0);

  return (
    <div>
      <OperationHero current={data.current} upcoming={data.upcoming} />

      <div className="card card--flat" style={{ padding: "14px 16px" }}>
        <div className="row" style={{ gap: 22, flexWrap: "wrap" }}>
          <Metric value={data.current.length} label={t("apex.running")} />
          <Metric value={data.upcoming.length} label={t("apex.planned")} />
          <Metric value={data.problems.length} label={t("apex.problems")} tone={data.problems.length ? "danger" : "ok"} />
          <Metric value={eur(totalDebt)} label={t("finance.clientDebt")} tone={totalDebt ? "danger" : "ok"} />
        </div>
        {data.upcoming.length + data.current.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <ProgressBar
              pct={(data.current.length / Math.max(1, data.current.length + data.upcoming.length)) * 100}
              tone="info"
              height={6}
            />
          </div>
        )}
      </div>

      {data.problems.length > 0 && (
        <>
          <SectionHead label={t("apex.needsAttention")} meta={String(data.problems.length)} />
          <div className="card" style={{ padding: "2px 16px" }}>
            {data.problems.map((p) => {
              const pid = p.refs?.projectId;
              const proj = pid ? (opsProjects.data ?? []).find((x) => x.id === pid) : null;
              return (
                <NeedsRow
                  key={p.id}
                  problem={p}
                  projectName={proj?.name ?? null}
                  onOpen={pid ? () => navigate(`/projects/${pid}`) : null}
                  onResolve={p.kind === "unit_lost" ? () => resolve.mutate({ id: p.id, scope: "equipment" }) : null}
                />
              );
            })}
          </div>
        </>
      )}

      <SectionHead label={t("apex.activeNow")} meta={data.current.length ? undefined : "—"} />
      {data.current.length === 0 ? (
        <EmptyState title={t("apex.noActive")} />
      ) : (
        <div className="stack">
          {data.current.map((r) => (
            <RentalCard key={r.project.id} row={r} onOpen={() => navigate(`/projects/${r.project.id}`)} />
          ))}
        </div>
      )}

      <SectionHead label={t("apex.upcoming")} meta={data.upcoming.length ? undefined : "—"} />
      {data.upcoming.length === 0 ? (
        <EmptyState title={t("apex.noUpcoming")} />
      ) : (
        <div className="stack">
          {data.upcoming.map((r) => (
            <RentalCard key={r.project.id} row={r} onOpen={() => navigate(`/projects/${r.project.id}`)} />
          ))}
        </div>
      )}

      <SectionHead label={t("apex.finance")} />
      <div className="stack">
        <FinanceSummaryCard summary={data.financeSummary} />
        <ComingSoon title={t("apex.utilization")} hint={t("apex.utilizationHint")} />
      </div>
    </div>
  );
}
