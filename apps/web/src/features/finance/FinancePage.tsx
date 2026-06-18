import { useState } from "react";
import { Card, Button, SectionTitle, Metric, StatusBadge, Loading, ErrorState, EmptyState } from "../../ui-kit/index.ts";
import { eur, money, dateTime } from "../../lib/labels.ts";
import { useAccounts, useTransactions, useDebts, useProjectsForFinance, useCreateAccount, usePeopleNames, useContractorDebts, useContractorsList } from "./hooks.ts";
import { AddTransactionSheet } from "./components/AddTransactionSheet.tsx";
import { useSession } from "../../app/session.ts";

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
  const contractorDebts = useContractorDebts();
  const contractors = useContractorsList();
  const projects = useProjectsForFinance();
  const createAccount = useCreateAccount();
  const { can } = useSession();
  const canManage = can("finance.manage");
  const people = usePeopleNames(can("people.view"));
  const [txOpen, setTxOpen] = useState(false);
  const authorName = (uid: string | null) => (uid ? (people.data ?? []).find((u) => u.id === uid)?.displayName ?? null : null);

  if (accounts.isLoading) return <Loading />;
  if (accounts.error) return <ErrorState error={accounts.error} onRetry={accounts.refetch} />;

  const totalDebt = (debts.data ?? []).reduce((a, d) => a + d.debtEUR, 0);
  const totalOwed = (contractorDebts.data ?? []).reduce((a, d) => a + d.debtEUR, 0);
  const projectName = (id: string) => (projects.data ?? []).find((p) => p.id === id)?.name ?? "—";
  const contractorName = (id: string) => (contractors.data ?? []).find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="stack">
      {canManage && (
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
      )}

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

      <SectionTitle>Нам должны (клиенты)</SectionTitle>
      <Card>
        <Metric value={eur(totalDebt)} label="клиенты должны нам" tone={totalDebt ? "danger" : "ok"} />
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

      <SectionTitle>Мы должны (подрядчики)</SectionTitle>
      <Card>
        <Metric value={eur(totalOwed)} label="мы должны подрядчикам" tone={totalOwed ? "danger" : "ok"} />
      </Card>
      {(contractorDebts.data ?? []).map((d) => (
        <Card key={d.contractorId}>
          <div className="row row--between">
            <p className="card__title">{contractorName(d.contractorId)}</p>
            <StatusBadge tone="warn">{eur(d.debtEUR)}</StatusBadge>
          </div>
          <p className="card__subtitle">себестоимость субаренды по сметам</p>
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
                <div style={{ minWidth: 0 }}>
                  <p className="card__title">{categoryLabel[t.category] ?? t.category}{t.note ? ` · ${t.note}` : ""}</p>
                  <p className="card__subtitle">
                    {t.projectId ? projectName(t.projectId) : "без проекта"} · {dateTime(t.createdAt)}
                    {authorName(t.createdByUserId) ? ` · ${authorName(t.createdByUserId)}` : ""}
                  </p>
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
