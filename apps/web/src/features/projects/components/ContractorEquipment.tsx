import { useState } from "react";
import type { Projects } from "@sever/contracts";
import { Card, Button, Field, Input, Select, EmptyState, StatusBadge } from "../../../ui-kit/index.ts";
import { useI18n } from "../../../app/i18n.tsx";
import {
  useContractorItems,
  useContractors,
  useContractorItemHistory,
  useAddContractorItem,
  useUpdateContractorItem,
  useSetContractorItemsBooked,
  useReturnContractorItems,
  useSetContractorItemsPaid,
  useRemoveContractorItem,
  useReturnContractorItem,
  useCreateContractor,
} from "../hooks.ts";

const ITEM_KINDS: Projects.ContractorItemKind[] = ["equipment", "delivery", "setup"];

interface Props {
  projectId: string;
  projectEndsAt: string;
  canManage: boolean;
  canManageFinance: boolean;
}

export function ContractorEquipment({ projectId, projectEndsAt, canManage, canManageFinance }: Props) {
  const { t, eur, dateTime } = useI18n();
  const items = useContractorItems(projectId);
  const contractors = useContractors();
  const add = useAddContractorItem();
  const update = useUpdateContractorItem();
  const setAllBooked = useSetContractorItemsBooked();
  const returnAll = useReturnContractorItems();
  const setAllPaid = useSetContractorItemsPaid();
  const remove = useRemoveContractorItem();
  const markReturned = useReturnContractorItem();
  const createContractor = useCreateContractor();

  const [contractorId, setContractorId] = useState("");
  const [kind, setKind] = useState<Projects.ContractorItemKind>("equipment");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [newContractorName, setNewContractorName] = useState("");
  const [newContractorContacts, setNewContractorContacts] = useState("");
  const [editing, setEditing] = useState<Projects.ContractorItemDTO | null>(null);

  const list = contractors.data ?? [];
  const rows = items.data ?? [];
  const contractorName = (id: string) => list.find((contractor) => contractor.id === id)?.name ?? "—";
  const selectedContractorId = contractorId || list[0]?.id || "";
  const history = useContractorItemHistory(selectedContractorId);
  const kindName = (value: Projects.ContractorItemKind) =>
    value === "delivery" ? t("contractors.kindDelivery") : value === "setup" ? t("contractors.kindSetup") : t("contractors.kindEquipment");
  const itemName = name.trim() || (kind === "equipment" ? "" : kindName(kind));
  const contractorIds = [...new Set(rows.map((item) => item.contractorId))];

  const submit = () => add.mutate({
    projectId,
    contractorId: selectedContractorId,
    kind,
    name: itemName,
    qty: Number(qty) || 1,
    priceEUR: Number(price) || 0,
    costEUR: Number(cost) || 0,
    note: note.trim() || null,
  }, { onSuccess: () => { setKind("equipment"); setName(""); setQty("1"); setPrice(""); setCost(""); setNote(""); } });

  return (
    <div className="stack">
      {rows.length === 0 ? <EmptyState title={t("contractors.empty")} /> : contractorIds.map((id) => {
        const group = rows.filter((item) => item.contractorId === id);
        const allBooked = group.every((item) => item.booked);
        const someBooked = group.some((item) => item.booked);
        const equipment = group.filter((item) => item.kind === "equipment");
        const outstandingEquipment = equipment.filter((item) => !item.returnedAt);
        const allPaid = group.every((item) => item.paidAt || item.costEUR * item.qty === 0);
        const afterProject = Date.now() > Date.parse(projectEndsAt);
        const status = allBooked && outstandingEquipment.length === 0 && allPaid
          ? { label: "Закрыто", tone: "ok" as const }
          : afterProject && outstandingEquipment.length > 0
          ? { label: "Нужно вернуть", tone: "warn" as const }
          : someBooked && !allBooked
          ? { label: "Частично забронировано", tone: "warn" as const }
          : allBooked
          ? { label: "Забронировано", tone: "info" as const }
          : { label: "Черновик", tone: "neutral" as const };
        const clientTotal = group.reduce((sum, item) => sum + item.priceEUR * item.qty, 0);
        const costTotal = group.reduce((sum, item) => sum + item.costEUR * item.qty, 0);

        return (
          <Card key={id}>
            <div className="row row--between">
              <div>
                <p className="card__title">{contractorName(id)}</p>
                <p className="card__subtitle">СС {eur(costTotal)} · клиенту {eur(clientTotal)} · маржа {eur(clientTotal - costTotal)}</p>
              </div>
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </div>

            <div className="stack" style={{ marginTop: 10, gap: 6 }}>
              {group.map((item) => editing?.id === item.id ? (
                <div className="invoice-line" key={item.id}>
                  <Input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder="Позиция" />
                  <div className="invoice-line-grid">
                    <Input type="number" value={editing.qty} onChange={(event) => setEditing({ ...editing, qty: Number(event.target.value) || 1 })} placeholder="К" />
                    <Input type="number" value={editing.costEUR} onChange={(event) => setEditing({ ...editing, costEUR: Number(event.target.value) || 0 })} placeholder="СС" />
                    <Input type="number" value={editing.priceEUR} onChange={(event) => setEditing({ ...editing, priceEUR: Number(event.target.value) || 0 })} placeholder="Ц" />
                  </div>
                  <Select value={editing.kind} onChange={(event) => setEditing({ ...editing, kind: event.target.value as Projects.ContractorItemKind })} options={ITEM_KINDS.map((value) => ({ value, label: kindName(value) }))} />
                  <Input value={editing.note ?? ""} onChange={(event) => setEditing({ ...editing, note: event.target.value || null })} placeholder="Комментарий" />
                  <div className="row">
                    <Button block disabled={!editing.name.trim() || update.isPending} onClick={() => update.mutate({ id: editing.id, input: { name: editing.name.trim(), kind: editing.kind, qty: editing.qty, priceEUR: editing.priceEUR, costEUR: editing.costEUR, note: editing.note } }, { onSuccess: () => setEditing(null) })}>Сохранить</Button>
                    <Button block variant="ghost" onClick={() => setEditing(null)}>Отмена</Button>
                  </div>
                </div>
              ) : (
                <div className="lrow contractor-item-row" key={item.id} style={{ paddingLeft: 0, paddingRight: 0 }}>
                  <label className="row contractor-item-row__summary" style={{ gap: 8, flex: 1, minWidth: 0 }}>
                    <input type="checkbox" checked={item.booked} disabled={!canManage} onChange={(event) => update.mutate({ id: item.id, input: { booked: event.target.checked } })} />
                    <span style={{ minWidth: 0 }}>
                      <span className="lrow__title">{item.name}</span>
                      <span className="lrow__detail">К {item.qty} · СС {eur(item.costEUR * item.qty)} · Ц {eur(item.priceEUR * item.qty)}</span>
                    </span>
                  </label>
                  <details className="contractor-item-row__details">
                    <summary className="btn btn--ghost">Подробнее</summary>
                    <div className="stack" style={{ marginTop: 6, gap: 6 }}>
                      <span className="card__subtitle">{kindName(item.kind)}{item.note ? ` · ${item.note}` : ""}</span>
                      {item.kind === "equipment" && <span className="card__subtitle">{item.returnedAt ? `Возвращено ${dateTime(item.returnedAt)}` : "Ожидает возврата"}</span>}
                      <span className="card__subtitle">{item.paidAt ? `Оплачено ${dateTime(item.paidAt)}` : "Не оплачено"}</span>
                      {canManage && <div className="row">
                        <Button variant="ghost" onClick={() => setEditing(item)}>Изменить</Button>
                        {item.kind === "equipment" && !item.returnedAt && <Button variant="secondary" onClick={() => markReturned.mutate(item.id)}>Вернуть</Button>}
                        <Button variant="ghost" onClick={() => remove.mutate(item.id)}>Удалить</Button>
                      </div>}
                    </div>
                  </details>
                </div>
              ))}
            </div>

            {(canManage || canManageFinance) && <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
              {canManage && <Button variant={allBooked ? "ghost" : "primary"} onClick={() => setAllBooked.mutate({ projectId, contractorId: id, booked: !allBooked })}>{allBooked ? "Снять бронь" : "Забронировать всё"}</Button>}
              {canManage && outstandingEquipment.length > 0 && <Button variant="secondary" onClick={() => returnAll.mutate({ projectId, contractorId: id })}>Вернуть всё оборудование</Button>}
              {canManageFinance && <Button variant={allPaid ? "ghost" : "secondary"} onClick={() => setAllPaid.mutate({ projectId, contractorId: id, paid: !allPaid })}>{allPaid ? "Отменить оплату" : "Оплачено"}</Button>}
            </div>}
          </Card>
        );
      })}

      {canManage && <Card>
        <div className="row row--between">
          <div><p className="card__title">Добавить позицию</p><p className="card__subtitle">Подрядчик → позиция → бронь</p></div>
        </div>
        {list.length > 0 && <Field label="Подрядчик"><Select value={selectedContractorId} onChange={(event) => setContractorId(event.target.value)} options={list.map((contractor) => ({ value: contractor.id, label: contractor.name }))} /></Field>}
        <Field label="Наименование"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Moving head X" /></Field>
        <div className="row">
          <Field label="К"><Input type="number" value={qty} onChange={(event) => setQty(event.target.value)} /></Field>
          <Field label="СС, €"><Input type="number" value={cost} onChange={(event) => setCost(event.target.value)} /></Field>
          <Field label="Ц, €"><Input type="number" value={price} onChange={(event) => setPrice(event.target.value)} /></Field>
        </div>
        <details>
          <summary className="btn btn--ghost">Подробнее</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <Field label="Тип"><Select value={kind} onChange={(event) => setKind(event.target.value as Projects.ContractorItemKind)} options={ITEM_KINDS.map((value) => ({ value, label: kindName(value) }))} /></Field>
            <Field label="Комментарий"><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Комплект, питание, условия" /></Field>
          </div>
        </details>
        <Button block disabled={!selectedContractorId || !itemName || add.isPending} onClick={submit}>Добавить</Button>

        <details style={{ marginTop: 8 }}>
          <summary className="btn btn--ghost">+ Новый подрядчик</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <Input value={newContractorName} onChange={(event) => setNewContractorName(event.target.value)} placeholder="Название компании / человека" />
            <Input value={newContractorContacts} onChange={(event) => setNewContractorContacts(event.target.value)} placeholder="Телефон, Telegram" />
            <Button variant="secondary" disabled={!newContractorName.trim() || createContractor.isPending} onClick={() => createContractor.mutate({ name: newContractorName.trim(), contacts: newContractorContacts.trim() || null }, { onSuccess: (contractor) => { setContractorId(contractor.id); setNewContractorName(""); setNewContractorContacts(""); } })}>Добавить подрядчика</Button>
          </div>
        </details>

        {(history.data ?? []).length > 0 && <details style={{ marginTop: 8 }}>
          <summary className="btn btn--ghost">История цен</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            {(history.data ?? []).slice(0, 8).map((item) => <div className="lrow" key={item.id}><span>{item.name} × {item.qty}</span><span className="card__subtitle">Ц {eur(item.priceEUR * item.qty)} · СС {eur(item.costEUR * item.qty)}</span></div>)}
          </div>
        </details>}
      </Card>}
    </div>
  );
}
