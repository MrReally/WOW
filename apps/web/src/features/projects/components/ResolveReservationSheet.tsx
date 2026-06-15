import { useEffect, useState } from "react";
import type { Projects } from "@sever/contracts";
import { Sheet, Button, Chip, Loading } from "../../../ui-kit/index.ts";
import { useInStockUnits, useResolveReservation } from "../hooks.ts";

interface Props {
  reservation: Projects.ReservationDTO | null;
  modelName: string;
  onClose: () => void;
}

// Warehouse prep: turn a model-level reservation (qty) into concrete units.
export function ResolveReservationSheet({ reservation, modelName, onClose }: Props) {
  const units = useInStockUnits(reservation?.modelId ?? "");
  const resolve = useResolveReservation();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Pre-select the units already on this reservation when (re)opening it.
  useEffect(() => {
    setSelected(new Set(reservation?.resolvedUnitIds ?? []));
  }, [reservation?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!reservation) return null;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const close = () => {
    setSelected(new Set());
    onClose();
  };

  const submit = () => {
    resolve.mutate({ id: reservation.id, unitIds: [...selected] }, { onSuccess: close });
  };

  const list = units.data ?? [];
  const enough = selected.size === reservation.qty;

  return (
    <Sheet open={!!reservation} onClose={close} title={`Распределить · ${modelName}`}>
      <p className="card__subtitle" style={{ marginBottom: 12 }}>
        Нужно {reservation.qty} ед. Выбери конкретные единицы со склада. Выбрано {selected.size}.
      </p>
      {units.isLoading ? (
        <Loading />
      ) : list.length === 0 ? (
        <p className="card__subtitle">Нет свободных единиц этой модели на складе.</p>
      ) : (
        <div className="stack">
          {list.map((u) => (
            <div
              key={u.id}
              className="card card--tappable"
              style={{ padding: 12, borderColor: selected.has(u.id) ? "var(--accent)" : undefined }}
              onClick={() => toggle(u.id)}
            >
              <div className="row row--between">
                <span className="card__title">{u.assetTag}</span>
                {selected.has(u.id) ? <Chip label="ВЫБРАНО" tone="accent" /> : <Chip label="СВОБОДНО" tone="ok" />}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <Button block disabled={selected.size === 0 || resolve.isPending} onClick={submit}>
          {enough ? `Распределить ${selected.size}` : `Распределить ${selected.size} / ${reservation.qty}`}
        </Button>
      </div>
    </Sheet>
  );
}
