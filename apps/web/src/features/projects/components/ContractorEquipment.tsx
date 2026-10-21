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
  useRemoveContractorItem,
  useReturnContractorItem,
  useCreateContractor,
  useContractorCatalog,
  useContractorWarehouses,
  useContractorOrders,
  useCreateContractorOrder,
} from "../hooks.ts";
import { useAccounts } from "../../finance/hooks.ts";
import { AddTransactionSheet } from "../../finance/components/AddTransactionSheet.tsx";
import { ConfiguredDateTimeInput } from "../../../app/ConfiguredDateTimeInput.tsx";
import { isoFromLocal } from "../../../lib/datetime.ts";

const ITEM_KINDS: Projects.ContractorItemKind[] = ["equipment", "delivery", "setup"];

interface Props {
  projectId: string;
  projectEndsAt: string | null;
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
  const accounts = useAccounts(canManageFinance);
  const [paymentContractor, setPaymentContractor] = useState<string | null>(null);
  const remove = useRemoveContractorItem();
  const markReturned = useReturnContractorItem();
  const createContractor = useCreateContractor();
  const catalog=useContractorCatalog();
  const supplierWarehouses=useContractorWarehouses();
  const orders=useContractorOrders(projectId);
  const createOrder=useCreateContractorOrder();

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
  const [orderName,setOrderName]=useState("");
  const [orderWarehouseId,setOrderWarehouseId]=useState("");
  const [fulfillmentMode,setFulfillmentMode]=useState<Projects.ContractorFulfillmentMode>("dry_rental");
  const [supplierTotal,setSupplierTotal]=useState("");
  const [clientTotal,setClientTotal]=useState("");
  const [deliveryAt,setDeliveryAt]=useState("");
  const [pickupAt,setPickupAt]=useState("");
  const [catalogQty,setCatalogQty]=useState<Record<string,string>>({});

