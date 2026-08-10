import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Equipment } from "@sever/contracts";
import { Sheet, Field, Select, Input, Button, StatusBadge, Loading } from "../../../ui-kit/index.ts";
import { unitStatusLabel, unitStatusTone } from "../../../lib/labels.ts";
import { useUnits, useWarehouses, useTransferUnit } from "../hooks.ts";

interface Props {
  open: boolean;
  onClose: () => void;
  models: Equipment.EquipmentModelDTO[];
}

/** Warehouse-local moves only. Project issue and return live in Operations. */
export function OpsSheet({ open, onClose, models }: Props) {
  const navigate = useNavigate();
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const transfer = useTransferUnit();
  const warehouses = useWarehouses();
  const inStock = useUnits(fromWarehouseId ? { status: "in_stock", warehouseId: fromWarehouseId } : undefined);

  const modelName = useMemo(() => {
    const map = new Map(models.map((model) => [model.id, model.name]));
    return (id: string) => map.get(id) ?? id;
  }, [models]);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const units = (inStock.data ?? []).filter((unit) => !normalizedSearch || [unit.assetTag, unit.serial ?? "", modelName(unit.modelId)]
    .some((value) => value.toLocaleLowerCase().includes(normalizedSearch)));

  useEffect(() => {
    const list = warehouses.data ?? [];
    if (!fromWarehouseId && list[0]) setFromWarehouseId(list[0].id);
    const nextTo = list.find((warehouse) => warehouse.id !== fromWarehouseId)?.id ?? "";
    if ((!toWarehouseId || toWarehouseId === fromWarehouseId) && nextTo) setToWarehouseId(nextTo);
  }, [fromWarehouseId, toWarehouseId, warehouses.data]);

  const closeAll = () => {
    setSelected(new Set());
    setNote("");
    setSearch("");
    onClose();
  };
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const submit = async () => {
    await Promise.all([...selected].map((id) => transfer.mutateAsync({ id, warehouseId: toWarehouseId, note: note.trim() || undefined })));
    closeAll();
  };

  return (
    <Sheet open={open} onClose={closeAll} title="Перемещение между складами">
      <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Field label="Со склада">
            <Select value={fromWarehouseId} onChange={(event) => { setFromWarehouseId(event.target.value); setSelected(new Set()); }} options={(warehouses.data ?? []).map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))} />
          </Field>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Field label="На склад">
            <Select value={toWarehouseId} onChange={(event) => setToWarehouseId(event.target.value)} options={(warehouses.data ?? []).filter((warehouse) => warehouse.id !== fromWarehouseId).map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))} />
          </Field>
        </div>
      </div>
      <Field label="Поиск">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Модель, название, номер, серийник" />
      </Field>
      <div className="row row--between" style={{ alignItems: "center", margin: "4px 0" }}>
        <span className="section-title" style={{ margin: 0 }}>На выбранном складе · выбрано {selected.size}</span>
        {units.length > 0 && <div className="row" style={{ gap: 6 }}>
          <Button variant="ghost" onClick={() => setSelected(new Set(units.map((unit) => unit.id)))}>Все</Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>Снять</Button>
        </div>}
      </div>
      {inStock.isLoading || warehouses.isLoading ? <Loading /> : units.length === 0 ? <p className="card__subtitle">На выбранном складе нет свободных единиц.</p> : <div className="stack">
        {units.map((unit) => <UnitPickRow key={unit.id} unit={unit} modelName={modelName(unit.modelId)} selected={selected.has(unit.id)} onToggle={() => toggle(unit.id)} onOpen={() => navigate(`/warehouse/units/${unit.id}`)} />)}
      </div>}
      {units.length > 0 && <div style={{ marginTop: "var(--space-3)" }}><Field label="Заметка (необязательно)"><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Основание перемещения" /></Field></div>}
      <div style={{ marginTop: "var(--space-3)" }}>
        <Button block disabled={transfer.isPending || !fromWarehouseId || !toWarehouseId || fromWarehouseId === toWarehouseId || selected.size === 0} onClick={submit}>Переместить {selected.size}</Button>
      </div>
    </Sheet>
  );
}

function UnitPickRow({ unit, modelName, selected, onToggle, onOpen }: {
  unit: Equipment.EquipmentUnitDTO;
  modelName: string;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="card card--tappable" onClick={onToggle} style={{ borderColor: selected ? "var(--accent)" : undefined }}>
      <div className="row row--between">
        <div style={{ minWidth: 0 }}>
          <p className="card__title">{unit.assetTag}</p>
          <p className="card__subtitle">{modelName}{unit.serial ? ` · S/N ${unit.serial}` : ""}</p>
        </div>
        <div className="row">
          <button className="icon-btn" aria-label="Открыть карточку единицы" title="Открыть" onClick={(event) => { event.stopPropagation(); onOpen(); }}>↗</button>
          <StatusBadge tone={unitStatusTone[unit.status]}>{unitStatusLabel[unit.status]}</StatusBadge>
          <input type="checkbox" checked={selected} readOnly />
        </div>
      </div>
    </div>
  );
}
