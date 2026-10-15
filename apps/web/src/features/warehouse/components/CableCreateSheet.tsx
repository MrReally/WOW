import { useEffect, useMemo, useState } from "react";
import type { Equipment } from "@sever/contracts";
import { Button, Field, Input, Sheet } from "../../../ui-kit/index.ts";
import { cableAttrs, formatCableModel, formatExtensionModel } from "../cables.ts";
import { useCableSettings, useCreateModel, useSetModelStock } from "../hooks.ts";

const CABLE_KINDS = ["Сигнальный", "Силовой", "Акустический", "Удлинитель"] as const;

function NumberStepper({ value, min = 1, onChange, label }: { value: number; min?: number; onChange: (value: number) => void; label: string }) {
  return (
    <div className="quantity-stepper cable-form-stepper" aria-label={label}>
      <button type="button" aria-label={`Уменьшить ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <output>{value}</output>
      <button type="button" aria-label={`Увеличить ${label}`} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

export function CableCreateSheet({
  open,
  onClose,
  types,
  categories,
  warehouses,
}: {
  open: boolean;
  onClose: () => void;
  types: Equipment.EquipmentTypeDTO[];
  categories: Equipment.EquipmentCategoryDTO[];
  warehouses: Equipment.WarehouseDTO[];
}) {
  const settings = useCableSettings(open);
  const createModel = useCreateModel();
  const setStock = useSetModelStock();
  const [kind, setKind] = useState<(typeof CABLE_KINDS)[number]>("Сигнальный");
  const [sideA, setSideA] = useState("");
  const [sideB, setSideB] = useState("");
  const [length, setLength] = useState("10");
  const [quantity, setQuantity] = useState(1);
  const [outlets, setOutlets] = useState(3);

  const connectors = settings.data?.connectors ?? [];
  const cableType = types.find((type) => type.trackingMode === "cable");
  const cableCategory = categories.find((category) => category.name.trim().toLowerCase() === "кабели");
  const warehouseId = warehouses.find((warehouse) => warehouse.isDefault)?.id ?? warehouses[0]?.id ?? "";
  const isExtension = kind === "Удлинитель";

  useEffect(() => {
    if (!open || connectors.length === 0) return;
    setSideA((current) => current || connectors[0]!);
    setSideB((current) => current || connectors[0]!);
  }, [connectors, open]);

  const attrs: Equipment.CableAttrs = useMemo(() => ({
    cableType: kind,
    lengthM: Number(length) || 0,
    sideAConnector: sideA,
    sideAQty: 1,
    sideBConnector: isExtension ? (connectors.find((connector) => connector.toLowerCase().includes("socket")) ?? sideB) : sideB,
    sideBQty: isExtension ? outlets : 1,
    connectors: null,
  }), [connectors, isExtension, kind, length, outlets, sideA, sideB]);

  const previewModel: Equipment.EquipmentModelDTO = {
    id: "preview",
    typeId: cableType?.id ?? "",
    trackingMode: "cable",
    name: "",
    manufacturer: null,
    imageUrl: null,
    unitCostEUR: 0,
    dailyPriceEUR: 0,
    attrs,
    requiredComponentModelIds: [],
    createdAt: "",
  };
  const preview = isExtension
    ? formatExtensionModel(previewModel, settings.data?.extensionNameFormat)
    : formatCableModel(previewModel, settings.data?.nameFormat);

  const reset = () => {
    setKind("Сигнальный");
    setLength("10");
    setQuantity(1);
    setOutlets(3);
    setSideA(connectors[0] ?? "");
    setSideB(connectors[0] ?? "");
  };
  const close = () => { reset(); onClose(); };
  const submit = async () => {
    if (!cableType || !warehouseId || !preview.trim()) return;
    const model = await createModel.mutateAsync({
      typeId: cableType.id,
      categoryId: cableCategory?.id ?? null,
      name: preview,
      unitCostEUR: 0,
      dailyPriceEUR: 0,
      attrs,
    });
    await setStock.mutateAsync({ modelId: model.id, warehouseId, total: quantity });
    close();
  };

  return (
    <Sheet open={open} onClose={close} title="Новый кабель">
      <div className="cable-form">
        <div className="cable-kind-picker" aria-label="Тип кабеля">
          {CABLE_KINDS.map((option) => (
            <button key={option} type="button" className={`warehouse-choice ${kind === option ? "is-active" : ""}`} onClick={() => setKind(option)}>{option}</button>
          ))}
        </div>

        <div>
          <div className="section-label cable-form__label">Сторона A</div>
          <div className="warehouse-filter-row cable-connector-picker">
            {connectors.map((connector) => <button key={connector} type="button" className={`warehouse-choice ${sideA === connector ? "is-active" : ""}`} onClick={() => setSideA(connector)}>{connector}</button>)}
          </div>
        </div>

        {!isExtension ? (
          <div>
            <div className="section-label cable-form__label">Сторона B</div>
            <div className="warehouse-filter-row cable-connector-picker">
              {connectors.map((connector) => <button key={connector} type="button" className={`warehouse-choice ${sideB === connector ? "is-active" : ""}`} onClick={() => setSideB(connector)}>{connector}</button>)}
            </div>
          </div>
        ) : (
          <div className="card cable-form__outlets">
            <strong>Розеток</strong>
            <NumberStepper value={outlets} onChange={setOutlets} label="количество розеток" />
          </div>
        )}

        <div className="cable-form__grid">
          <Field label="Длина, м"><Input inputMode="decimal" value={length} onChange={(event) => setLength(event.target.value.replace(/[^\d.]/g, ""))} /></Field>
          <Field label="Кол-во"><Input inputMode="numeric" value={String(quantity)} onChange={(event) => setQuantity(Math.max(0, Number(event.target.value.replace(/\D/g, "")) || 0))} /></Field>
        </div>

        <div className="card cable-form__preview">
          <span>ИМЯ ПО ШАБЛОНУ · {isExtension ? settings.data?.extensionNameFormat.join("") || "E[length]m[outlets]s" : settings.data?.nameFormat.join(" ") || "[sideA] → [sideB] · [length] м"}</span>
          <strong>{preview || "—"}</strong>
        </div>

        {!cableType && <p className="field__hint">Сначала создайте тип оборудования с учётом «Кабели».</p>}
        <Button block disabled={!cableType || !warehouseId || !sideA || (!isExtension && !sideB) || !length || quantity < 1 || createModel.isPending || setStock.isPending} onClick={submit}>Создать</Button>
      </div>
    </Sheet>
  );
}
