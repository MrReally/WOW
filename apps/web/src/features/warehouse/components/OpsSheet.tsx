import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Equipment, Projects } from "@sever/contracts";
import { Sheet, Field, Select, Input, Button, StatusBadge, Loading, Chip } from "../../../ui-kit/index.ts";
import { unitStatusLabel, unitStatusTone } from "../../../lib/labels.ts";
import { useUnits, useIssueUnits, useReturnUnits, useProjectReservations } from "../hooks.ts";

interface Props {
  open: boolean;
  onClose: () => void;
  projects: Projects.ProjectDTO[];
  models: Equipment.EquipmentModelDTO[];
}

export function OpsSheet({ open, onClose, projects, models }: Props) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"issue" | "return">("issue");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<Equipment.ReturnResult | null>(null);
  const [snapshot, setSnapshot] = useState<Map<string, string>>(new Map());

  const issue = useIssueUnits();
  const ret = useReturnUnits();

  // Issue: pick from in-stock units. Return: from units out on this project.
  const inStock = useUnits(mode === "issue" ? { status: "in_stock" } : undefined);
  const onProject = useUnits(mode === "return" && projectId ? { projectId } : undefined);
  const reservations = useProjectReservations(projectId);

  const units = useMemo(
    () => (mode === "issue" ? inStock.data ?? [] : (onProject.data ?? []).filter((u) => u.status === "on_project")),
    [mode, inStock.data, onProject.data]
  );
  const loading = mode === "issue" ? inStock.isLoading : onProject.isLoading;
  const modelName = useMemo(() => {
    const map = new Map(models.map((m) => [m.id, m.name]));
    return (id: string) => map.get(id) ?? id;
  }, [models]);
  const normalizedSearch = search.trim().toLowerCase();
  const matchesSearch = (u: Equipment.EquipmentUnitDTO) => {
    if (!normalizedSearch) return true;
    return [
      u.assetTag,
      u.serial ?? "",
      modelName(u.modelId),
    ].some((v) => v.toLowerCase().includes(normalizedSearch));
  };

  const needs = useMemo(() => {
    const byModel = new Map<string, { modelId: string; qty: number; resolved: number }>();
    for (const r of reservations.data ?? []) {
      const cur = byModel.get(r.modelId) ?? { modelId: r.modelId, qty: 0, resolved: 0 };
      cur.qty += r.qty;
      cur.resolved += r.resolvedUnitIds.length;
      byModel.set(r.modelId, cur);
    }
    return [...byModel.values()].sort((a, b) => modelName(a.modelId).localeCompare(modelName(b.modelId)));
  }, [reservations.data, modelName]);
  const resolvedIds = useMemo(
    () => new Set((reservations.data ?? []).flatMap((r) => r.resolvedUnitIds)),
    [reservations.data]
  );
  const neededModelIds = new Set(needs.map((n) => n.modelId));
  const visibleUnits = units.filter(matchesSearch);

  // Returns are full by default — most gear comes back; the warehouse just
  // unchecks whatever's missing. Issues start with nothing selected.
  const unitIdsKey = units.map((u) => u.id).join(",");
  useEffect(() => {
    setResult(null);
    setSelected(mode === "return" ? new Set(units.map((u) => u.id)) : new Set(units.filter((u) => resolvedIds.has(u.id)).map((u) => u.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, projectId, unitIdsKey, reservations.data]);

  useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id);
  }, [projectId, projects]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const closeAll = () => {
    setSelected(new Set());
    setNote("");
    setSearch("");
    setResult(null);
    onClose();
  };

  const missingCount = mode === "return" ? units.length - selected.size : 0;

  const submit = () => {
    if (mode === "issue") {
      issue.mutate(
        { projectId, unitIds: [...selected], note: note.trim() || undefined },
        { onSuccess: closeAll }
      );
    } else {
      setSnapshot(new Map(units.map((u) => [u.id, u.assetTag])));
      ret.mutate(
        { projectId, expectedUnitIds: units.map((u) => u.id), returnedUnitIds: [...selected], note: note.trim() || undefined },
        { onSuccess: (r) => setResult(r) }
      );
    }
  };

  return (
    <Sheet open={open} onClose={closeAll} title="Выдача / Возврат">
      <div className="row" style={{ marginBottom: "var(--space-4)" }}>
        <Button variant={mode === "issue" ? "primary" : "secondary"} block onClick={() => setMode("issue")}>
          Выдача
        </Button>
        <Button variant={mode === "return" ? "primary" : "secondary"} block onClick={() => setMode("return")}>
          Возврат
        </Button>
      </div>

      <Field label="Проект">
        <Select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />
      </Field>

      <Field label="Поиск">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Модель, название, номер, серийник"
        />
      </Field>

      {result ? (
        <div className="stack">
          <div className="card">
            <p className="card__title">Возврат принят</p>
            <p className="card__subtitle">Возвращено: {result.returned.length}</p>
            {result.missing.length > 0 ? (
              <>
                <p className="card__subtitle" style={{ color: "var(--warn)", marginTop: 4 }}>
                  Некомплект: {result.missing.length} — создана проблема для Apex
                </p>
                <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {result.missing.map((id) => (
                    <span key={id} className="chip chip--neutral">{snapshot.get(id) ?? id.slice(0, 6)}</span>
                  ))}
                </div>
              </>
            ) : (
              <p className="card__subtitle" style={{ color: "var(--ok)", marginTop: 4 }}>Полный возврат</p>
            )}
          </div>
          <Button block onClick={closeAll}>Готово</Button>
        </div>
      ) : (
        <>
          <div className="row row--between" style={{ alignItems: "center", margin: "4px 0" }}>
            <span className="section-title" style={{ margin: 0 }}>
              {mode === "issue" ? "Нужно по заказу / дополнительно" : "Выдано на проект"} · выбрано {selected.size}
            </span>
            {units.length > 0 && (
              <div className="row" style={{ gap: 6 }}>
                <Button variant="ghost" onClick={() => setSelected(new Set(units.map((u) => u.id)))}>Все</Button>
                <Button variant="ghost" onClick={() => setSelected(new Set())}>Снять</Button>
              </div>
            )}
          </div>

          {mode === "return" && missingCount > 0 && (
            <p className="card__subtitle" style={{ color: "var(--warn)", marginBottom: 6 }}>
              Не отмечено {missingCount} — вернётся как некомплект (проблема в Apex).
            </p>
          )}

          {loading || (mode === "issue" && reservations.isLoading) ? (
            <Loading />
          ) : visibleUnits.length === 0 ? (
            <p className="card__subtitle">{mode === "issue" ? "На складе нет свободных единиц." : "На этом проекте нет выданного оборудования."}</p>
          ) : (
            <div className="stack">
              {mode === "issue" && needs.length > 0 && needs.map((need) => {
                const list = visibleUnits.filter((u) => u.modelId === need.modelId);
                const picked = [...selected].filter((id) => units.find((u) => u.id === id)?.modelId === need.modelId).length;
                return (
                  <div key={need.modelId} className="card card--flat">
                    <div className="row row--between" style={{ marginBottom: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <p className="card__title">{modelName(need.modelId)}</p>
                        <p className="card__subtitle">заказано {need.qty} · распределено {need.resolved} · выбрано {picked}/{need.qty}</p>
                      </div>
                      <Chip label={picked >= need.qty ? "OK" : `${picked}/${need.qty}`} tone={picked >= need.qty ? "ok" : "warn"} />
                    </div>
                    {list.length === 0 ? (
                      <p className="card__subtitle">Свободных единиц этой модели не найдено.</p>
                    ) : (
                      <div className="stack">
                        {list.map((u) => (
                          <UnitPickRow key={u.id} unit={u} modelName={modelName(u.modelId)} reserved={resolvedIds.has(u.id)} selected={selected.has(u.id)} onToggle={() => toggle(u.id)} onOpen={() => navigate(`/warehouse/units/${u.id}`)} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {mode === "issue" && (
                <div className="card card--flat">
                  <p className="card__title">Дополнительно со склада</p>
                  <p className="card__subtitle">Можно добавить сверх заказа, если это нужно на площадке.</p>
                  <div className="stack" style={{ marginTop: 10 }}>
                    {visibleUnits.filter((u) => !neededModelIds.has(u.modelId)).map((u) => (
                      <UnitPickRow key={u.id} unit={u} modelName={modelName(u.modelId)} selected={selected.has(u.id)} onToggle={() => toggle(u.id)} onOpen={() => navigate(`/warehouse/units/${u.id}`)} />
                    ))}
                  </div>
                </div>
              )}

              {mode === "return" && visibleUnits.map((u) => (
                <UnitPickRow key={u.id} unit={u} modelName={modelName(u.modelId)} selected={selected.has(u.id)} onToggle={() => toggle(u.id)} onOpen={() => navigate(`/warehouse/units/${u.id}`)} />
              ))}
            </div>
          )}

          {units.length > 0 && (
            <div style={{ marginTop: "var(--space-3)" }}>
              <Field label="Заметка (необязательно)">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Кому выдал / состояние и т.п." />
              </Field>
            </div>
          )}

          <div style={{ marginTop: "var(--space-3)" }}>
            <Button
              block
              disabled={!projectId || issue.isPending || ret.isPending || (mode === "issue" && selected.size === 0)}
              onClick={submit}
            >
              {mode === "issue" ? `Выдать ${selected.size}` : `Принять возврат (${selected.size})`}
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function UnitPickRow({
  unit,
  modelName,
  selected,
  reserved = false,
  onToggle,
  onOpen,
}: {
  unit: Equipment.EquipmentUnitDTO;
  modelName: string;
  selected: boolean;
  reserved?: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      className="card card--tappable"
      onClick={onToggle}
      style={{ borderColor: selected ? "var(--accent)" : undefined }}
    >
      <div className="row row--between">
        <div style={{ minWidth: 0 }}>
          <p className="card__title">{unit.assetTag}</p>
          <p className="card__subtitle">
            {modelName}{unit.serial ? ` · S/N ${unit.serial}` : ""}
            {reserved ? " · распределено в бронь" : ""}
          </p>
        </div>
        <div className="row">
          <Button
            variant="ghost"
            style={{ height: 34, padding: "0 8px" }}
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            Открыть
          </Button>
          <StatusBadge tone={unitStatusTone[unit.status]}>{unitStatusLabel[unit.status]}</StatusBadge>
          <input type="checkbox" checked={selected} readOnly />
        </div>
      </div>
    </div>
  );
}
