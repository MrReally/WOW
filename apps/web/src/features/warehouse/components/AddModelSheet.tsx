import { useEffect, useState } from "react";
import type { Equipment } from "@sever/contracts";
import { Sheet, Field, Input, Select, Button } from "../../../ui-kit/index.ts";
import { formatCableModel } from "../cables.ts";
import { useCableSettings, useCreateModel, useCreateType, useCreateUnit, useModelStockAtWarehouse, useSetModelStock, useWarehouses } from "../hooks.ts";

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
  const setModelStock = useSetModelStock();
  const warehouses = useWarehouses();
  const cableSettings = useCableSettings(open);

  const [tab, setTab] = useState<"type" | "model" | "unit">("model");

  // type form
  const [typeName, setTypeName] = useState("");
  const [trackingMode, setTrackingMode] = useState<Equipment.TrackingMode>("serial");

  // model form
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [modelName, setModelName] = useState("");
  const [unitCost, setUnitCost] = useState("0");
  const [dailyPrice, setDailyPrice] = useState("0");
  const [cableType, setCableType] = useState("");
  const [lengthM, setLengthM] = useState("");
  const [sideAQty, setSideAQty] = useState("1");
  const [sideAConnector, setSideAConnector] = useState("");
  const [sideBQty, setSideBQty] = useState("1");
  const [sideBConnector, setSideBConnector] = useState("");

  // unit form
  const [modelId, setModelId] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [assetTag, setAssetTag] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [stockQty, setStockQty] = useState("");

  // Unit creation should require an explicit model pick; otherwise it is too
  // easy to create an item under the first model by accident.
  const effTypeId = typeId || types[0]?.id || "";
  const effModelId = modelId;
  const selectedType = types.find((t) => t.id === effTypeId);
  const connectorOptions = cableSettings.data?.connectors ?? [];
  const typeNameById = new Map(types.map((t) => [t.id, t.name]));
  const duplicateModelNames = new Set(
    models
      .map((m) => m.name.trim().toLowerCase())
      .filter((name, _idx, names) => names.indexOf(name) !== names.lastIndexOf(name))
  );
  const modelLabel = (m: Equipment.EquipmentModelDTO) => {
    const base = duplicateModelNames.has(m.name.trim().toLowerCase())
      ? `${m.name} · ${typeNameById.get(m.typeId) ?? "Тип"}`
      : m.name;
    const mode = m.trackingMode === "cable" ? " · кабель" : m.trackingMode === "quantity" ? " · количество" : "";
    return `${base}${mode}`;
  };
  const selectedModel = models.find((m) => m.id === effModelId);
  const serialModels = models.filter((m) => m.trackingMode === "serial");
  const countedModels = models.filter((m) => m.trackingMode === "quantity" || m.trackingMode === "cable");
  const warehouseList = warehouses.data ?? [];
  const effWarehouseId = warehouseId || warehouseList.find((w) => w.isDefault)?.id || warehouseList[0]?.id || "";
  const scopedStock = useModelStockAtWarehouse(effModelId, effWarehouseId, selectedModel?.trackingMode === "quantity" || selectedModel?.trackingMode === "cable");

  useEffect(() => {
    if ((selectedModel?.trackingMode === "quantity" || selectedModel?.trackingMode === "cable") && scopedStock.data) {
      setStockQty(String(scopedStock.data.total));
    }
  }, [scopedStock.data, selectedModel?.trackingMode]);

  const cableAttrs: Equipment.CableAttrs = {
    cableType: cableType.trim(),
    lengthM: Number(lengthM) || 0,
    sideAConnector: sideAConnector.trim(),
    sideAQty: Math.max(1, Math.trunc(Number(sideAQty) || 1)),
    sideBConnector: sideBConnector.trim(),
    sideBQty: Math.max(1, Math.trunc(Number(sideBQty) || 1)),
    connectors: null,
  };
  const cablePreview = formatCableModel(
    {
      id: "preview",
      typeId: effTypeId,
      trackingMode: "cable",
      name: modelName.trim(),
      manufacturer: null,
      imageUrl: null,
      unitCostEUR: 0,
      dailyPriceEUR: 0,
      attrs: cableAttrs,
      requiredComponentModelIds: [],
      createdAt: "",
    },
    cableSettings.data?.nameFormat
  );

  const pickModelBySearch = (value: string) => {
    setModelSearch(value);
    const query = value.trim().toLowerCase();
    const exactByLabel = models.find((m) => modelLabel(m).toLowerCase() === query);
    const exactByName = models.filter((m) => m.name.trim().toLowerCase() === query);
    const nextModel = exactByLabel ?? (exactByName.length === 1 ? exactByName[0] : null);
    setModelId(nextModel?.id ?? "");
    setAssetTag("");
    setStockQty("");
  };

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
          Единица
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
              onChange={(e) => setTrackingMode(e.target.value as Equipment.TrackingMode)}
              options={[
                { value: "serial", label: "По серийным единицам" },
                { value: "quantity", label: "Количество" },
                { value: "cable", label: "Кабели" },
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
            <Input value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder={selectedType?.trackingMode === "cable" ? cablePreview : "Robe MegaPointe"} />
          </Field>
          {selectedType?.trackingMode === "cable" && (
            <>
              <div className="row">
                <Field label="Тип кабеля">
                  <Input value={cableType} onChange={(e) => setCableType(e.target.value)} placeholder="Audio / Power / DMX" />
                </Field>
                <Field label="Длина, м">
                  <Input type="number" value={lengthM} onChange={(e) => setLengthM(e.target.value)} placeholder="5" />
                </Field>
              </div>
              <div className="row">
                <Field label="Сторона A">
                  <Input value={sideAConnector} onChange={(e) => setSideAConnector(e.target.value)} list="warehouse-cable-connectors" placeholder="Jack 6.3 TRS" />
                </Field>
                <Field label="Кол-во">
                  <Input type="number" value={sideAQty} onChange={(e) => setSideAQty(e.target.value)} />
                </Field>
              </div>
              <div className="row">
                <Field label="Сторона B">
                  <Input value={sideBConnector} onChange={(e) => setSideBConnector(e.target.value)} list="warehouse-cable-connectors" placeholder="Jack 3.5 TRS" />
                </Field>
                <Field label="Кол-во">
                  <Input type="number" value={sideBQty} onChange={(e) => setSideBQty(e.target.value)} />
                </Field>
              </div>
              <datalist id="warehouse-cable-connectors">
                {connectorOptions.map((connector) => <option key={connector} value={connector} />)}
              </datalist>
              <p className="card__subtitle">{cablePreview}</p>
            </>
          )}
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
            disabled={(!modelName.trim() && selectedType?.trackingMode !== "cable") || !effTypeId || createModel.isPending}
            onClick={() =>
              createModel.mutate(
                {
                  typeId: effTypeId,
                  name: selectedType?.trackingMode === "cable" ? (modelName.trim() || cablePreview) : modelName,
                  unitCostEUR: Number(unitCost),
                  dailyPriceEUR: Number(dailyPrice),
                  attrs: selectedType?.trackingMode === "cable" ? cableAttrs : undefined,
                },
                { onSuccess: () => { setModelName(""); setCableType(""); setLengthM(""); setSideAConnector(""); setSideBConnector(""); } }
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
            <Input
              value={modelSearch}
              onChange={(e) => pickModelBySearch(e.target.value)}
              onBlur={() => {
                if (selectedModel) setModelSearch(modelLabel(selectedModel));
              }}
              list="warehouse-unit-models"
              placeholder="Начните вводить модель"
              autoComplete="off"
            />
            <datalist id="warehouse-unit-models">
              {models.map((m) => (
                <option key={m.id} value={modelLabel(m)} />
              ))}
            </datalist>
          </Field>
          {selectedModel?.trackingMode === "quantity" || selectedModel?.trackingMode === "cable" ? (
            <>
              <Field label="Склад">
                <Select
                  value={effWarehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  options={warehouseList.map((w) => ({ value: w.id, label: w.isDefault ? `${w.name} ★` : w.name }))}
                />
              </Field>
              <Field label="Количество">
                <Input type="number" value={stockQty} onChange={(e) => setStockQty(e.target.value)} placeholder="40" />
              </Field>
              <p className="card__subtitle">
                {selectedModel.trackingMode === "cable" ? "Кабели" : "Количественные позиции"} хранятся количеством по модели, без инвентарных номеров.
              </p>
              <Button
                block
                disabled={!effModelId || !effWarehouseId || stockQty === "" || setModelStock.isPending}
                onClick={() => setModelStock.mutate({ modelId: effModelId, total: Math.max(0, Math.trunc(Number(stockQty) || 0)), warehouseId: effWarehouseId })}
              >
                Сохранить количество
              </Button>
            </>
          ) : (
            <>
              {serialModels.length === 0 && countedModels.length > 0 && (
                <p className="card__subtitle">Для количественных позиций и кабелей используйте остаток, серийные единицы не нужны.</p>
              )}
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
        </>
      )}
    </Sheet>
  );
}
