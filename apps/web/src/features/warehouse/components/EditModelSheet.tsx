import { useEffect, useState } from "react";
import type { Equipment } from "@sever/contracts";
import { Sheet, Field, Input, Button, Select, Chip } from "../../../ui-kit/index.ts";
import { useSession } from "../../../app/session.ts";
import { cableAttrs, formatCableModel } from "../cables.ts";
import { useCableConnectors, useCableSettings, useDeleteModel, useSetModelTrackingMode, useUpdateModel } from "../hooks.ts";
import { CableDesigner, ModelImageInput } from "../../backoffice/CableDesigner.tsx";

export function EditModelSheet({ model, onClose }: { model: Equipment.EquipmentModelDTO | null; onClose: () => void }) {
  const { can } = useSession();
  const update = useUpdateModel();
  const setTracking = useSetModelTrackingMode();
  const deleteModel = useDeleteModel();
  const cableSettings = useCableSettings(!!model);
  const connectorCatalog=useCableConnectors();
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [imageUrl,setImageUrl]=useState<string|null>(null);
  const [unitCost, setUnitCost] = useState("");
  const [dailyPrice, setDailyPrice] = useState("");
  const [nextMode, setNextMode] = useState<Equipment.TrackingMode>("serial");
  const [cableType, setCableType] = useState("");
  const [lengthM, setLengthM] = useState("");
  const [sideAQty, setSideAQty] = useState("1");
  const [sideAConnector, setSideAConnector] = useState("");
  const [sideBQty, setSideBQty] = useState("1");
  const [sideBConnector, setSideBConnector] = useState("");
  const [sideAEnds,setSideAEnds]=useState<string[]>([""]),[sideBEnds,setSideBEnds]=useState<string[]>([""]);

  useEffect(() => {
    if (model) {
      const attrs = cableAttrs(model);
      setName(model.name);
      setManufacturer(model.manufacturer ?? "");
      setImageUrl(model.imageUrl);
      setUnitCost(String(model.unitCostEUR));
      setDailyPrice(String(model.dailyPriceEUR));
      setNextMode(model.trackingMode);
      setCableType(attrs?.cableType ?? "");
      setLengthM(attrs?.lengthM ? String(attrs.lengthM) : "");
      setSideAQty(String(attrs?.sideAQty ?? 1));
      setSideAConnector(attrs?.sideAConnector ?? "");
      setSideBQty(String(attrs?.sideBQty ?? 1));
      setSideBConnector(attrs?.sideBConnector ?? "");
      setSideAEnds(attrs?.sideAEnds?.length?attrs.sideAEnds:Array.from({length:attrs?.sideAQty??1},()=>attrs?.sideAConnector??""));
      setSideBEnds(attrs?.sideBEnds?.length?attrs.sideBEnds:Array.from({length:attrs?.sideBQty??1},()=>attrs?.sideBConnector??""));
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
    sideAEnds,
    sideBEnds,
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
          imageUrl,
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
      <ModelImageInput value={imageUrl} onChange={setImageUrl}/>
      <div className="row">
        <Field label="Стоимость (замена), €"><Input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} /></Field>
        <Field label="Аренда / сутки, €"><Input type="number" step="0.01" value={dailyPrice} onChange={(e) => setDailyPrice(e.target.value)} /></Field>
      </div>
      {model.trackingMode === "cable" && (
        <>
          <CableDesigner value={nextCableAttrs} connectors={connectorCatalog.data??[]} onChange={value=>{setCableType(value.cableType);setLengthM(String(value.lengthM||""));setSideAQty(String(value.sideAQty));setSideAConnector(value.sideAConnector);setSideBQty(String(value.sideBQty));setSideBConnector(value.sideBConnector);setSideAEnds(value.sideAEnds??[value.sideAConnector]);setSideBEnds(value.sideBEnds??[value.sideBConnector]);}}/>
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
