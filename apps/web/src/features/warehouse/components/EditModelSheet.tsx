import { useEffect, useState } from "react";
import type { Equipment } from "@sever/contracts";
import { Sheet, Field, Input, Button, Select, Chip } from "../../../ui-kit/index.ts";
import { useSession } from "../../../app/session.ts";
import { useDeleteModel, useSetModelTrackingMode, useUpdateModel } from "../hooks.ts";

export function EditModelSheet({ model, onClose }: { model: Equipment.EquipmentModelDTO | null; onClose: () => void }) {
  const { can } = useSession();
  const update = useUpdateModel();
  const setTracking = useSetModelTrackingMode();
  const deleteModel = useDeleteModel();
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [dailyPrice, setDailyPrice] = useState("");
  const [nextMode, setNextMode] = useState<"serial" | "quantity">("serial");

  useEffect(() => {
    if (model) {
      setName(model.name);
      setManufacturer(model.manufacturer ?? "");
      setUnitCost(String(model.unitCostEUR));
      setDailyPrice(String(model.dailyPriceEUR));
      setNextMode(model.trackingMode);
    }
  }, [model]);

  if (!model) return null;

  const save = () =>
    update.mutate(
      {
        id: model.id,
        input: {
          name: name.trim() || undefined,
          manufacturer: manufacturer.trim() || null,
          unitCostEUR: unitCost === "" ? undefined : Number(unitCost),
          dailyPriceEUR: dailyPrice === "" ? undefined : Number(dailyPrice),
        },
      },
      { onSuccess: onClose }
    );
  const changeTracking = () => {
    if (nextMode === model.trackingMode) return;
    const message = nextMode === "quantity"
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
        <Chip label={model.trackingMode === "quantity" ? "количество" : "серийный учёт"} tone={model.trackingMode === "quantity" ? "warn" : "info"} />
      </div>
      <Field label="Название"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Производитель"><Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="—" /></Field>
      <div className="row">
        <Field label="Стоимость (замена), €"><Input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} /></Field>
        <Field label="Аренда / сутки, €"><Input type="number" step="0.01" value={dailyPrice} onChange={(e) => setDailyPrice(e.target.value)} /></Field>
      </div>
      <Button block disabled={!name || update.isPending} onClick={save}>Сохранить</Button>
      {can("warehouse.model.convert") && (
        <div className="stack" style={{ gap: 8, marginTop: 14 }}>
          <Field label="Режим учёта">
            <Select
              value={nextMode}
              onChange={(e) => setNextMode(e.target.value as "serial" | "quantity")}
              options={[
                { value: "serial", label: "Серийные единицы" },
                { value: "quantity", label: "Количество" },
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
