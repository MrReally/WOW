import { useEffect, useState } from "react";
import type { Finance } from "@sever/contracts";
import { Button, Field, Input, Sheet, Textarea } from "../../../ui-kit/index.ts";
import { useAdjustAccountBalance } from "../hooks.ts";
import { ApiError } from "../../../lib/api.ts";

export function AdjustAccountSheet({ account, onClose }: { account: Finance.AccountDTO | null; onClose: () => void }) {
  const adjust = useAdjustAccountBalance();
  const [targetBalance, setTargetBalance] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setTargetBalance(account ? String(account.balance) : "");
    setNote("");
    setError("");
  }, [account]);
  const target = Number(targetBalance);
  const delta = account && Number.isFinite(target) ? Math.round((target - account.balance) * 100) / 100 : 0;
  const submit = () => {
    if (!account || !Number.isFinite(target) || delta === 0) return;
    setError("");
    adjust.mutate({ accountId: account.id, targetBalance: target, note: note.trim() || null }, {
      onSuccess: onClose,
      onError: (cause) => setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Не удалось провести корректировку."),
    });
  };
  return <Sheet open={!!account} onClose={onClose} title={account ? `Корректировка · ${account.name}` : "Корректировка счёта"}>
    {account && <>
      <p className="card__subtitle">Текущий остаток: {account.balance} {account.currency}</p>
      <Field label={`Остаток после корректировки, ${account.currency}`}><Input type="number" step="0.01" value={targetBalance} onChange={event => setTargetBalance(event.target.value)} /></Field>
      {Number.isFinite(target) && delta !== 0 && <p className="card__subtitle">Будет создана транзакция: {delta > 0 ? "+" : "−"}{Math.abs(delta).toFixed(2)} {account.currency}</p>}
      <Field label="Причина / комментарий"><Textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Например, сверка с банковской выпиской" /></Field>
      {error && <p className="card__subtitle" style={{ color: "var(--danger)" }}>{error}</p>}
      <Button block disabled={!Number.isFinite(target) || delta === 0 || adjust.isPending} onClick={submit}>Провести корректировку</Button>
    </>}
  </Sheet>;
}
