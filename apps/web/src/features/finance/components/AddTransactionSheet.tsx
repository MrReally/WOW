import { useEffect, useState } from "react";
import type { Finance, Projects } from "@sever/contracts";
import { Sheet, Field, Input, Textarea, Select, Button } from "../../../ui-kit/index.ts";
import { useCreateTransaction, useCreateTransfer, useFxRates, useTransactionCategories } from "../hooks.ts";
import { ApiError } from "../../../lib/api.ts";

interface Props {
  open: boolean; onClose: () => void; accounts: Finance.AccountDTO[]; projects: Projects.ProjectDTO[];
  currentUserId?: string | null; canManage: boolean;
  paymentTarget?: { projectId: string; contractorId: string; name: string };
}

function transactionErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "Недостаточно прав для создания транзакций.";
  return error instanceof Error ? error.message : "Не удалось создать транзакцию.";
}

export function AddTransactionSheet({ open, onClose, accounts, projects, currentUserId, canManage, paymentTarget }: Props) {
  const create = useCreateTransaction(), transfer = useCreateTransfer();
  const categories = useTransactionCategories(open && !paymentTarget), rates = useFxRates();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [destinationId, setDestinationId] = useState("");
  const [kind, setKind] = useState<Finance.TxKind | "transfer">("income");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState("");
  const [editedReceived, setEditedReceived] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const account = accounts.find(a => a.id === accountId), destination = accounts.find(a => a.id === destinationId);
  const availableCategories = (categories.data ?? []).filter(c => c.active && c.kind === kind);
  const selectedCategory = availableCategories.find(c => c.id === categoryId);
  const currency = account?.currency ?? "EUR";
  const rate = (c: string) => c === "EUR" ? 1 : rates.data?.find(r => r.currency === c)?.rateToEUR;
  const fromRate = rate(currency), toRate = destination ? rate(destination.currency) : undefined;
  useEffect(() => { if (!accountId && accounts[0]) setAccountId(accounts[0].id); }, [accountId, accounts]);
  useEffect(() => { if (!availableCategories.some(c => c.id === categoryId)) setCategoryId(availableCategories[0]?.id ?? ""); }, [categories.data, kind, categoryId]);
  useEffect(() => {
    if (!destination) return;
    if (destination.currency === currency) { setReceived(amount); return; }
    if (!editedReceived) setReceived(amount && fromRate && toRate ? String(Math.round(Number(amount) * fromRate / toRate * 100) / 100) : "");
  }, [amount, currency, destinationId, destination?.currency, fromRate, toRate, editedReceived]);
  const submit = () => {
    setError("");
    const amountNum = Number(amount);
    if (!canManage) return setError("Недостаточно прав для создания транзакций.");
    if (!account || !Number.isFinite(amountNum) || amountNum <= 0) return setError("Выберите счёт и введите сумму больше нуля.");
    const success = () => { setAmount(""); setReceived(""); setEditedReceived(false); setNote(""); setError(""); onClose(); };
    const fail = (err: unknown) => setError(transactionErrorMessage(err));
    if (!paymentTarget && kind === "transfer") {
      if (!destination || destination.id === account.id) return setError("Выберите другой счёт для зачисления.");
      const receivedAmount = Number(received);
      if (!Number.isFinite(receivedAmount) || receivedAmount <= 0) return setError("Укажите сумму зачисления больше нуля.");
      transfer.mutate({ fromAccountId: account.id, toAccountId: destination.id, amount: amountNum, receivedAmount, note: note.trim() || null }, { onSuccess: success, onError: fail });
      return;
    }
    if (!paymentTarget && !selectedCategory) return setError("Выберите доступную категорию.");
    create.mutate({ accountId, projectId: paymentTarget?.projectId ?? (projectId || null), contractorId: paymentTarget?.contractorId ?? null,
      kind: paymentTarget ? "expense" : kind as Finance.TxKind, category: paymentTarget ? "other" : selectedCategory!.semantic,
      categoryId: paymentTarget ? null : selectedCategory!.id, amount: amountNum, currency,
      note: note.trim() || (paymentTarget ? `Оплата подрядчику ${paymentTarget.name}` : null), createdByUserId: currentUserId ?? null }, { onSuccess: success, onError: fail });
  };
  return <Sheet open={open} onClose={onClose} title={paymentTarget ? `Оплата: ${paymentTarget.name}` : "Новая транзакция"}>
    {!paymentTarget && <Field label="Тип операции"><Select value={kind} onChange={e => { setKind(e.target.value as Finance.TxKind | "transfer"); setCategoryId(""); }} options={[{value:"expense",label:"Списание"},{value:"income",label:"Начисление"},{value:"transfer",label:"Перевод между счетами"}]} /></Field>}
    <Field label={kind === "transfer" && !paymentTarget ? "Со счёта" : "Счёт"}><Select value={accountId} onChange={e => { setAccountId(e.target.value); setEditedReceived(false); }} options={accounts.map(a => ({ value: a.id, label: `${a.name} (${a.currency})` }))} /></Field>
    {!paymentTarget && kind === "transfer" && <Field label="На счёт"><Select value={destinationId} onChange={e => { setDestinationId(e.target.value); setEditedReceived(false); }} options={[{value:"",label:"Выберите счёт"}, ...accounts.filter(a => a.id !== accountId).map(a => ({value:a.id,label:`${a.name} (${a.currency})`}))]} /></Field>}
    {!paymentTarget && kind !== "transfer" && <Field label="Категория"><Select value={categoryId} onChange={e => setCategoryId(e.target.value)} options={[{value:"",label:categories.isLoading ? "Загрузка…" : "Выберите категорию"},...availableCategories.map(c => ({value:c.id,label:c.name}))]} /></Field>}
    <Field label={`${kind === "transfer" && !paymentTarget ? "Списать" : "Сумма"}, ${currency}`}><Input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
    {!paymentTarget && kind === "transfer" && destination && <Field label={`Зачислить, ${destination.currency}`}><Input type="number" min="0.01" step="0.01" value={received} readOnly={currency === destination.currency} onChange={e => { setEditedReceived(true); setReceived(e.target.value); }} /></Field>}
    {!paymentTarget && kind === "transfer" && destination && currency !== destination.currency && <p className="card__subtitle">Сумму зачисления можно изменить вручную. Первоначальный расчёт использует курсы из настроек.</p>}
    {!paymentTarget && kind !== "transfer" && <Field label="Проект (необязательно)"><Select value={projectId} onChange={e => setProjectId(e.target.value)} options={[{value:"",label:"— без проекта —"},...projects.map(p=>({value:p.id,label:p.name}))]} /></Field>}
    <Field label="Назначение / комментарий"><Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Что именно" /></Field>
    {error && <p role="alert" style={{color:"var(--danger)"}}>{error}</p>}
    <Button block disabled={create.isPending || transfer.isPending} onClick={submit}>Провести</Button>
  </Sheet>;
}
