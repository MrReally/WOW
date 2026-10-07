import { useEffect, useState } from "react";
import type { Finance, Projects } from "@sever/contracts";
import { Sheet, Field, Input, Textarea, Select, Button } from "../../../ui-kit/index.ts";
import { useCreateTransaction } from "../hooks.ts";
import { ApiError } from "../../../lib/api.ts";

interface Props {
  open: boolean;
  onClose: () => void;
  accounts: Finance.AccountDTO[];
  projects: Projects.ProjectDTO[];
  currentUserId?: string | null;
  canManage: boolean;
  paymentTarget?: { projectId: string; contractorId: string; name: string };
}

const CATEGORIES: { value: Finance.TxCategory; label: string; kind: Finance.TxKind }[] = [
  { value: "rental_revenue", label: "Начисление аренды (без движения денег)", kind: "income" },
  { value: "prepayment", label: "Предоплата", kind: "income" },
  { value: "debt_settlement", label: "Погашение долга", kind: "income" },
  { value: "purchase", label: "Закупка", kind: "expense" },
  { value: "repair", label: "Ремонт", kind: "expense" },
  { value: "salary", label: "Зарплата", kind: "expense" },
  { value: "other", label: "Прочее", kind: "expense" },
];

function transactionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "Недостаточно прав для создания транзакций.";
    if (error.status === 400 || error.code === "validation_error") return `Проверьте данные транзакции: ${error.message}`;
    if (error.status === 404) return "Не найден выбранный счёт или проект. Обновите страницу и попробуйте ещё раз.";
    if (error.status >= 500) return "Сервер не смог создать транзакцию. Попробуйте ещё раз или напишите администратору.";
    return error.message;
  }
  return error instanceof Error ? error.message : "Не удалось создать транзакцию.";
}

export function AddTransactionSheet({ open, onClose, accounts, projects, currentUserId, canManage, paymentTarget }: Props) {
  const create = useCreateTransaction();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [category, setCategory] = useState<Finance.TxCategory>("prepayment");
  const [amount, setAmount] = useState("");
  const currency = accounts.find(account => account.id === accountId)?.currency ?? "EUR";
  const [projectId, setProjectId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const kind = paymentTarget ? "expense" : CATEGORIES.find((c) => c.value === category)?.kind ?? "income";
  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accountId, accounts]);

  const submit = () => {
    setError("");
    const amountNum = Number(amount);
    if (!canManage) {
      setError("Недостаточно прав для создания транзакций.");
      return;
    }
    if (!accountId) {
      setError("Сначала выберите счёт для транзакции.");
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("Введите сумму больше нуля.");
      return;
    }
    create.mutate(
      {
        accountId,
        projectId: paymentTarget?.projectId ?? (projectId || null),
        contractorId: paymentTarget?.contractorId ?? null,
        kind,
        category: paymentTarget ? "other" : category,
        amount: amountNum,
        currency,
        note: note.trim() || (paymentTarget ? `Оплата подрядчику ${paymentTarget.name}` : null),
        createdByUserId: currentUserId ?? null,
      },
      {
        onSuccess: () => { setAmount(""); setNote(""); setError(""); onClose(); },
        onError: (err) => setError(transactionErrorMessage(err)),
      }
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title={paymentTarget ? `Оплата: ${paymentTarget.name}` : "Новая транзакция"}>
      <Field label="Счёт">
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))} />
      </Field>
      {!paymentTarget && <Field label="Категория">
        <Select value={category} onChange={(e) => setCategory(e.target.value as Finance.TxCategory)} options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />
      </Field>}
      <div className="row">
        <Field label="Сумма">
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Валюта">
          <Input value={currency} readOnly />
        </Field>
      </div>
      {!paymentTarget && <Field label="Проект (необязательно)">
        <Select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          options={[{ value: "", label: "— без проекта —" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
        />
      </Field>}
      <Field label="Назначение / комментарий">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Напр. «3 кабеля DMX 10 м» — что именно" />
      </Field>
      {error && <p className="card__subtitle" style={{ color: "var(--danger)", marginTop: 4 }}>{error}</p>}
      <Button block disabled={create.isPending} onClick={submit}>
        Добавить · курс зафиксируется
      </Button>
    </Sheet>
  );
}
