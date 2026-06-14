import { useMemo, useState } from "react";
import type { Equipment, Projects } from "@sever/contracts";
import { Sheet, Field, Select, Button, StatusBadge, Loading } from "../../../ui-kit/index.ts";
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
  const [result, setResult] = useState<Equipment.ReturnResult | null>(null);

  const issue = useIssueUnits();
  const ret = useReturnUnits();

  // Issue: pick from in-stock units. Return: from units on this project.
  const inStock = useUnits(mode === "issue" ? { status: "in_stock" } : undefined);
  const onProject = useUnits(mode === "return" && projectId ? { projectId } : undefined);

  const units = mode === "issue" ? inStock.data ?? [] : onProject.data ?? [];
  const loading = mode === "issue" ? inStock.isLoading : onProject.isLoading;
  const modelName = useMemo(() => {
    const map = new Map(models.map((m) => [m.id, m.name]));
    return (id: string) => map.get(id) ?? id;
  }, [models]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const reset = () => {
    setSelected(new Set());
    setResult(null);
  };

  const submit = () => {
    if (mode === "issue") {
      issue.mutate(
        { projectId, unitIds: [...selected] },
        { onSuccess: () => { reset(); onClose(); } }
      );
    } else {
      const expected = units.map((u) => u.id);
      ret.mutate(
        { projectId, expectedUnitIds: expected, returnedUnitIds: [...selected] },
        { onSuccess: (r) => setResult(r) }
      );
    }
  };

  return (
    <Sheet open={open} onClose={() => { reset(); onClose(); }} title="Выдача / Возврат">
      <div className="row" style={{ marginBottom: "var(--space-4)" }}>
        <Button variant={mode === "issue" ? "primary" : "secondary"} block onClick={() => { setMode("issue"); reset(); }}>
          Выдача
        </Button>
        <Button variant={mode === "return" ? "primary" : "secondary"} block onClick={() => { setMode("return"); reset(); }}>
          Возврат
        </Button>
      </div>

      <Field label="Проект">
        <Select
          value={projectId}
          onChange={(e) => { setProjectId(e.target.value); reset(); }}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />
      </Field>

      {result ? (
        <div className="stack">
          <div className="card">
            <p className="card__title">Возврат принят</p>
            <p className="card__subtitle">Возвращено: {result.returned.length}</p>
            {result.missing.length > 0 ? (
              <p className="card__subtitle" style={{ color: "var(--warn)" }}>
                Некомплект: {result.missing.length} — создана проблема для Apex
              </p>
            ) : (
              <p className="card__subtitle" style={{ color: "var(--ok)" }}>Полный возврат</p>
            )}
          </div>
          <Button block onClick={() => { reset(); onClose(); }}>Готово</Button>
        </div>
      ) : (
        <>
          <div className="section-title">
            {mode === "issue" ? "Доступно на складе" : "На проекте"} · выбрано {selected.size}
          </div>
          {loading ? (
            <Loading />
          ) : units.length === 0 ? (
            <p className="card__subtitle">Нет единиц.</p>
          ) : (
            <div className="stack">
              {units.map((u) => (
                <div
                  key={u.id}
                  className={`card card--tappable`}
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

          <div style={{ marginTop: "var(--space-4)" }}>
            <Button
              block
              disabled={selected.size === 0 || !projectId || issue.isPending || ret.isPending}
              onClick={submit}
            >
              {mode === "issue" ? `Выдать ${selected.size}` : `Принять ${selected.size}`}
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
