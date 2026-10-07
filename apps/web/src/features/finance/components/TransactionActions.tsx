import { useState } from "react";
import type { Finance } from "@sever/contracts";
import { Button, Field, Input, Select } from "../../../ui-kit/index.ts";

export function TransactionActions({ transaction, accounts, pending, onSave, onVoid }: {
  transaction: Finance.TransactionDTO;
  accounts: Finance.AccountDTO[];
  pending: boolean;
  onSave: (input: Finance.UpdateTransactionInput) => Promise<unknown>;
  onVoid: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [accountId, setAccountId] = useState(transaction.accountId);
  const [amount, setAmount] = useState(String(transaction.amount));
  const [note, setNote] = useState(transaction.note ?? "");
  const [error, setError] = useState("");
  const act = async (action: () => Promise<unknown>) => {
    setError("");
    try { await action(); setEditing(false); }
    catch (err) { setError(err instanceof Error ? err.message : "Не удалось сохранить операцию"); }
  };
  if (transaction.voidedAt) return null;
  return <div className="stack">
    {editing ? <>
      <Field label="Счёт"><Select value={accountId} onChange={e => setAccountId(e.target.value)} options={accounts.filter(a => a.currency === transaction.currency).map(a => ({ value: a.id, label: a.name }))} /></Field>
      <Field label={`Сумма, ${transaction.currency}`}><Input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
      <Field label="Комментарий"><Input value={note} onChange={e => setNote(e.target.value)} /></Field>
      <p className="card__subtitle">Исправление сохранится отдельной операцией с исходным курсом. Оригинал останется в истории отменённых.</p>
      <div className="row"><Button disabled={pending || !(Number(amount) > 0)} onClick={() => void act(() => onSave({ accountId, amount: Number(amount), note }))}>Сохранить исправление</Button><Button variant="ghost" disabled={pending} onClick={() => setEditing(false)}>Отмена</Button></div>
    </> : <div className="row"><Button variant="ghost" disabled={pending} onClick={() => setEditing(true)}>Исправить</Button><Button variant="ghost" disabled={pending} onClick={() => { if (confirm("Отменить операцию? Её движение по счёту будет сторнировано, запись останется в истории.")) void act(onVoid); }}>Сторнировать</Button></div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