  const list = contractors.data ?? [];
  const rows = (items.data ?? []).filter(item=>!item.orderId);
  const contractorName = (id: string) => list.find((contractor) => contractor.id === id)?.name ?? "—";
  const selectedContractorId = contractorId || list[0]?.id || "";
  const history = useContractorItemHistory(selectedContractorId);
  const kindName = (value: Projects.ContractorItemKind) =>
    value === "delivery" ? t("contractors.kindDelivery") : value === "setup" ? t("contractors.kindSetup") : t("contractors.kindEquipment");
  const itemName = name.trim() || (kind === "equipment" ? "" : kindName(kind));
  const contractorIds = [...new Set(rows.map((item) => item.contractorId))];
  const contractorCatalog=(catalog.data??[]).filter(item=>item.contractorId===selectedContractorId&&(!orderWarehouseId||item.warehouseId===orderWarehouseId));
  const warehouses=(supplierWarehouses.data??[]).filter(item=>item.contractorId===selectedContractorId);
  const selectedCatalog=contractorCatalog.filter(item=>(Number(catalogQty[item.id])||0)>0);
  const exceedsKnownMaximum=selectedCatalog.some(item=>item.maxQty!=null&&(Number(catalogQty[item.id])||0)>item.maxQty);
  const suggestedSupplier=selectedCatalog.reduce((sum,item)=>sum+(Number(catalogQty[item.id])||0)*(fulfillmentMode==="dry_rental"?(item.dryRentalCostEUR??item.defaultCostEUR??0):(item.deliveredCostEUR??item.defaultCostEUR??0)),0);
  const submitOrder=()=>createOrder.mutate({projectId,contractorId:selectedContractorId,warehouseId:orderWarehouseId||null,name:orderName.trim()||selectedCatalog.map(item=>item.name).join(" + "),fulfillmentMode,supplierPriceEUR:Number(supplierTotal||suggestedSupplier)||0,clientPriceEUR:Number(clientTotal)||0,deliveryAt:fulfillmentMode==="contractor_delivery"&&deliveryAt?isoFromLocal(deliveryAt):null,pickupAt:fulfillmentMode==="contractor_delivery"&&pickupAt?isoFromLocal(pickupAt):null,booked:false,lines:selectedCatalog.map(item=>({catalogItemId:item.id,name:item.name,qty:Number(catalogQty[item.id])}))},{onSuccess:()=>{setOrderName("");setSupplierTotal("");setClientTotal("");setDeliveryAt("");setPickupAt("");setCatalogQty({});}});

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
      {(orders.data??[]).map(order=><Card key={order.id}><div className="row row--between"><div><p className="card__title">{order.name}</p><p className="card__subtitle">{contractorName(order.contractorId)} · {order.fulfillmentMode==="dry_rental"?"Сухая аренда":"Доставка подрядчиком"}</p></div><StatusBadge tone={order.returnCompletedAt?"ok":order.receiptCompletedAt?"info":"neutral"}>{order.returnCompletedAt?"Оборот закрыт":order.receiptCompletedAt?"Принято":"Ожидает приёмки"}</StatusBadge></div><div className="stack" style={{gap:4,marginTop:8}}>{order.lines.map(line=><div className="row row--between" key={line.id}><span>{line.name} × {line.qty}</span><span className="card__subtitle">{line.returnedAt?"возвращено":line.receivedAt?"принято":"ожидается"}</span></div>)}</div><p className="card__subtitle" style={{marginTop:8}}>Подрядчику {eur(order.supplierPriceEUR)} · клиенту {eur(order.clientPriceEUR)}{order.deliveryAt?` · доставка ${dateTime(order.deliveryAt)}`:""}{order.pickupAt?` · забор ${dateTime(order.pickupAt)}`:""}</p></Card>)}
      {rows.length === 0 ? <EmptyState title={t("contractors.empty")} /> : contractorIds.map((id) => {
        const group = rows.filter((item) => item.contractorId === id);
        const allBooked = group.every((item) => item.booked);
        const someBooked = group.some((item) => item.booked);
        const equipment = group.filter((item) => item.kind === "equipment");
        const outstandingEquipment = equipment.filter((item) => !item.returnedAt);
        const allPaid = group.every((item) => item.paidAt || item.costEUR * item.qty === 0);
        const afterProject = !!projectEndsAt && Date.now() > Date.parse(projectEndsAt);
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
                    <input className="toggle-switch" type="checkbox" checked={item.booked} disabled={!canManage} onChange={(event) => update.mutate({ id: item.id, input: { booked: event.target.checked } })} />
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
              {canManageFinance && !allPaid && <Button variant="secondary" onClick={() => setPaymentContractor(id)}>Внести оплату</Button>}
            </div>}
          </Card>
        );
      })}

      {canManage && list.length>0 && <Card>
        <p className="card__title">Заказ из каталога подрядчика</p>
        <p className="card__subtitle">Несколько приборов можно объединить в один набор с общей ценой.</p>
        <Field label="Подрядчик"><Select value={selectedContractorId} onChange={event=>{setContractorId(event.target.value);setOrderWarehouseId("");setCatalogQty({});}} options={list.map(item=>({value:item.id,label:item.name}))}/></Field>
        {warehouses.length>0&&<Field label="Склад подрядчика"><Select value={orderWarehouseId} onChange={event=>{setOrderWarehouseId(event.target.value);setCatalogQty({});}} options={[{value:"",label:"Все склады"},...warehouses.map(item=>({value:item.id,label:item.name}))]}/></Field>}
        <Field label="Название набора"><Input value={orderName} onChange={event=>setOrderName(event.target.value)} placeholder="Комплект света"/></Field>
        <Field label="Исполнение"><Select value={fulfillmentMode} onChange={event=>setFulfillmentMode(event.target.value as Projects.ContractorFulfillmentMode)} options={[{value:"dry_rental",label:"Сухая аренда — забираем сами"},{value:"contractor_delivery",label:"Подрядчик доставляет и забирает"}]}/></Field>
        <div className="stack" style={{gap:6,marginTop:8}}>{contractorCatalog.map(item=>{const qty=Number(catalogQty[item.id])||0;return <div className="lrow" key={item.id}><label className="row" style={{flex:1,gap:8}}><input type="checkbox" checked={qty>0} onChange={event=>setCatalogQty(current=>({...current,[item.id]:event.target.checked?"1":""}))}/><span><strong>{item.name}</strong><small>{item.maxQty==null?"Количество неизвестно":`максимум ${item.maxQty}`} · сухая {eur(item.dryRentalCostEUR??item.defaultCostEUR??0)} · с доставкой {eur(item.deliveredCostEUR??item.defaultCostEUR??0)}</small></span></label>{qty>0&&<Input type="number" min="1" max={item.maxQty??undefined} value={catalogQty[item.id]} onChange={event=>setCatalogQty(current=>({...current,[item.id]:event.target.value}))}/>}</div>;})}</div>
        {contractorCatalog.length===0&&<p className="card__subtitle" style={{marginTop:8}}>В каталоге выбранного подрядчика пока нет оборудования.</p>}
        {fulfillmentMode==="contractor_delivery"&&<div className="row"><Field label="Доставка на проект"><ConfiguredDateTimeInput value={deliveryAt} onChange={setDeliveryAt}/></Field><Field label="Забор с проекта"><ConfiguredDateTimeInput value={pickupAt} onChange={setPickupAt}/></Field></div>}
        <div className="row"><Field label={`Цена подрядчика, €${suggestedSupplier?` · каталог ${eur(suggestedSupplier)}`:""}`}><Input type="number" min="0" value={supplierTotal} onChange={event=>setSupplierTotal(event.target.value)} placeholder={suggestedSupplier?String(suggestedSupplier):"0"}/></Field><Field label="Цена клиенту, €"><Input type="number" min="0" value={clientTotal} onChange={event=>setClientTotal(event.target.value)}/></Field></div>
        {exceedsKnownMaximum&&<p className="card__subtitle" style={{color:"var(--danger)"}}>Количество превышает известный максимум подрядчика.</p>}
        <Button block disabled={!selectedContractorId||selectedCatalog.length===0||exceedsKnownMaximum||createOrder.isPending||(fulfillmentMode==="contractor_delivery"&&(!deliveryAt||!pickupAt))} onClick={submitOrder}>Создать заказ подрядчику</Button>
      </Card>}

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
      {paymentContractor && <AddTransactionSheet open onClose={() => setPaymentContractor(null)} accounts={accounts.data ?? []} projects={[]} canManage={canManageFinance} paymentTarget={{ projectId, contractorId: paymentContractor, name: contractorName(paymentContractor) }} />}
    </div>
  );
}
