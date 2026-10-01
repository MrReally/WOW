import { useState } from "react";
import type { Transport } from "@sever/contracts";
import { Button, Card, Field, Input, Select } from "../../../ui-kit/index.ts";
import { useCreateVehicle, useUpdateVehicle, useVehicles } from "../../transport/hooks.ts";

const fuelOptions = [{ value: "diesel", label: "Дизель" }, { value: "petrol", label: "Бензин" }, { value: "hybrid", label: "Гибрид" }, { value: "electric", label: "Электро" }];

function FleetVehicleCard({ vehicle, onUpdate }: { vehicle: Transport.VehicleDTO; onUpdate: (input: Transport.UpdateVehicleInput) => void }) {
  const [depreciation, setDepreciation] = useState(String(vehicle.depreciationEURPerKm));
  return <Card>
    <div className="row row--between"><div><p className="card__title">{vehicle.plateNumber} · {vehicle.model}</p><p className="card__subtitle">Права {vehicle.requiredLicenseCategory} · {fuelOptions.find(x => x.value === vehicle.fuelType)?.label} · {vehicle.consumptionLPer100Km} л/100 км</p></div><Button variant="ghost" onClick={() => onUpdate({ active: !vehicle.active })}>{vehicle.active ? "В архив" : "Вернуть"}</Button></div>
    <div className="row" style={{ marginTop: 10 }}><Field label="Амортизация, €/км"><Input type="number" min="0" step="0.01" value={depreciation} onChange={e => setDepreciation(e.target.value)} /></Field><Button variant="secondary" disabled={!(Number(depreciation) >= 0) || Number(depreciation) === vehicle.depreciationEURPerKm} onClick={() => onUpdate({ depreciationEURPerKm: Number(depreciation) })}>Сохранить</Button></div>
  </Card>;
}

export function FleetManager() {
  const vehicles = useVehicles(true), create = useCreateVehicle(), update = useUpdateVehicle();
  const [draft, setDraft] = useState<Transport.CreateVehicleInput>({ plateNumber: "", model: "", requiredLicenseCategory: "B", fuelType: "diesel", consumptionLPer100Km: 8, depreciationEURPerKm: 0 });
  const submit = () => create.mutate(draft, { onSuccess: () => setDraft({ plateNumber: "", model: "", requiredLicenseCategory: "B", fuelType: "diesel", consumptionLPer100Km: 8, depreciationEURPerKm: 0 }) });
  return <div className="stack">
    {(vehicles.data ?? []).map((vehicle) => <FleetVehicleCard key={vehicle.id} vehicle={vehicle} onUpdate={(input) => update.mutate({ id: vehicle.id, input })} />)}
    <Card><p className="card__title">Добавить автомобиль</p>
      <div className="row"><Field label="Номер"><Input value={draft.plateNumber} onChange={e => setDraft(x => ({ ...x, plateNumber: e.target.value }))} placeholder="BG 1234 AB" /></Field><Field label="Модель"><Input value={draft.model} onChange={e => setDraft(x => ({ ...x, model: e.target.value }))} placeholder="Mercedes Sprinter" /></Field></div>
      <div className="row"><Field label="Категория прав"><Input value={draft.requiredLicenseCategory} onChange={e => setDraft(x => ({ ...x, requiredLicenseCategory: e.target.value.toUpperCase() }))} placeholder="B" /></Field><Field label="Топливо"><Select value={draft.fuelType} onChange={e => setDraft(x => ({ ...x, fuelType: e.target.value as Transport.FuelType }))} options={fuelOptions} /></Field><Field label="л/100 км"><Input type="number" min="0" step="0.1" value={draft.consumptionLPer100Km} onChange={e => setDraft(x => ({ ...x, consumptionLPer100Km: Number(e.target.value) }))} /></Field><Field label="Амортизация, €/км"><Input type="number" min="0" step="0.01" value={draft.depreciationEURPerKm} onChange={e => setDraft(x => ({ ...x, depreciationEURPerKm: Number(e.target.value) }))} /></Field></div>
      <Button block disabled={!draft.plateNumber.trim() || !draft.model.trim() || create.isPending} onClick={submit}>Добавить машину</Button>
    </Card>
  </div>;
}
