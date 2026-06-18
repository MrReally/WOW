import { useState } from "react";
import type { Finance, Projects } from "@sever/contracts";
import { CURRENCIES } from "@sever/contracts";
import { Sheet, Field, Input, Textarea, Select, Button } from "../../../ui-kit/index.ts";
import { useCreateTransaction } from "../hooks.ts";

interface Props {
  open: boolean;
  onClose: () => void;
  accounts: Finance.AccountDTO[];
  projects: Projects.ProjectDTO[];
}

const CATEGORIES: { value: Finance.TxCategory; label: string; kind: Finance.TxKind }[] = [
  { value: "rental_revenue", label: "Выручка (аренда)", kind: "income" },
  { value: "prepayment", label: "Предоплата", kind: "income" },
  { value: "debt_settlement", label: "Погашение долга", kind: "income" },
  { value: "purchase", label: "Закупка", kind: "expense" },
  { value: "repair", label: "Ремонт", kind: "expense" },
  { value: "salary", label: "Зарплата", kind: "expense" },
  { value: "other", label: "Прочее", kind: "expense" },
];

export function AddTransactionSheet({ open, onClose, accounts, projects }: Props) {
  const create = useCreateTransaction();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [category, setCategory] = useState<Finance.TxCategory>("rental_revenue");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Finance.FxRateDTO["currency"]>("EUR");
  const [projectId, setProjectId] = useState("");
  const [note, setNote] = useState("");

  const kind = CATEGORIES.find((c) => c.value === category)?.kind ?? "income";

  const submit = () => {
    create.mutate(
      {
        accountId,
        projectId: projectId || null,
        kind,
        category,
        amount: Number(amount),
        currency,
        note: note.trim() || null,
      },
      { onSuccess: () => { setAmount(""); setNote(""); onClose(); } }
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Новая транзакция">
      <Field label="Счёт">
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))} />
      </Field>
      <Field label="Категория">
        <Select value={category} onChange={(e) => setCategory(e.target.value as Finance.TxCategory)} options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />
      </Field>
      <div className="row">
        <Field label="Сумма">
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Валюта">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value as Finance.FxRateDTO["currency"])} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </Field>
      </div>
      <Field label="Проект (необязательно)">
        <Select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          options={[{ value: "", label: "— без проекта —" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
        />
      </Field>
      <Field label="Назначение / комментарий">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Напр. «3 кабеля DMX 10 м» — что именно" />
      </Field>
      <Button block disabled={!accountId || !amount || create.isPending} onClick={submit}>
        Добавить · курс зафиксируется
      </Button>
    </Sheet>
  );
}
