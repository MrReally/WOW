import { useState } from "react";
import { Card, Button, Field, Input, Select, EmptyState } from "../../../ui-kit/index.ts";
import { useI18n } from "../../../app/i18n.tsx";
import { useContractorItems, useContractors, useContractorItemHistory, useAddContractorItem, useRemoveContractorItem, useReturnContractorItem, useCreateContractor } from "../hooks.ts";

// Subrent gear on a project: external equipment that isn't in our warehouse.
// Each item has a client price and our cost to the contractor (source).
export function ContractorEquipment({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const { t, eur, dateTime } = useI18n();
  const items = useContractorItems(projectId);
  const contractors = useContractors();
  const add = useAddContractorItem();
  const remove = useRemoveContractorItem();
  const markReturned = useReturnContractorItem();
  const createContractor = useCreateContractor();

  const [contractorId, setContractorId] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [newContractorName, setNewContractorName] = useState("");
  const [newContractorContacts, setNewContractorContacts] = useState("");

  const list = contractors.data ?? [];
  const contractorName = (id: string) => list.find((c) => c.id === id)?.name ?? "—";
  const sel = contractorId || list[0]?.id || "";
  const history = useContractorItemHistory(sel);
  const qtyNum = Number(qty) || 1;
  const priceNum = price ? Number(price) || 0 : 0;
  const costNum = cost ? Number(cost) || 0 : 0;
  const clientTotal = priceNum * qtyNum;
  const costTotal = costNum * qtyNum;
  const marginTotal = clientTotal - costTotal;

  const submit = () =>
    add.mutate(
      {
        projectId,
        contractorId: sel,
        name,
        qty: Number(qty) || 1,
        priceEUR: priceNum,
        costEUR: costNum,
        note: note.trim() || null,
      },
      { onSuccess: () => { setName(""); setPrice(""); setCost(""); setNote(""); } }
    );
  const submitContractor = () =>
    createContractor.mutate(
      { name: newContractorName.trim(), contacts: newContractorContacts.trim() || null },
      {
        onSuccess: (c) => {
          setContractorId(c.id);
          setNewContractorName("");
          setNewContractorContacts("");
        },
      }
    );

  return (
    <div className="stack">
      {(items.data ?? []).length === 0 ? (
        <EmptyState title={t("contractors.empty")} />
      ) : (
        (items.data ?? []).map((it) => (
          <Card key={it.id}>
            <div className="row row--between">
              <p className="card__title">{it.name} × {it.qty}</p>
              {canManage && (
                <div className="row" style={{ gap: 6 }}>
                  {!it.returnedAt && <Button variant="secondary" onClick={() => markReturned.mutate(it.id)}>{t("contractors.return")}</Button>}
                  <Button variant="ghost" onClick={() => remove.mutate(it.id)}>{t("common.close")}</Button>
                </div>
              )}
            </div>
            <p className="card__subtitle" style={{ marginTop: 2 }}>
              {contractorName(it.contractorId)} · {t("contractors.clientPrice")} {eur(it.priceEUR * it.qty)} · {t("common.cost")} {eur(it.costEUR * it.qty)}
              {" · "}{t("common.margin")} {eur((it.priceEUR - it.costEUR) * it.qty)}
              {it.note ? ` · ${it.note}` : ""}
            </p>
            <p className="card__subtitle" style={{ marginTop: 2 }}>
              {it.returnedAt ? `${t("common.returned")} ${dateTime(it.returnedAt)}` : t("contractors.returnDue")}
            </p>
            <p className="card__subtitle" style={{ marginTop: 2 }}>
              {t("contractors.clientPrice")} / unit {eur(it.priceEUR)} · {t("common.cost")} / unit {eur(it.costEUR)}
            </p>
          </Card>
        ))
      )}

      {canManage && (
        <Card>
          {list.length > 0 && (
            <Field label={t("contractors.title")}>
              <Select value={sel} onChange={(e) => setContractorId(e.target.value)} options={list.map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
          )}
          <div className="row">
            <Field label={t("contractors.new")}>
              <Input value={newContractorName} onChange={(e) => setNewContractorName(e.target.value)} placeholder="Название компании / человека" />
            </Field>
            <Field label={t("common.contacts")}>
              <Input value={newContractorContacts} onChange={(e) => setNewContractorContacts(e.target.value)} placeholder="телефон, Telegram" />
            </Field>
          </div>
          <Button
            block
            variant="secondary"
            disabled={!newContractorName.trim() || createContractor.isPending}
            onClick={submitContractor}
          >
            {t("contractors.add")}
          </Button>
          <Field label={t("common.name")}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Moving head X" /></Field>
          <div className="row">
            <Field label="Кол-во"><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
            <Field label={`${t("contractors.clientPrice")}, €`}><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
            <Field label={`${t("common.cost")}, €`}><Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
          </div>
          <Field label={t("common.note")}><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Power, connectors, kit..." /></Field>
          <p className="card__subtitle" style={{ margin: "4px 0 8px" }}>
            {t("common.total")}: {t("contractors.clientPrice")} {eur(clientTotal)} · {t("contractors.vendorCost")} {eur(costTotal)} · {t("common.margin")} {eur(marginTotal)}
          </p>
          <Button block disabled={!sel || !name || add.isPending} onClick={submit}>{t("common.add")}</Button>
          {(history.data ?? []).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p className="card__title">{t("contractors.prices")}</p>
              <div className="stack" style={{ marginTop: 8 }}>
                {(history.data ?? []).slice(0, 8).map((h) => (
                  <div key={h.id} className="lrow" style={{ paddingLeft: 0, paddingRight: 0 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="lrow__title">{h.name} × {h.qty}</div>
                      <div className="lrow__detail">{h.note || t("common.noNote")}</div>
                    </div>
                    <span className="card__subtitle" style={{ textAlign: "right" }}>
                      {t("contractors.clientPrice")} {eur(h.priceEUR * h.qty)}<br />
                      {t("common.cost")} {eur(h.costEUR * h.qty)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
