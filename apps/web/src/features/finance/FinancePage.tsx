import { useState } from "react";
import { CURRENCIES } from "@sever/contracts";
import type { Finance } from "@sever/contracts";
import { Card, Button, SectionTitle, Metric, StatusBadge, Loading, ErrorState, EmptyState, Field, Input, Select } from "../../ui-kit/index.ts";
import { useI18n } from "../../app/i18n.tsx";
import { useAccounts, useTransactions, useDebts, useProjectsForFinance, useCreateAccount, useUpdateAccount, usePeopleNames, useContractorDebts, useContractorsList, useFinanceJournal, useUpdateTransaction, useVoidTransaction } from "./hooks.ts";
import { AddTransactionSheet } from "./components/AddTransactionSheet.tsx";
import { useSession } from "../../app/session.ts";
import { toast } from "../../lib/toastBus.ts";
import { personName } from "../../lib/people.ts";
import { transactionCategoryLabel as categoryLabel } from "../../lib/labels.ts";
import { TransactionActions } from "./components/TransactionActions.tsx";

type FinanceTab = "summary" | "transactions" | "debts" | "payback" | "accounts";

export function FinancePage() {
  const accounts = useAccounts();
  const transactions = useTransactions(undefined, true);
  const journal = useFinanceJournal(transactions.data ?? []);
  const updateTransaction = useUpdateTransaction();
  const voidTransaction = useVoidTransaction();
  const debts = useDebts();
  const contractorDebts = useContractorDebts();
  const contractors = useContractorsList();
  const projects = useProjectsForFinance();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const { can, user } = useSession();
  const { t, eur, money, dateTime } = useI18n();
  const canManage = can("finance.manage");
  const people = usePeopleNames(can("people.view", "finance.view", "finance.manage"));
  const [tab, setTab] = useState<FinanceTab>("summary");
  const [period, setPeriod] = useState<"week" | "month" | "quarter">("month");
  const [txOpen, setTxOpen] = useState(false);
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountCurrency, setAccountCurrency] = useState<Finance.AccountDTO["currency"]>("EUR");
  const [editingAccountId, setEditingAccountId] = useState("");
  const [editingAccountName, setEditingAccountName] = useState("");
  const authorName = (uid: string | null) => {
    if (!uid) return `${t("finance.addedBy")}: ${t("common.system")}`;
    return `${t("finance.addedBy")}: ${personName((people.data ?? []).find((u) => u.id === uid), uid.slice(0, 8))}`;
  };

  if (accounts.isLoading) return <Loading />;
  if (accounts.error) return <ErrorState error={accounts.error} onRetry={accounts.refetch} />;

  const totalDebt = (debts.data ?? []).reduce((a, d) => a + d.debtEUR, 0);
  const totalOwed = (contractorDebts.data ?? []).reduce((a, d) => a + d.debtEUR, 0);
  const activeTransactions = (transactions.data ?? []).filter((row) => !row.voidedAt);
  const totalIncome = activeTransactions.filter((row) => row.kind === "income").reduce((sum, row) => sum + row.amountEUR, 0);
  const totalExpense = activeTransactions.filter((row) => row.kind !== "income").reduce((sum, row) => sum + row.amountEUR, 0);
  const profit = totalIncome - totalExpense;
  const eurAccounts = (accounts.data ?? []).filter((account) => account.currency === "EUR").reduce((sum, account) => sum + account.balance, 0);
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

  const openTransaction = () => {
    if (!canManage) return toast("error", "Недостаточно прав для создания транзакций.");
    if ((accounts.data ?? []).length === 0) return toast("error", "Сначала создайте счёт, куда будет записана транзакция.");
    setTxOpen(true);
  };
  const transactionCards = (rows: Finance.TransactionDTO[]) => rows.map((row) => (
    <Card key={row.id} className="finance-transaction" style={row.voidedAt ? { opacity: 0.55 } : undefined}>
      <div className="row row--between"><div style={{ minWidth: 0 }}><p className="card__title">{categoryLabel[row.category] ?? row.category}{row.note ? ` · ${row.note}` : ""}</p><p className="card__subtitle">{row.projectId ? projectName(row.projectId) : "без проекта"} · {dateTime(row.createdAt)} · {(accounts.data ?? []).find(account => account.id === row.accountId)?.name ?? "счёт удалён"} · {authorName(row.createdByUserId)}{row.voidedAt ? " · отменена" : row.updatedAt ? ` · изменена ${dateTime(row.updatedAt)}` : ""}</p></div><div className={`finance-transaction__amount ${row.kind === "income" ? "is-income" : "is-expense"}`}>{row.kind === "income" ? "+" : "−"}{money(row.amount, row.currency)}{row.currency !== "EUR" && <small>{eur(row.amountEUR)} @ {row.fxRateToEUR}</small>}</div></div>
      {row.replacesTransactionId && <p className="card__subtitle">Исправление операции {row.replacesTransactionId.slice(0, 8)}</p>}
      {canManage && <TransactionActions transaction={row} accounts={accounts.data ?? []} pending={updateTransaction.isPending || voidTransaction.isPending} onSave={input => updateTransaction.mutateAsync({ id: row.id, input })} onVoid={() => voidTransaction.mutateAsync(row.id)} />}
    </Card>
  ));

  return (
    <div className="stack finance-page">
      <div className="design-tabs finance-tabs" role="tablist">{([{id:"summary",label:"Сводка"},{id:"transactions",label:"Транзакции"},{id:"debts",label:"Долги",count:(debts.data??[]).length||null},{id:"payback",label:"Окупаемость"},{id:"accounts",label:"Счета"}] as const).map(item=><button key={item.id} className={tab===item.id?"is-active":""} onClick={()=>setTab(item.id)}>{item.label}{"count" in item&&item.count?<span>{item.count}</span>:null}</button>)}</div>

      {tab === "summary" && <>
        <div className="segmented-control finance-period">{([{id:"week",label:"Неделя"},{id:"month",label:"Месяц"},{id:"quarter",label:"Квартал"}] as const).map(item=><button key={item.id} className={period===item.id?"is-active":""} onClick={()=>setPeriod(item.id)}>{item.label}</button>)}</div>
        <Card className="finance-profit-card"><div className="row row--between"><p className="card__title">Прибыль</p><span className="card__subtitle">{period==="week"?"эта неделя":period==="month"?"этот месяц":"квартал"}</span></div><div className="finance-profit-card__value">{eur(profit)}</div><div className="finance-chart" aria-label="Динамика прибыли">{[34,46,70,58,49,88].map((height,index)=><i key={index} className={index===5?"is-active":""} style={{height:`${height}%`}}><span>{["Май","Июн","Июл","Авг","Сен","Окт"][index]}</span></i>)}</div></Card>
        <div className="finance-metric-grid"><Card><Metric value={eur(totalIncome)} label="Выручка" tone="ok"/></Card><Card><Metric value={eur(totalExpense)} label="Затраты" tone="danger"/></Card><Card onClick={()=>setTab("debts")}><Metric value={eur(totalDebt)} label="Долг клиентов" tone={totalDebt?"danger":"ok"}/></Card><Card onClick={()=>setTab("accounts")}><Metric value={eur(eurAccounts)} label="На счетах"/></Card></div>
        <div className="row row--between"><SectionTitle>Последние операции</SectionTitle><button className="text-action" onClick={()=>setTab("transactions")}>Все ›</button></div>
        <div className="stack">{transactionCards(activeTransactions.slice(0,4))}</div>
        <Button block onClick={openTransaction}>+ Транзакция</Button>
      </>}

      {tab === "transactions" && <>
        <Button block onClick={openTransaction}>+ Транзакция</Button>
        <Card className="finance-filters"><Field label="Поиск по комментарию, сумме или валюте"><Input value={journal.search} onChange={e=>journal.setSearch(e.target.value)}/></Field><Field label="Счёт"><Select value={journal.accountId} onChange={e=>journal.setAccountId(e.target.value)} options={[{value:"",label:"Все счета"},...(accounts.data??[]).map(account=>({value:account.id,label:`${account.name} · ${account.currency}`}))]}/></Field><div className="row"><Field label="С даты"><Input type="date" value={journal.from} onChange={e=>journal.setFrom(e.target.value)}/></Field><Field label="По дату"><Input type="date" value={journal.to} onChange={e=>journal.setTo(e.target.value)}/></Field></div><label className="check-row"><input type="checkbox" checked={journal.includeVoided} onChange={e=>journal.setIncludeVoided(e.target.checked)}/> Показывать отменённые и исправленные</label><p className="card__subtitle">Поступления {eur(journal.totals.income)} · расходы {eur(journal.totals.expense)} · результат {eur(journal.totals.income-journal.totals.expense)}</p></Card>
        {transactions.isLoading?<Loading/>:transactions.error?<ErrorState error={transactions.error} onRetry={transactions.refetch}/>:journal.count===0?<EmptyState title={t("finance.noTransactions")}/>:<div className="stack">{transactionCards(journal.rows)}{journal.count>journal.rows.length&&<Button variant="secondary" onClick={journal.showMore}>Показать ещё · {journal.rows.length} из {journal.count}</Button>}</div>}
      </>}

      {tab === "debts" && <>
        <SectionTitle>{t("finance.clientDebt")}</SectionTitle>{debts.error&&<ErrorState error={debts.error} onRetry={debts.refetch}/>}<Card><Metric value={eur(totalDebt)} label={t("finance.clientDebt")} tone={totalDebt?"danger":"ok"}/></Card>{(debts.data??[]).map(row=><Card key={row.projectId}><div className="row row--between"><p className="card__title">{projectName(row.projectId)}</p><StatusBadge tone="danger">{eur(row.debtEUR)}</StatusBadge></div><p className="card__subtitle">{t("finance.revenue")} {eur(row.revenueEUR)} · {t("finance.paid")} {eur(row.prepaidEUR)}</p></Card>)}{!debts.isLoading&&!debts.error&&!(debts.data??[]).length&&<EmptyState title={t("finance.noClientDebt")}/>}<SectionTitle>{t("finance.payables")}</SectionTitle><Card><Metric value={eur(totalOwed)} label={t("finance.payables")} tone={totalOwed?"danger":"ok"}/></Card>{(contractorDebts.data??[]).map(row=><Card key={row.contractorId}><div className="row row--between"><p className="card__title">{contractorName(row.contractorId)}</p><StatusBadge tone="warn">{eur(row.debtEUR)}</StatusBadge></div><p className="card__subtitle">{t("finance.subrentCost")}</p></Card>)}{!contractorDebts.isLoading&&!contractorDebts.error&&!(contractorDebts.data??[]).length&&<EmptyState title={t("finance.noPayables")}/>}</>}

      {tab === "payback" && <><Card className="finance-profit-card"><p className="card__title">Окупаемость оборудования</p><p className="card__subtitle">Фактические начисления аренды сохраняются в транзакциях и карточках проектов.</p><div className="finance-profit-card__value">{eur(totalIncome)}</div><p className="card__subtitle">Начисленная выручка по текущему журналу</p></Card><EmptyState title="Детализация находится в Warehouse" hint="Откройте модель оборудования, чтобы увидеть стоимость замены и аренду в сутки."/></>}

      {tab === "accounts" && <><div className="row row--between"><SectionTitle>{t("finance.accounts")}</SectionTitle>{canManage&&<Button onClick={()=>setAccountFormOpen(value=>!value)}>+ Счёт</Button>}</div>{accountFormOpen&&canManage&&<Card><p className="card__title">Новый счёт</p><Field label="Название"><Input value={accountName} onChange={event=>setAccountName(event.target.value)} placeholder="Касса / Bank / Wise"/></Field><Field label="Валюта"><Select value={accountCurrency} onChange={event=>setAccountCurrency(event.target.value as Finance.AccountDTO["currency"])} options={CURRENCIES.map(currency=>({value:currency,label:currency}))}/></Field><div className="row" style={{marginTop:8}}><Button block disabled={!accountName.trim()||createAccount.isPending} onClick={saveAccount}>Сохранить</Button><Button variant="secondary" block onClick={()=>setAccountFormOpen(false)}>Отмена</Button></div></Card>}{!(accounts.data??[]).length?<EmptyState title={t("finance.noAccounts")}/>:<div className="stack">{(accounts.data??[]).map(account=><Card key={account.id}><div className="row row--between">{editingAccountId===account.id?<Input value={editingAccountName} onChange={event=>setEditingAccountName(event.target.value)}/>:<p className="card__title">{account.name}</p>}<span className="metric__value">{money(account.balance,account.currency)}</span></div>{canManage&&<div className="row" style={{marginTop:8}}>{editingAccountId===account.id?<><Button disabled={!editingAccountName.trim()||updateAccount.isPending} onClick={()=>updateAccount.mutate({id:account.id,name:editingAccountName.trim()},{onSuccess:()=>setEditingAccountId("")})}>Сохранить</Button><Button variant="ghost" onClick={()=>setEditingAccountId("")}>Отмена</Button></>:<Button variant="ghost" onClick={()=>{setEditingAccountId(account.id);setEditingAccountName(account.name);}}>Изменить счёт</Button>}</div>}</Card>)}</div>}</>}

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
