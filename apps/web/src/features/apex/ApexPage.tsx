import { useNavigate } from "react-router-dom";
import type { ApexRentalRow, Problem } from "@sever/contracts";
import { Card, Metric, SectionTitle, StatusBadge, Button, Loading, ErrorState, EmptyState } from "../../ui-kit/index.ts";
import { eur, dateRange, projectStatusLabel, projectStatusTone, problemKindLabel } from "../../lib/labels.ts";
import { useApexDashboard, useResolveProblem } from "./hooks.ts";

function RentalCard({ row, onOpen }: { row: ApexRentalRow; onOpen: () => void }) {
  return (
    <Card onClick={onOpen}>
      <div className="row row--between">
        <div>
          <p className="card__title">{row.project.name}</p>
          <p className="card__subtitle">{row.clientName}</p>
        </div>
        <StatusBadge tone={projectStatusTone[row.project.status]}>
          {projectStatusLabel[row.project.status]}
        </StatusBadge>
      </div>
      <div className="row" style={{ marginTop: "var(--space-3)", gap: "var(--space-5)" }}>
        <Metric value={row.unitsOnProject} label="ед. на проекте" />
        {row.finance && <Metric value={eur(row.finance.debtEUR)} label="долг" tone={row.finance.debtEUR > 0 ? "danger" : "ok"} />}
        <div className="spacer" />
        <span className="card__subtitle">{dateRange(row.project.startsAt, row.project.endsAt)}</span>
      </div>
    </Card>
  );
}

function ProblemCard({ problem, onResolve }: { problem: Problem; onResolve: () => void }) {
  const tone = problem.severity === "critical" ? "danger" : problem.severity === "warning" ? "warn" : "info";
  return (
    <Card>
      <div className="row row--between">
        <StatusBadge tone={tone}>{problemKindLabel[problem.kind] ?? problem.kind}</StatusBadge>
        <Button variant="ghost" onClick={onResolve}>
          Решено
        </Button>
      </div>
      <p className="card__title" style={{ marginTop: "var(--space-2)" }}>{problem.title}</p>
      <p className="card__subtitle">{problem.detail}</p>
    </Card>
  );
}

export function ApexPage() {
  const { data, isLoading, error, refetch } = useApexDashboard();
  const resolve = useResolveProblem();
  const navigate = useNavigate();

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return null;

  const totalDebt = data.debts.reduce((a, d) => a + d.debtEUR, 0);

  return (
    <div className="stack">
      <div className="row" style={{ gap: "var(--space-5)" }}>
        <Metric value={data.current.length} label="идут сейчас" />
        <Metric value={data.upcoming.length} label="предстоят" />
        <Metric value={data.problems.length} label="проблемы" tone={data.problems.length ? "danger" : "ok"} />
        <Metric value={eur(totalDebt)} label="долги" tone={totalDebt ? "danger" : "ok"} />
      </div>

      {data.problems.length > 0 && (
        <>
          <SectionTitle>Проблемы</SectionTitle>
          <div className="stack">
            {data.problems.map((p) => (
              <ProblemCard
                key={p.id}
                problem={p}
                onResolve={() =>
                  resolve.mutate({ id: p.id, scope: p.kind === "reservation_conflict" ? "projects" : "equipment" })
                }
              />
            ))}
          </div>
        </>
      )}

      <SectionTitle>Идут сейчас</SectionTitle>
      {data.current.length === 0 ? (
        <EmptyState title="Нет активных прокатов" />
      ) : (
        <div className="stack">
          {data.current.map((r) => (
            <RentalCard key={r.project.id} row={r} onOpen={() => navigate(`/projects/${r.project.id}`)} />
          ))}
        </div>
      )}

      <SectionTitle>Предстоящие</SectionTitle>
      {data.upcoming.length === 0 ? (
        <EmptyState title="Нет предстоящих прокатов" />
      ) : (
        <div className="stack">
          {data.upcoming.map((r) => (
            <RentalCard key={r.project.id} row={r} onOpen={() => navigate(`/projects/${r.project.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
