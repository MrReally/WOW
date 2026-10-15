import { useEffect, useState } from "react";
import type { Equipment } from "@sever/contracts";
import { Sheet, Field, Input, Select, Button } from "../../../ui-kit/index.ts";
import { useCableSettings, useModelStock, useModelStockAtWarehouse, useTransferQty, useRepairQty, useServiceQty, useSetModelStock } from "../hooks.ts";
import { useSession } from "../../../app/session.ts";
import { cableAttrs, formatCableModel } from "../cables.ts";

interface Props {
  model: Equipment.EquipmentModelDTO | null;
  warehouses: Equipment.WarehouseDTO[];
  selectedWarehouseId?: string | null;
  onClose: () => void;
}

export function CableMoveSheet({ model, warehouses, selectedWarehouseId, onClose }: Props) {
  const { can } = useSession();
  const canViewCosts = can("warehouse.costs.view");
  const defaultWarehouse = selectedWarehouseId || warehouses.find((w) => w.isDefault)?.id || warehouses[0]?.id || "";
  const [mode, setMode] = useState<"transfer" | "repair" | "service">("transfer");
  const [warehouseId, setWarehouseId] = useState(defaultWarehouse);
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [qty, setQty] = useState("1");
  const transfer = useTransferQty();
  const repair = useRepairQty();
  const service = useServiceQty();
  const cableSettings = useCableSettings(!!model && model.trackingMode === "cable");
  const [note, setNote] = useState("");
  const [cost, setCost] = useState("");
  const stock = useModelStock(model?.id ?? "", !!model);
  const warehouseStock = useModelStockAtWarehouse(model?.id ?? "", warehouseId, !!model && !!warehouseId);
  useEffect(() => {
    if (!warehouseId && defaultWarehouse) setWarehouseId(defaultWarehouse);
  }, [defaultWarehouse, warehouseId]);

  if (!model) return null;
  const available=warehouseStock.data?.inStock??stock.data?.inStock??0;
  const exceedsAvailable=Number(qty)>available;

  const submit = () => {
    const amount = Number(qty);
    const opts = { onSuccess: () => onClose() };
    if (mode === "transfer") {
      transfer.mutate({ modelId: model.id, fromWarehouseId: warehouseId, toWarehouseId, qty: amount }, opts);
      return;
    }
    if (mode === "repair") {
      repair.mutate({ modelId: model.id, warehouseId, qty: amount, note: note || null, costEUR: cost ? Number(cost) : null }, opts);
      return;
    }
    if (mode === "service") {
      service.mutate({ modelId: model.id, warehouseId, qty: amount, note: note || null, costEUR: cost ? Number(cost) : null }, opts);
      return;
    }
  };
  const warehouseOptions = warehouses.map((w) => ({ value: w.id, label: w.name }));

  return (
    <Sheet open={!!model} onClose={onClose} title={model.trackingMode === "cable" ? formatCableModel(model, cableSettings.data?.nameFormat) : model.name}>
      {stock.data && (
        <div className="card card--flat" style={{ marginBottom: 14 }}>
          <div className="card__subtitle" style={{ color: "var(--text2)" }}>
            всего {stock.data.total} · свободно {stock.data.inStock} · на проектах {stock.data.onProjects}
            {warehouseStock.data ? ` · здесь свободно ${warehouseStock.data.inStock}/${warehouseStock.data.total}` : ""}
          </div>
        </div>
      )}
      <div className="row" style={{ marginBottom: 14 }}>
        <Button variant={mode === "transfer" ? "primary" : "secondary"} block onClick={() => setMode("transfer")}>Переместить</Button>
        <Button variant={mode === "repair" ? "primary" : "secondary"} block onClick={() => setMode("repair")}>Ремонт</Button>
        <Button variant={mode === "service" ? "primary" : "secondary"} block onClick={() => setMode("service")}>Сервис</Button>
      </div>
      <Field label={mode === "transfer" ? "Со склада" : "Склад"}>
        <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} options={warehouseOptions} />
      </Field>
      {mode === "transfer" ? (
        <Field label="На склад">
          <Select value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)} options={[{ value: "", label: "— выберите склад —" }, ...warehouseOptions.filter((w) => w.value !== warehouseId)]} />
        </Field>
      ) : (
        <>
          <Field label="Комментарий"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "repair" ? "Что ремонтируем" : "Куда / зачем"} /></Field>
      {canViewCosts && <Field label="Стоимость, €"><Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>}
        </>
      )}
      <Field label="Количество">
        <Input type="number" min={1} max={available} value={qty} onChange={(e) => setQty(e.target.value)} />
        {exceedsAvailable&&<span className="field__hint">Доступно только {available}</span>}
      </Field>
      <Button
        block
        disabled={!warehouseId || (mode === "transfer" && !toWarehouseId) || Number(qty) <= 0 || exceedsAvailable || transfer.isPending || repair.isPending || service.isPending}
        onClick={submit}
      >
        {mode === "transfer" ? `Переместить ${qty}` : mode === "repair" ? `В ремонт ${qty}` : `В сервис ${qty}`}
      </Button>
    </Sheet>
  );
}

