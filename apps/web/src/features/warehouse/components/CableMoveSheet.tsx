import { useEffect, useState } from "react";
import type { Equipment, Projects } from "@sever/contracts";
import { Sheet, Field, Input, Select, Button } from "../../../ui-kit/index.ts";
import { useIssueQty, useReturnQty, useModelStock, useModelStockAtWarehouse, useTransferQty } from "../hooks.ts";

interface Props {
  model: Equipment.EquipmentModelDTO | null;
  projects: Projects.ProjectDTO[];
  warehouses: Equipment.WarehouseDTO[];
  selectedWarehouseId?: string | null;
  onClose: () => void;
}

export function CableMoveSheet({ model, projects, warehouses, selectedWarehouseId, onClose }: Props) {
  const defaultWarehouse = selectedWarehouseId || warehouses.find((w) => w.isDefault)?.id || warehouses[0]?.id || "";
  const [mode, setMode] = useState<"issue" | "return" | "transfer">("issue");
  const [warehouseId, setWarehouseId] = useState(defaultWarehouse);
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const issue = useIssueQty();
  const ret = useReturnQty();
  const transfer = useTransferQty();
  const stock = useModelStock(model?.id ?? "", !!model);
  const warehouseStock = useModelStockAtWarehouse(model?.id ?? "", warehouseId, !!model && !!warehouseId);
  useEffect(() => {
    if (!warehouseId && defaultWarehouse) setWarehouseId(defaultWarehouse);
  }, [defaultWarehouse, warehouseId]);

  if (!model) return null;

  const submit = () => {
    const amount = Number(qty);
    const opts = { onSuccess: () => onClose() };
    if (mode === "transfer") {
      transfer.mutate({ modelId: model.id, fromWarehouseId: warehouseId, toWarehouseId, qty: amount }, opts);
      return;
    }
    const input = { projectId, modelId: model.id, warehouseId, qty: amount };
    mode === "issue" ? issue.mutate(input, opts) : ret.mutate(input, opts);
  };
  const warehouseOptions = warehouses.map((w) => ({ value: w.id, label: w.name }));

  return (
    <Sheet open={!!model} onClose={onClose} title={model.name}>
      {stock.data && (
        <div className="card card--flat" style={{ marginBottom: 14 }}>
          <div className="card__subtitle" style={{ color: "var(--text2)" }}>
            всего {stock.data.total} · свободно {stock.data.inStock} · на проектах {stock.data.onProjects}
            {warehouseStock.data ? ` · здесь свободно ${warehouseStock.data.inStock}/${warehouseStock.data.total}` : ""}
          </div>
        </div>
      )}
      <div className="row" style={{ marginBottom: 14 }}>
        <Button variant={mode === "issue" ? "primary" : "secondary"} block onClick={() => setMode("issue")}>Выдать</Button>
        <Button variant={mode === "return" ? "primary" : "secondary"} block onClick={() => setMode("return")}>Принять</Button>
        <Button variant={mode === "transfer" ? "primary" : "secondary"} block onClick={() => setMode("transfer")}>Переместить</Button>
      </div>
      <Field label={mode === "transfer" ? "Со склада" : "Склад"}>
        <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} options={warehouseOptions} />
      </Field>
      {mode === "transfer" ? (
        <Field label="На склад">
          <Select value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)} options={[{ value: "", label: "— выберите склад —" }, ...warehouseOptions.filter((w) => w.value !== warehouseId)]} />
        </Field>
      ) : (
        <Field label="Проект">
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
      )}
      <Field label="Количество">
        <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
      </Field>
      <Button
        block
        disabled={(mode !== "transfer" && !projectId) || !warehouseId || (mode === "transfer" && !toWarehouseId) || Number(qty) <= 0 || issue.isPending || ret.isPending || transfer.isPending}
        onClick={submit}
      >
        {mode === "issue" ? `Выдать ${qty}` : mode === "return" ? `Принять ${qty}` : `Переместить ${qty}`}
      </Button>
    </Sheet>
  );
}

export function CableRow({ model, warehouseId, onMove, last }: { model: Equipment.EquipmentModelDTO; warehouseId?: string | null; onMove: () => void; last?: boolean }) {
  const aggregateStock = useModelStock(model.id, !warehouseId);
  const scopedStock = useModelStockAtWarehouse(model.id, warehouseId ?? "", !!warehouseId);
  const stock = warehouseId ? scopedStock : aggregateStock;
  const attrs = model.attrs as Equipment.CableAttrs | null;
  return (
    <div className="lrow" style={{ borderBottom: last ? "none" : undefined }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="lrow__title">{model.name}</div>
        <div className="lrow__detail">
          {attrs?.cableType ? `${attrs.cableType} · ${attrs.lengthM}m` : "кабель"}
          {stock.data ? ` · свободно ${stock.data.inStock}/${stock.data.total}` : ""}
        </div>
      </div>
      <Button variant="secondary" style={{ height: 38, padding: "0 12px" }} onClick={onMove}>
        Выдать / Принять
      </Button>
    </div>
  );
}
