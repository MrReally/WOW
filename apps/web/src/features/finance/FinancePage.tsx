import { useState } from "react";
import { CURRENCIES } from "@sever/contracts";
import type { Finance } from "@sever/contracts";
import { Card, Button, SectionTitle, Metric, StatusBadge, Loading, ErrorState, EmptyState, Field, Input, Select } from "../../ui-kit/index.ts";
import { useI18n } from "../../app/i18n.tsx";
import { useAccounts, useTransactions, useDebts, useProjectsForFinance, useCreateAccount, usePeopleNames, useContractorDebts, useContractorsList } from "./hooks.ts";
import { AddTransactionSheet } from "./components/AddTransactionSheet.tsx";
import { useSession } from "../../app/session.ts";
import { toast } from "../../lib/toastBus.ts";

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
  const { can, user } = useSession();
  const { t, eur, money, dateTime } = useI18n();
  const canManage = can("finance.manage");
  const people = usePeopleNames(can("people.view"));
  const [txOpen, setTxOpen] = useState(false);
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountCurrency, setAccountCurrency] = useState<Finance.AccountDTO["currency"]>("EUR");
  const authorName = (uid: string | null) => {
    if (!uid) return `${t("finance.addedBy")}: ${t("common.system")}`;
    return `${t("finance.addedBy")}: ${(people.data ?? []).find((u) => u.id === uid)?.displayName ?? uid.slice(0, 8)}`;
  };

  if (accounts.isLoading) return <Loading />;
  if (accounts.error) return <ErrorState error={accounts.error} onRetry={accounts.refetch} />;

  const totalDebt = (debts.data ?? []).reduce((a, d) => a + d.debtEUR, 0);
  const totalOwed = (contractorDebts.data ?? []).reduce((a, d) => a + d.debtEUR, 0);
  const projectName = (id: string) => (projects.data ?? []).find((p) => p.id === id)?.name ?? "—";
  const contractorName = (id: string) => (contractors.data ?? []).find((c) => c.id === id)?.name ?? "—";
  const saveAccount = () => {
    if (!canManage) {
      toast("error", "Недостаточно прав для создания счёта.");
      return;
    }
    const name = accountName.trim();
    if (!name) {
      toast("error", "Введите название счёта.");
      return;
    }
    createAccount.mutate(
      { name, currency: accountCurrency },
      {
        onSuccess: () => {
          setAccountName("");
          setAccountCurrency("EUR");
          setAccountFormOpen(false);
        },
      }
    );
  };

  return (
    <div className="stack">
      <div className="row">
        <Button
          block
          onClick={() => {
            if (!canManage) {
              toast("error", "Недостаточно прав для создания транзакций.");
              return;
            }
            if ((accounts.data ?? []).length === 0) {
              toast("error", "Сначала создайте счёт, куда будет записана транзакция.");
              return;
            }
            setTxOpen(true);
          }}
        >
          + Транзакция
        </Button>
        {canManage && (
          <Button
            variant="secondary"
            onClick={() => {
              setAccountFormOpen((v) => !v);
            }}
          >
            + Счёт
          </Button>
        )}
      </div>
      {accountFormOpen && canManage && (
        <Card>
          <p className="card__title">Новый счёт</p>
          <Field label="Название">
            <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Касса / Bank / Wise" />
          </Field>
          <Field label="Валюта">
            <Select
              value={accountCurrency}
              onChange={(e) => setAccountCurrency(e.target.value as Finance.AccountDTO["currency"])}
              options={CURRENCIES.map((currency) => ({ value: currency, label: currency }))}
            />
          </Field>
          <div className="row" style={{ marginTop: 8 }}>
            <Button block disabled={!accountName.trim() || createAccount.isPending} onClick={saveAccount}>Сохранить</Button>
            <Button variant="secondary" block onClick={() => setAccountFormOpen(false)}>Отмена</Button>
          </div>
        </Card>
      )}

      <SectionTitle>{t("finance.accounts")}</SectionTitle>
      {(accounts.data ?? []).length === 0 ? (
        <EmptyState title={t("finance.noAccounts")} />
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

      <SectionTitle>{t("finance.clientDebt")}</SectionTitle>
      <Card>
        <Metric value={eur(totalDebt)} label={t("finance.clientDebt")} tone={totalDebt ? "danger" : "ok"} />
      </Card>
      {(debts.data ?? []).map((d) => (
        <Card key={d.projectId}>
          <div className="row row--between">
            <p className="card__title">{projectName(d.projectId)}</p>
            <StatusBadge tone="danger">{eur(d.debtEUR)}</StatusBadge>
          </div>
          <p className="card__subtitle">{t("finance.revenue")} {eur(d.revenueEUR)} · {t("finance.paid")} {eur(d.prepaidEUR)}</p>
        </Card>
      ))}
      {(debts.data ?? []).length === 0 && <EmptyState title={t("finance.noClientDebt")} />}

      <SectionTitle>{t("finance.payables")}</SectionTitle>
      <Card>
        <Metric value={eur(totalOwed)} label={t("finance.payables")} tone={totalOwed ? "danger" : "ok"} />
      </Card>
      {(contractorDebts.data ?? []).map((d) => (
        <Card key={d.contractorId}>
          <div className="row row--between">
            <p className="card__title">{contractorName(d.contractorId)}</p>
            <StatusBadge tone="warn">{eur(d.debtEUR)}</StatusBadge>
          </div>
          <p className="card__subtitle">{t("finance.subrentCost")}</p>
        </Card>
      ))}
      {(contractorDebts.data ?? []).length === 0 && <EmptyState title={t("finance.noPayables")} />}

      <SectionTitle>{t("finance.transactions")}</SectionTitle>
      {transactions.isLoading ? (
        <Loading />
      ) : (transactions.data ?? []).length === 0 ? (
        <EmptyState title={t("finance.noTransactions")} />
      ) : (
        <div className="stack">
          {(transactions.data ?? []).slice(0, 30).map((t) => (
            <Card key={t.id}>
              <div className="row row--between">
                <div style={{ minWidth: 0 }}>
                  <p className="card__title">{categoryLabel[t.category] ?? t.category}{t.note ? ` · ${t.note}` : ""}</p>
                  <p className="card__subtitle">
                    {t.projectId ? projectName(t.projectId) : "без проекта"} · {dateTime(t.createdAt)}
                    {" · "}{authorName(t.createdByUserId)}
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
        currentUserId={user?.id ?? null}
        canManage={canManage}
      />
    </div>
  );
}