export function CableRow({
  model,
  warehouseId,
  onMove,
  onEdit,
  showStepper = false,
  last,
}: {
  model: Equipment.EquipmentModelDTO;
  warehouseId?: string | null;
  onMove: () => void;
  onEdit?: () => void;
  showStepper?: boolean;
  last?: boolean;
}) {
  const aggregateStock = useModelStock(model.id, !warehouseId);
  const scopedStock = useModelStockAtWarehouse(model.id, warehouseId ?? "", !!warehouseId);
  const settings = useCableSettings(model.trackingMode === "cable");
  const setStock = useSetModelStock();
  const stock = warehouseId ? scopedStock : aggregateStock;
  const attrs = cableAttrs(model);
  const title = model.trackingMode === "cable" ? formatCableModel(model, settings.data?.nameFormat) : model.name;
  const isExtension = attrs?.cableType?.toLowerCase() === "удлинитель";
  const setTotal = (total: number) => setStock.mutate({ modelId: model.id, warehouseId: warehouseId || null, total: Math.max(stock.data?.onProjects ?? 0, total) });
  return (
    <div className={`lrow cable-list-row ${(showStepper || onEdit) ? "card--tappable" : ""}`} style={{ borderBottom: last ? "none" : undefined }} onClick={showStepper ? onMove : onEdit}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="lrow__title">{isExtension ? model.name : title}</div>
        <div className="lrow__detail">
          {model.trackingMode === "cable" && attrs?.lengthM ? `${attrs.lengthM} м` : model.trackingMode === "cable" ? "кабель" : "количество"}
          {stock.data ? ` · свободно ${stock.data.inStock} из ${stock.data.total}` : ""}
          {isExtension ? " · удлинитель" : ""}
        </div>
      </div>
      {showStepper && stock.data ? (
        <div className="quantity-stepper cable-row-stepper" aria-label={`Количество ${title}`} onClick={(event) => event.stopPropagation()}>
          <button type="button" aria-label={`Уменьшить количество ${title}`} disabled={setStock.isPending || stock.data.total <= stock.data.onProjects} onClick={() => setTotal(stock.data!.total - 1)}>−</button>
          <output>{stock.data.total}</output>
          <button type="button" aria-label={`Увеличить количество ${title}`} disabled={setStock.isPending} onClick={() => setTotal(stock.data!.total + 1)}>+</button>
        </div>
      ) : (
        <Button variant="secondary" style={{ height: 38, padding: "0 12px" }} onClick={(event) => { event.stopPropagation(); onMove(); }}>
          Операции
        </Button>
      )}
    </div>
  );
}
