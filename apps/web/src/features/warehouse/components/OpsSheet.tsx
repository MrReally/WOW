import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Equipment } from "@sever/contracts";
import { Sheet, Field, Input, Button, Loading } from "../../../ui-kit/index.ts";
import { useStorageZones, useTypes, useUnits, useWarehouses, useTransferUnit } from "../hooks.ts";
import { equipmentUnitMatches } from "../../../lib/search.ts";

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
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const transfer = useTransferUnit();
  const warehouses = useWarehouses();
  const types = useTypes();
  const zones = useStorageZones();
  const inStock = useUnits(fromWarehouseId ? { status: "in_stock", warehouseId: fromWarehouseId } : undefined);

  const modelName = useMemo(() => {
    const map = new Map(models.map((model) => [model.id, model.name]));
    return (id: string) => map.get(id) ?? id;
  }, [models]);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const units = (inStock.data ?? []).filter((unit) => equipmentUnitMatches(unit, normalizedSearch, { models, types: types.data ?? [], units: inStock.data ?? [], zones: zones.data ?? [] }));

  useEffect(() => {
    const list = warehouses.data ?? [];
    if (!fromWarehouseId && list[0]) setFromWarehouseId(list[0].id);
    const nextTo = list.find((warehouse) => warehouse.id !== fromWarehouseId)?.id ?? "";
    if ((!toWarehouseId || toWarehouseId === fromWarehouseId) && nextTo) setToWarehouseId(nextTo);
  }, [fromWarehouseId, toWarehouseId, warehouses.data]);

  const closeAll = () => {
    setSelected(new Set());
    setReason("");
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
    const transferNote = [reason.trim(), note.trim()].filter(Boolean).join(" · ") || undefined;
    await Promise.all([...selected].map((id) => transfer.mutateAsync({ id, warehouseId: toWarehouseId, note: transferNote })));
    closeAll();
  };

  return (
    <Sheet open={open} onClose={closeAll} title="Перемещение между складами">
      <div className="transfer-sheet">
        <div className="transfer-sheet__label">Со склада</div>
        <div className="transfer-sheet__chips" aria-label="Со склада">
          {(warehouses.data ?? []).map((warehouse) => (
            <button
              type="button"
              key={warehouse.id}
              className={`warehouse-choice ${fromWarehouseId === warehouse.id ? "is-active" : ""}`}
              onClick={() => { setFromWarehouseId(warehouse.id); setSelected(new Set()); }}
            >
              {warehouse.name}
            </button>
          ))}
        </div>

        <div className="transfer-sheet__label">На склад</div>
        <div className="transfer-sheet__chips" aria-label="На склад">
          {(warehouses.data ?? []).filter((warehouse) => warehouse.id !== fromWarehouseId).map((warehouse) => (
            <button
              type="button"
              key={warehouse.id}
              className={`warehouse-choice ${toWarehouseId === warehouse.id ? "is-active" : ""}`}
              onClick={() => setToWarehouseId(warehouse.id)}
            >
              {warehouse.name}
            </button>
          ))}
        </div>

        <div className="transfer-sheet__search">
          <Input aria-label="Поиск оборудования" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Модель, производитель, тип, номер, серийник, зона, разъём" />
        </div>

        <div className="transfer-sheet__summary">
          <span>На выбранном складе · выбрано {selected.size}</span>
          {units.length > 0 && (
            <button type="button" onClick={() => setSelected(new Set(selected.size ? [] : units.map((unit) => unit.id)))}>
              {selected.size ? "Снять" : "Все"}
            </button>
          )}
        </div>

        {inStock.isLoading || warehouses.isLoading ? <Loading /> : units.length === 0 ? (
          <div className="transfer-sheet__empty">Нет свободных единиц на складе</div>
        ) : (
          <div className="transfer-sheet__units" aria-label="Оборудование для перемещения">
            {units.map((unit) => (
              <UnitPickRow
                key={unit.id}
                unit={unit}
                modelName={modelName(unit.modelId)}
                selected={selected.has(unit.id)}
                onToggle={() => toggle(unit.id)}
                onOpen={() => navigate(`/warehouse/units/${unit.id}`)}
              />
            ))}
          </div>
        )}

        <Field label="Основание перемещения">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Подготовка к проекту" />
        </Field>
        <Field label="Заметка (необязательно)">
          <Input value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>

        <Button block disabled={transfer.isPending || !fromWarehouseId || !toWarehouseId || fromWarehouseId === toWarehouseId || selected.size === 0} onClick={submit}>
          Переместить {selected.size || ""}
        </Button>
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
    <button className="transfer-unit-row" type="button" aria-pressed={selected} onClick={onToggle}>
      <span className={`transfer-unit-row__check ${selected ? "is-selected" : ""}`} aria-hidden="true">{selected ? "✓" : ""}</span>
      <span className="transfer-unit-row__copy">
        <strong onClick={(event) => { event.stopPropagation(); onOpen(); }}>{unit.assetTag}</strong>
        <small>{modelName}{unit.serial ? ` · ${unit.serial}` : ""}</small>
      </span>
    </button>
  );
}
