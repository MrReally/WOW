import { useState } from "react";
import type { Equipment } from "@sever/contracts";
import { Sheet, Field, Input, Select, Button } from "../../../ui-kit/index.ts";
import { useCreateModel, useCreateType, useCreateUnit } from "../hooks.ts";

interface Props {
  open: boolean;
  onClose: () => void;
  types: Equipment.EquipmentTypeDTO[];
  models: Equipment.EquipmentModelDTO[];
}

export function AddModelSheet({ open, onClose, types, models }: Props) {
  const createType = useCreateType();
  const createModel = useCreateModel();
  const createUnit = useCreateUnit();

  const [tab, setTab] = useState<"type" | "model" | "unit">("model");

  // type form
  const [typeName, setTypeName] = useState("");
  const [trackingMode, setTrackingMode] = useState<"serial" | "quantity">("serial");

  // model form
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [modelName, setModelName] = useState("");
  const [unitCost, setUnitCost] = useState("0");
  const [dailyPrice, setDailyPrice] = useState("0");

  // unit form
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [assetTag, setAssetTag] = useState("");

  // Fall back to the first available option so a freshly-created type/model is
  // selectable immediately (the controlled <select> showed it but state was "").
  const effTypeId = typeId || types[0]?.id || "";
  const effModelId = modelId || models[0]?.id || "";

  return (
    <Sheet open={open} onClose={onClose} title="Добавить">
      <div className="row" style={{ marginBottom: "var(--space-4)" }}>
        <Button variant={tab === "type" ? "primary" : "secondary"} onClick={() => setTab("type")}>
          Тип
        </Button>
        <Button variant={tab === "model" ? "primary" : "secondary"} onClick={() => setTab("model")}>
          Модель
        </Button>
        <Button variant={tab === "unit" ? "primary" : "secondary"} onClick={() => setTab("unit")}>
          Единицу
        </Button>
      </div>

      {tab === "type" && (
        <>
          <Field label="Название типа">
            <Input value={typeName} onChange={(e) => setTypeName(e.target.value)} placeholder="Световые приборы" />
          </Field>
          <Field label="Учёт">
            <Select
              value={trackingMode}
              onChange={(e) => setTrackingMode(e.target.value as "serial" | "quantity")}
              options={[
                { value: "serial", label: "По серийным единицам" },
                { value: "quantity", label: "Количественный (кабели)" },
              ]}
            />
          </Field>
          <Button
            block
            disabled={!typeName || createType.isPending}
            onClick={() => createType.mutate({ name: typeName, trackingMode }, { onSuccess: () => { setTypeName(""); } })}
          >
            Создать тип
          </Button>
        </>
      )}

      {tab === "model" && (
        <>
          <Field label="Тип">
            <Select value={effTypeId} onChange={(e) => setTypeId(e.target.value)} options={types.map((t) => ({ value: t.id, label: t.name }))} />
          </Field>
          <Field label="Название модели">
            <Input value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="Robe MegaPointe" />
          </Field>
          <div className="row">
            <Field label="Стоимость, €">
              <Input type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            </Field>
            <Field label="Цена/день, €">
              <Input type="number" value={dailyPrice} onChange={(e) => setDailyPrice(e.target.value)} />
            </Field>
          </div>
          <Button
            block
            disabled={!modelName || !effTypeId || createModel.isPending}
            onClick={() =>
              createModel.mutate(
                { typeId: effTypeId, name: modelName, unitCostEUR: Number(unitCost), dailyPriceEUR: Number(dailyPrice) },
                { onSuccess: () => setModelName("") }
              )
            }
          >
            Создать модель
          </Button>
        </>
      )}

      {tab === "unit" && (
        <>
          <Field label="Модель">
            <Select value={effModelId} onChange={(e) => setModelId(e.target.value)} options={models.map((m) => ({ value: m.id, label: m.name }))} />
          </Field>
          <Field label="Инвентарный номер">
            <Input value={assetTag} onChange={(e) => setAssetTag(e.target.value)} placeholder="MP-001" />
          </Field>
          <Button
            block
            disabled={!assetTag || !effModelId || createUnit.isPending}
            onClick={() => createUnit.mutate({ modelId: effModelId, assetTag }, { onSuccess: () => setAssetTag("") })}
          >
            Создать единицу
          </Button>
        </>
      )}
    </Sheet>
  );
}
