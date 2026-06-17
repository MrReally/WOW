import { useEffect, useMemo, useState } from "react";
import type { Equipment, Projects } from "@sever/contracts";
import { Sheet, Field, Select, Input, Button, StatusBadge, Loading } from "../../../ui-kit/index.ts";
import { unitStatusLabel, unitStatusTone } from "../../../lib/labels.ts";
import { useUnits, useIssueUnits, useReturnUnits } from "../hooks.ts";

interface Props {
  open: boolean;
  onClose: () => void;
  projects: Projects.ProjectDTO[];
  models: Equipment.EquipmentModelDTO[];
}

export function OpsSheet({ open, onClose, projects, models }: Props) {
  const [mode, setMode] = useState<"issue" | "return">("issue");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [result, setResult] = useState<Equipment.ReturnResult | null>(null);
  const [snapshot, setSnapshot] = useState<Map<string, string>>(new Map());

  const issue = useIssueUnits();
  const ret = useReturnUnits();

  // Issue: pick from in-stock units. Return: from units out on this project.
  const inStock = useUnits(mode === "issue" ? { status: "in_stock" } : undefined);
  const onProject = useUnits(mode === "return" && projectId ? { projectId } : undefined);

  const units = useMemo(
    () => (mode === "issue" ? inStock.data ?? [] : (onProject.data ?? []).filter((u) => u.status === "on_project")),
    [mode, inStock.data, onProject.data]
  );
  const loading = mode === "issue" ? inStock.isLoading : onProject.isLoading;
  const modelName = useMemo(() => {
    const map = new Map(models.map((m) => [m.id, m.name]));
    return (id: string) => map.get(id) ?? id;
  }, [models]);

  // Returns are full by default — most gear comes back; the warehouse just
  // unchecks whatever's missing. Issues start with nothing selected.
  const unitIdsKey = units.map((u) => u.id).join(",");
  useEffect(() => {
    setResult(null);
    setSelected(mode === "return" ? new Set(units.map((u) => u.id)) : new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, projectId, unitIdsKey]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const closeAll = () => {
    setSelected(new Set());
    setNote("");
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
              {mode === "issue" ? "Доступно на складе" : "Выдано на проект"} · выбрано {selected.size}
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

          {loading ? (
            <Loading />
          ) : units.length === 0 ? (
            <p className="card__subtitle">{mode === "issue" ? "На складе нет свободных единиц." : "На этом проекте нет выданного оборудования."}</p>
          ) : (
            <div className="stack">
              {units.map((u) => (
                <div
                  key={u.id}
                  className="card card--tappable"
                  onClick={() => toggle(u.id)}
                  style={{ borderColor: selected.has(u.id) ? "var(--accent)" : undefined }}
                >
                  <div className="row row--between">
                    <div>
                      <p className="card__title">{u.assetTag}</p>
                      <p className="card__subtitle">{modelName(u.modelId)}</p>
                    </div>
                    <div className="row">
                      <StatusBadge tone={unitStatusTone[u.status]}>{unitStatusLabel[u.status]}</StatusBadge>
                      <input type="checkbox" checked={selected.has(u.id)} readOnly />
                    </div>
                  </div>
                </div>
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
