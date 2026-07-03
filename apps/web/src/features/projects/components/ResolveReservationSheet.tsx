import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Projects } from "@sever/contracts";
import { Sheet, Button, Chip, Loading, Field, Input } from "../../../ui-kit/index.ts";
import { useInStockUnits, useOverlappingReservations, useResolveReservation } from "../hooks.ts";

interface Props {
  reservation: Projects.ReservationDTO | null;
  modelName: string;
  onClose: () => void;
}

// Warehouse prep: turn a model-level reservation (qty) into concrete units.
export function ResolveReservationSheet({ reservation, modelName, onClose }: Props) {
  const navigate = useNavigate();
  const units = useInStockUnits(reservation?.modelId ?? "");
  const overlapping = useOverlappingReservations(reservation);
  const resolve = useResolveReservation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

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
    setSearch("");
    onClose();
  };

  const submit = () => {
    resolve.mutate({ id: reservation.id, unitIds: [...selected] }, { onSuccess: close });
  };

  const q = search.trim().toLowerCase();
  const blockedUnitIds = new Set(
    (overlapping.data ?? [])
      .filter((r) => r.id !== reservation.id)
      .flatMap((r) => r.resolvedUnitIds)
  );
  const list = (units.data ?? []).filter((u) =>
    !blockedUnitIds.has(u.id) &&
    (!q || [u.assetTag, u.serial ?? "", modelName].some((v) => v.toLowerCase().includes(q)))
  );
  const enough = selected.size === reservation.qty;

  return (
    <Sheet open={!!reservation} onClose={close} title={`Распределить · ${modelName}`}>
      <p className="card__subtitle" style={{ marginBottom: 12 }}>
        Нужно {reservation.qty} ед. Выбери конкретные единицы со склада. Выбрано {selected.size}.
      </p>
      <Field label="Поиск">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Модель, номер, серийник" />
      </Field>
      {units.isLoading || overlapping.isLoading ? (
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
                <div style={{ minWidth: 0 }}>
                  <p className="card__title">{u.assetTag}</p>
                  {u.serial && <p className="card__subtitle">S/N {u.serial}</p>}
                </div>
                <div className="row">
                  <button
                    className="icon-btn"
                    aria-label="Открыть карточку единицы"
                    title="Открыть"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/warehouse/units/${u.id}`, {
                        state: {
                          backTo: window.location.pathname,
                          reopenReservationId: reservation.id,
                          selectedUnitIds: [...selected],
                        },
                      });
                    }}
                  >
                    ↗
                  </button>
                  {selected.has(u.id) ? <Chip label="ВЫБРАНО" tone="accent" /> : <Chip label="СВОБОДНО" tone="ok" />}
                </div>
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
