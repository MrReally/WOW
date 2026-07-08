import { useEffect, useState } from "react";
import type { Equipment } from "@sever/contracts";
import { Sheet, Field, Input, Button, Select, Chip } from "../../../ui-kit/index.ts";
import { useSession } from "../../../app/session.ts";
import { cableAttrs, formatCableModel } from "../cables.ts";
import { useCableSettings, useDeleteModel, useSetModelTrackingMode, useUpdateModel } from "../hooks.ts";

export function EditModelSheet({ model, onClose }: { model: Equipment.EquipmentModelDTO | null; onClose: () => void }) {
  const { can } = useSession();
  const update = useUpdateModel();
  const setTracking = useSetModelTrackingMode();
  const deleteModel = useDeleteModel();
  const cableSettings = useCableSettings(!!model);
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [dailyPrice, setDailyPrice] = useState("");
  const [nextMode, setNextMode] = useState<Equipment.TrackingMode>("serial");
  const [cableType, setCableType] = useState("");
  const [lengthM, setLengthM] = useState("");
  const [sideAQty, setSideAQty] = useState("1");
  const [sideAConnector, setSideAConnector] = useState("");
  const [sideBQty, setSideBQty] = useState("1");
  const [sideBConnector, setSideBConnector] = useState("");

  useEffect(() => {
    if (model) {
      const attrs = cableAttrs(model);
      setName(model.name);
      setManufacturer(model.manufacturer ?? "");
      setUnitCost(String(model.unitCostEUR));
      setDailyPrice(String(model.dailyPriceEUR));
      setNextMode(model.trackingMode);
      setCableType(attrs?.cableType ?? "");
      setLengthM(attrs?.lengthM ? String(attrs.lengthM) : "");
      setSideAQty(String(attrs?.sideAQty ?? 1));
      setSideAConnector(attrs?.sideAConnector ?? "");
      setSideBQty(String(attrs?.sideBQty ?? 1));
      setSideBConnector(attrs?.sideBConnector ?? "");
    }
  }, [model]);

  if (!model) return null;

  const nextCableAttrs: Equipment.CableAttrs = {
    cableType: cableType.trim(),
    lengthM: Number(lengthM) || 0,
    sideAConnector: sideAConnector.trim(),
    sideAQty: Math.max(1, Math.trunc(Number(sideAQty) || 1)),
    sideBConnector: sideBConnector.trim(),
    sideBQty: Math.max(1, Math.trunc(Number(sideBQty) || 1)),
    connectors: null,
  };
  const cablePreview = formatCableModel({ ...model, attrs: nextCableAttrs }, cableSettings.data?.nameFormat);
  const save = () =>
    update.mutate(
      {
        id: model.id,
        input: {
          name: name.trim() || undefined,
          manufacturer: manufacturer.trim() || null,
          unitCostEUR: unitCost === "" ? undefined : Number(unitCost),
          dailyPriceEUR: dailyPrice === "" ? undefined : Number(dailyPrice),
          attrs: model.trackingMode === "cable" ? nextCableAttrs : undefined,
        },
      },
      { onSuccess: onClose }
    );
  const changeTracking = () => {
    if (nextMode === model.trackingMode) return;
    const message = nextMode === "quantity" || nextMode === "cable"
      ? "Перевести модель в количественный учёт? Все серийные единицы этой модели будут удалены, остаток будет сохранён количеством по складам."
      : "Перевести модель в серийный учёт? Количественный остаток будет очищен, единицы нужно будет завести заново.";
    if (!confirm(message)) return;
    setTracking.mutate({ id: model.id, trackingMode: nextMode }, { onSuccess: onClose });
  };
  const remove = () => {
    if (!confirm(`Удалить модель «${model.name}» вместе со всеми её единицами и складскими записями?`)) return;
    if (!confirm("Это действие нельзя отменить. Точно удалить?")) return;
    deleteModel.mutate(model.id, { onSuccess: onClose });
  };

  return (
    <Sheet open={!!model} onClose={onClose} title="Редактировать модель">
      <div className="row" style={{ marginBottom: 10 }}>
        <Chip label={model.trackingMode === "cable" ? "кабель" : model.trackingMode === "quantity" ? "количество" : "серийный учёт"} tone={model.trackingMode === "serial" ? "info" : "warn"} />
      </div>
      <Field label="Название"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Производитель"><Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="—" /></Field>
      <div className="row">
        <Field label="Стоимость (замена), €"><Input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} /></Field>
        <Field label="Аренда / сутки, €"><Input type="number" step="0.01" value={dailyPrice} onChange={(e) => setDailyPrice(e.target.value)} /></Field>
      </div>
      {model.trackingMode === "cable" && (
        <>
          <div className="row">
            <Field label="Тип кабеля"><Input value={cableType} onChange={(e) => setCableType(e.target.value)} /></Field>
            <Field label="Длина, м"><Input type="number" value={lengthM} onChange={(e) => setLengthM(e.target.value)} /></Field>
          </div>
          <div className="row">
            <Field label="Сторона A"><Input value={sideAConnector} onChange={(e) => setSideAConnector(e.target.value)} list="edit-cable-connectors" /></Field>
            <Field label="Кол-во"><Input type="number" value={sideAQty} onChange={(e) => setSideAQty(e.target.value)} /></Field>
          </div>
          <div className="row">
            <Field label="Сторона B"><Input value={sideBConnector} onChange={(e) => setSideBConnector(e.target.value)} list="edit-cable-connectors" /></Field>
            <Field label="Кол-во"><Input type="number" value={sideBQty} onChange={(e) => setSideBQty(e.target.value)} /></Field>
          </div>
          <datalist id="edit-cable-connectors">
            {(cableSettings.data?.connectors ?? []).map((connector) => <option key={connector} value={connector} />)}
          </datalist>
          <p className="card__subtitle">{cablePreview}</p>
        </>
      )}
      <Button block disabled={!name || update.isPending} onClick={save}>Сохранить</Button>
      {can("warehouse.model.convert") && (
        <div className="stack" style={{ gap: 8, marginTop: 14 }}>
          <Field label="Режим учёта">
            <Select
              value={nextMode}
              onChange={(e) => setNextMode(e.target.value as Equipment.TrackingMode)}
              options={[
                { value: "serial", label: "Серийные единицы" },
                { value: "quantity", label: "Количество" },
                { value: "cable", label: "Кабель" },
              ]}
            />
          </Field>
          <Button block variant="secondary" disabled={nextMode === model.trackingMode || setTracking.isPending} onClick={changeTracking}>
            Изменить режим
          </Button>
        </div>
      )}
      {can("warehouse.model.delete") && (
        <Button block variant="ghost" disabled={deleteModel.isPending} onClick={remove} style={{ marginTop: 14 }}>
          Удалить модель
        </Button>
      )}
    </Sheet>
  );
}
