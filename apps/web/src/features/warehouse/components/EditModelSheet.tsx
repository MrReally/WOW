import { useEffect, useState } from "react";
import type { Equipment } from "@sever/contracts";
import { Sheet, Field, Input, Button } from "../../../ui-kit/index.ts";
import { useUpdateModel } from "../hooks.ts";

// Edit a model's particulars (name, maker, cost, daily price). Tracking mode and
// type are fixed at creation and not changed here.
export function EditModelSheet({ model, onClose }: { model: Equipment.EquipmentModelDTO | null; onClose: () => void }) {
  const update = useUpdateModel();
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [dailyPrice, setDailyPrice] = useState("");

  useEffect(() => {
    if (model) {
      setName(model.name);
      setManufacturer(model.manufacturer ?? "");
      setUnitCost(String(model.unitCostEUR));
      setDailyPrice(String(model.dailyPriceEUR));
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

  return (
    <Sheet open={!!model} onClose={onClose} title="Редактировать модель">
      <Field label="Название"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Производитель"><Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="—" /></Field>
      <div className="row">
        <Field label="Стоимость (замена), €"><Input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} /></Field>
        <Field label="Аренда / сутки, €"><Input type="number" step="0.01" value={dailyPrice} onChange={(e) => setDailyPrice(e.target.value)} /></Field>
      </div>
      <Button block disabled={!name || update.isPending} onClick={save}>Сохранить</Button>
    </Sheet>
  );
}
