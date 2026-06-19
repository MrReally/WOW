import { useState } from "react";
import type { Equipment, Projects } from "@sever/contracts";
import { Sheet, Field, Input, Select, Button } from "../../../ui-kit/index.ts";
import { useIssueQty, useReturnQty, useModelStock } from "../hooks.ts";

interface Props {
  model: Equipment.EquipmentModelDTO | null;
  projects: Projects.ProjectDTO[];
  onClose: () => void;
}

export function CableMoveSheet({ model, projects, onClose }: Props) {
  const [mode, setMode] = useState<"issue" | "return">("issue");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const issue = useIssueQty();
  const ret = useReturnQty();
  const stock = useModelStock(model?.id ?? "", !!model);

  if (!model) return null;

  const submit = () => {
    const input = { projectId, modelId: model.id, qty: Number(qty) };
    const opts = { onSuccess: () => onClose() };
    mode === "issue" ? issue.mutate(input, opts) : ret.mutate(input, opts);
  };

  return (
    <Sheet open={!!model} onClose={onClose} title={model.name}>
      {stock.data && (
        <div className="card card--flat" style={{ marginBottom: 14 }}>
          <div className="card__subtitle" style={{ color: "var(--text2)" }}>
            всего {stock.data.total} · свободно {stock.data.inStock} · на проектах {stock.data.onProjects}
          </div>
        </div>
      )}
      <div className="row" style={{ marginBottom: 14 }}>
        <Button variant={mode === "issue" ? "primary" : "secondary"} block onClick={() => setMode("issue")}>Выдать</Button>
        <Button variant={mode === "return" ? "primary" : "secondary"} block onClick={() => setMode("return")}>Принять</Button>
      </div>
      <Field label="Проект">
        <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
      </Field>
      <Field label="Количество">
        <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
      </Field>
      <Button
        block
        disabled={!projectId || Number(qty) <= 0 || issue.isPending || ret.isPending}
        onClick={submit}
      >
        {mode === "issue" ? `Выдать ${qty}` : `Принять ${qty}`}
      </Button>
    </Sheet>
  );
}

export function CableRow({ model, onMove, last }: { model: Equipment.EquipmentModelDTO; onMove: () => void; last?: boolean }) {
  const stock = useModelStock(model.id);
  const attrs = model.attrs as Equipment.CableAttrs | null;
  return (
    <div className="lrow" style={{ borderBottom: last ? "none" : undefined }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="lrow__title">{model.name}</div>
        <div className="lrow__detail">
          {attrs?.cableType ? `${attrs.cableType} · ${attrs.lengthM}m` : "кабель"}
          {stock.data ? ` · свободно ${stock.data.inStock}/${stock.data.total}` : ""}
        </div>
      </div>
      <Button variant="secondary" style={{ height: 38, padding: "0 12px" }} onClick={onMove}>
        Выдать / Принять
      </Button>
    </div>
  );
}
