import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ApexRentalRow, Problem } from "@sever/contracts";
import {
  Card,
  Button,
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
import { eur, dateRange, projectStatusLabel, projectStatusTone, problemKindLabel } from "../../lib/labels.ts";
import { useApexDashboard, useResolveProblem, useOpsProjects, useOpsModels } from "./hooks.ts";
import { OpsSheet } from "../warehouse/components/OpsSheet.tsx";

/* Hero — current operation identity (v2 OperationHeader). */
function OperationHero({ current, upcoming }: { current: ApexRentalRow[]; upcoming: ApexRentalRow[] }) {
  const lead = current[0] ?? upcoming[0] ?? null;
  return (
    <div style={{ position: "relative", padding: "6px 4px 16px", overflow: "hidden" }}>
      <VenueTrace width={186} height={140} style={{ position: "absolute", right: -28, top: -6, opacity: 0.5, pointerEvents: "none" }} />
      <div style={{ position: "relative" }}>
        <div className="row" style={{ gap: 8 }}>
          <Dot tone={current.length ? "ok" : "warn"} glow />
          <span className="t-label">{current.length ? "ТЕКУЩАЯ ОПЕРАЦИЯ" : "БЛИЖАЙШАЯ ОПЕРАЦИЯ"}</span>
        </div>
        <div className="t-cond" style={{ fontSize: 36, fontWeight: 800, color: "var(--text)", lineHeight: 0.98, marginTop: 8 }}>
          {lead ? lead.project.name : "Нет операций"}
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

function NeedsRow({ problem, onResolve }: { problem: Problem; onResolve: () => void }) {
  const tone = problem.severity === "critical" ? "alert" : problem.severity === "warning" ? "warn" : "info";
  return (
    <div className="lrow">
      <Dot tone={tone} size={8} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="lrow__title">{problem.title}</div>
        <div className="lrow__detail">{problemKindLabel[problem.kind] ?? problem.kind} · {problem.detail}</div>
      </div>
      <button className="btn btn--ghost" style={{ height: 36, padding: "0 10px" }} onClick={onResolve}>
        Решено
      </button>
    </div>
  );
}

function RentalCard({ row, onOpen }: { row: ApexRentalRow; onOpen: () => void }) {
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
        <Metric value={row.unitsOnProject} label="ед. на проекте" />
        {row.finance && (
          <Metric value={eur(row.finance.debtEUR)} label="долг" tone={row.finance.debtEUR > 0 ? "danger" : "ok"} />
        )}
      </div>
    </Card>
  );
}

export function ApexPage() {
  const { data, isLoading, error, refetch } = useApexDashboard();
  const resolve = useResolveProblem();
  const opsProjects = useOpsProjects();
  const opsModels = useOpsModels();
  const navigate = useNavigate();
  const [opsOpen, setOpsOpen] = useState(false);

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return null;

  const totalDebt = data.debts.reduce((a, d) => a + d.debtEUR, 0);

  return (
    <div>
      <OperationHero current={data.current} upcoming={data.upcoming} />

      {/* Pickup / return lives in Operations: warehouse prepares, techs confirm here. */}
      <div style={{ marginBottom: 12 }}>
        <Button block variant="primary" onClick={() => setOpsOpen(true)}>Выдача / Возврат оборудования</Button>
      </div>

      <div className="card card--flat" style={{ padding: "14px 16px" }}>
        <div className="row" style={{ gap: 22, flexWrap: "wrap" }}>
          <Metric value={data.current.length} label="идут сейчас" />
          <Metric value={data.upcoming.length} label="предстоят" />
          <Metric value={data.problems.length} label="проблемы" tone={data.problems.length ? "danger" : "ok"} />
          <Metric value={eur(totalDebt)} label="долги" tone={totalDebt ? "danger" : "ok"} />
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
          <SectionHead label="Требуют внимания" meta={String(data.problems.length)} />
          <div className="card" style={{ padding: "2px 16px" }}>
            {data.problems.map((p) => (
              <NeedsRow
                key={p.id}
                problem={p}
                onResolve={() => resolve.mutate({ id: p.id, scope: p.kind === "reservation_conflict" ? "projects" : "equipment" })}
              />
            ))}
          </div>
        </>
      )}

      <SectionHead label="Идут сейчас" meta={data.current.length ? undefined : "—"} />
      {data.current.length === 0 ? (
        <EmptyState title="Нет активных прокатов" />
      ) : (
        <div className="stack">
          {data.current.map((r) => (
            <RentalCard key={r.project.id} row={r} onOpen={() => navigate(`/projects/${r.project.id}`)} />
          ))}
        </div>
      )}

      <SectionHead label="Предстоящие" meta={data.upcoming.length ? undefined : "—"} />
      {data.upcoming.length === 0 ? (
        <EmptyState title="Нет предстоящих прокатов" />
      ) : (
        <div className="stack">
          {data.upcoming.map((r) => (
            <RentalCard key={r.project.id} row={r} onOpen={() => navigate(`/projects/${r.project.id}`)} />
          ))}
        </div>
      )}

      <SectionHead label="Скоро в Operations" />
      <div className="stack">
        <ComingSoon title="Сцена и план" hint="Stage-plan, слои DMX/Power, расстановка приборов" />
        <ComingSoon title="Тайминг операции" hint="Фазы: загрузка → монтаж → программирование → шоу → демонтаж" />
        <ComingSoon title="Задачи монтажника" hint="Чек-лист на смену, «next action» на телефоне" />
      </div>

      <OpsSheet
        open={opsOpen}
        onClose={() => setOpsOpen(false)}
        projects={opsProjects.data ?? []}
        models={opsModels.data ?? []}
      />
    </div>
  );
}
