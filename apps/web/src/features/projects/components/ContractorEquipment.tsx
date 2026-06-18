import { useState } from "react";
import { Card, Button, Field, Input, Select, EmptyState } from "../../../ui-kit/index.ts";
import { eur } from "../../../lib/labels.ts";
import { useContractorItems, useContractors, useAddContractorItem, useRemoveContractorItem, useCreateContractor } from "../hooks.ts";

// Subrent gear on a project: external equipment that isn't in our warehouse.
// Each item has a client price and our cost to the contractor (source).
export function ContractorEquipment({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const items = useContractorItems(projectId);
  const contractors = useContractors();
  const add = useAddContractorItem();
  const remove = useRemoveContractorItem();
  const createContractor = useCreateContractor();

  const [contractorId, setContractorId] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");

  const list = contractors.data ?? [];
  const contractorName = (id: string) => list.find((c) => c.id === id)?.name ?? "—";
  const sel = contractorId || list[0]?.id || "";

  const submit = () =>
    add.mutate(
      {
        projectId,
        contractorId: sel,
        name,
        qty: Number(qty) || 1,
        priceEUR: price ? Number(price) : 0,
        costEUR: cost ? Number(cost) : 0,
        note: note.trim() || null,
      },
      { onSuccess: () => { setName(""); setPrice(""); setCost(""); setNote(""); } }
    );

  return (
    <div className="stack">
      {(items.data ?? []).length === 0 ? (
        <EmptyState title="Оборудования подрядчиков нет" />
      ) : (
        (items.data ?? []).map((it) => (
          <Card key={it.id}>
            <div className="row row--between">
              <p className="card__title">{it.name} × {it.qty}</p>
              {canManage && <Button variant="ghost" onClick={() => remove.mutate(it.id)}>Убрать</Button>}
            </div>
            <p className="card__subtitle" style={{ marginTop: 2 }}>
              {contractorName(it.contractorId)} · клиенту {eur(it.priceEUR)} · себест {eur(it.costEUR)}
              {it.note ? ` · ${it.note}` : ""}
            </p>
          </Card>
        ))
      )}

      {canManage && (
        <Card>
          <div className="row">
            <Field label="Подрядчик (источник)">
              <Select value={sel} onChange={(e) => setContractorId(e.target.value)} options={list.map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
            <Button
              variant="secondary"
              onClick={() => {
                const n = prompt("Название подрядчика");
                if (n) createContractor.mutate({ name: n }, { onSuccess: (c) => setContractorId(c.id) });
              }}
            >
              + Новый
            </Button>
          </div>
          <Field label="Наименование"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="напр. Moving head X" /></Field>
          <div className="row">
            <Field label="Кол-во"><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
            <Field label="Цена клиенту, €"><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
            <Field label="Себест., €"><Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
          </div>
          <Field label="Характеристики / примечание"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="мощность, разъёмы и т.п." /></Field>
          <Button block disabled={!sel || !name || add.isPending} onClick={submit}>Добавить оборудование подрядчика</Button>
        </Card>
      )}
    </div>
  );
}
