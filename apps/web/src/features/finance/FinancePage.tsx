import { useState } from "react";
import { Card, Button, SectionTitle, Metric, StatusBadge, Loading, ErrorState, EmptyState } from "../../ui-kit/index.ts";
import { eur, money, dateTime } from "../../lib/labels.ts";
import { useAccounts, useTransactions, useDebts, useProjectsForFinance, useCreateAccount } from "./hooks.ts";
import { AddTransactionSheet } from "./components/AddTransactionSheet.tsx";

const categoryLabel: Record<string, string> = {
  rental_revenue: "Выручка",
  prepayment: "Предоплата",
  debt_settlement: "Погашение",
  purchase: "Закупка",
  repair: "Ремонт",
  salary: "Зарплата",
  other: "Прочее",
};

export function FinancePage() {
  const accounts = useAccounts();
  const transactions = useTransactions();
  const debts = useDebts();
  const projects = useProjectsForFinance();
  const createAccount = useCreateAccount();
  const [txOpen, setTxOpen] = useState(false);

  if (accounts.isLoading) return <Loading />;
  if (accounts.error) return <ErrorState error={accounts.error} onRetry={accounts.refetch} />;

  const totalDebt = (debts.data ?? []).reduce((a, d) => a + d.debtEUR, 0);
  const projectName = (id: string) => (projects.data ?? []).find((p) => p.id === id)?.name ?? "—";

  return (
    <div className="stack">
      <div className="row">
        <Button block onClick={() => setTxOpen(true)} disabled={(accounts.data ?? []).length === 0}>
          + Транзакция
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            const name = prompt("Название счёта");
            if (name) createAccount.mutate({ name, currency: "EUR" });
          }}
        >
          + Счёт
        </Button>
      </div>

      <SectionTitle>Счета</SectionTitle>
      {(accounts.data ?? []).length === 0 ? (
        <EmptyState title="Нет счетов" hint="Создайте первый счёт" />
      ) : (
        <div className="stack">
          {(accounts.data ?? []).map((a) => (
            <Card key={a.id}>
              <div className="row row--between">
                <p className="card__title">{a.name}</p>
                <span className="metric__value">{money(a.balance, a.currency)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle>Долги клиентов</SectionTitle>
      <Card>
        <Metric value={eur(totalDebt)} label="итого долгов" tone={totalDebt ? "danger" : "ok"} />
      </Card>
      {(debts.data ?? []).map((d) => (
        <Card key={d.projectId}>
          <div className="row row--between">
            <p className="card__title">{projectName(d.projectId)}</p>
            <StatusBadge tone="danger">{eur(d.debtEUR)}</StatusBadge>
          </div>
          <p className="card__subtitle">выручка {eur(d.revenueEUR)} · оплачено {eur(d.prepaidEUR)}</p>
        </Card>
      ))}

      <SectionTitle>Транзакции</SectionTitle>
      {transactions.isLoading ? (
        <Loading />
      ) : (transactions.data ?? []).length === 0 ? (
        <EmptyState title="Транзакций нет" />
      ) : (
        <div className="stack">
          {(transactions.data ?? []).slice(0, 30).map((t) => (
            <Card key={t.id}>
              <div className="row row--between">
                <div>
                  <p className="card__title">{categoryLabel[t.category] ?? t.category}</p>
                  <p className="card__subtitle">{t.projectId ? projectName(t.projectId) : "—"} · {dateTime(t.createdAt)}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="metric__value" style={{ color: t.kind === "income" ? "var(--ok)" : "var(--danger)" }}>
                    {t.kind === "income" ? "+" : "−"}{money(t.amount, t.currency)}
                  </div>
                  {t.currency !== "EUR" && <div className="card__subtitle">{eur(t.amountEUR)} @ {t.fxRateToEUR}</div>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddTransactionSheet
        open={txOpen}
        onClose={() => setTxOpen(false)}
        accounts={accounts.data ?? []}
        projects={projects.data ?? []}
      />
    </div>
  );
}
