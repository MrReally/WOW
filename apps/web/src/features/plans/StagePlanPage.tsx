import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Plans } from "@sever/contracts";
import { PLAN_LAYERS } from "@sever/contracts";

type PlanLayer = Plans.PlanLayer;
import { Card, Button, SectionHead, Chip, Field, Input, Select, Loading, ErrorState, EmptyState } from "../../ui-kit/index.ts";
import { useSession } from "../../app/session.ts";
import { StageCanvas, LAYER_COLOR } from "./StageCanvas.tsx";
import {
  useCurrentPlan, usePlanVersions, useProjectUnits,
  useCreatePlan, useNewVersion, useSetCurrentPlan,
  useAddElement, useUpdateElement, useDeleteElement, useMoveElements,
} from "./hooks.ts";

const LAYER_LABEL: Record<PlanLayer, string> = {
  fixtures: "Приборы", dmx: "DMX", power: "Питание", audio: "Звук", rigging: "Риггинг",
};
// DMX / power / audio are runs of cable between devices, not standalone markers.
const CABLE_LAYERS: PlanLayer[] = ["dmx", "power", "audio"];
const isCableLayer = (l: PlanLayer) => CABLE_LAYERS.includes(l);
const KIND_FOR_LAYER: Record<PlanLayer, Plans.PlanElementKind> = {
  fixtures: "fixture", dmx: "cable", power: "cable", audio: "cable", rigging: "truss",
};

export function StagePlanPage() {
  const { id: projectId = "" } = useParams();
  const navigate = useNavigate();
  const { can } = useSession();
  const canManage = can("plans.manage");

  const plan = useCurrentPlan(projectId);
  const versions = usePlanVersions(projectId);
  const units = useProjectUnits(projectId);

  const createPlan = useCreatePlan(projectId);
  const newVersion = useNewVersion(projectId);
  const setCurrent = useSetCurrentPlan(projectId);
  const addElement = useAddElement(projectId);
  const updateElement = useUpdateElement(projectId);
  const deleteElement = useDeleteElement(projectId);
  const moveElements = useMoveElements(projectId);

  const [visible, setVisible] = useState<Set<PlanLayer>>(new Set(PLAN_LAYERS));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Record<string, { x: number; y: number }>>({});
  const [newLayer, setNewLayer] = useState<PlanLayer>("fixtures");
  const [newLabel, setNewLabel] = useState("");
  const [fromEl, setFromEl] = useState("");
  const [toEl, setToEl] = useState("");
  const [planName, setPlanName] = useState("Сцена");

  const data = plan.data ?? null;
  const elements = useMemo(
    () => (data?.elements ?? []).map((e) => (drag[e.id] ? { ...e, ...drag[e.id] } : e)),
    [data, drag]
  );
  const selected = elements.find((e) => e.id === selectedId) ?? null;
  // Devices (anything that isn't a cable) are the points a cable can connect.
  const devices = elements.filter((e) => e.kind !== "cable");
  const deviceName = (id: string | null) => devices.find((d) => d.id === id)?.label || (id ? id.slice(0, 4) : "—");

  if (plan.isLoading) return <Loading />;
  if (plan.error) return <ErrorState error={plan.error} onRetry={plan.refetch} />;

  const toggleLayer = (l: PlanLayer) =>
    setVisible((prev) => {
      const next = new Set(prev);
      next.has(l) ? next.delete(l) : next.add(l);
      return next;
    });

  return (
    <div>
      <Button variant="ghost" onClick={() => navigate(`/projects/${projectId}`)}>← К проекту</Button>

      {!data ? (
        <Card style={{ marginTop: 10 }}>
          <SectionHead label="Технический план" />
          {canManage ? (
            <>
              <Field label="Название плана"><Input value={planName} onChange={(e) => setPlanName(e.target.value)} /></Field>
              <Button block disabled={!planName || createPlan.isPending} onClick={() => createPlan.mutate({ name: planName })}>
                Создать план
              </Button>
            </>
          ) : (
            <EmptyState title="План ещё не создан" />
          )}
        </Card>
      ) : (
        <>
          {/* Version bar */}
          <Card style={{ marginTop: 10 }}>
            <div className="row row--between">
              <div>
                <p className="card__title">{data.name}</p>
                <p className="card__subtitle">Версия {data.version}{data.isCurrent ? " · текущая" : ""}</p>
              </div>
              {canManage && (
                <div className="row">
                  <div style={{ width: 130 }}>
                    <Select
                      value={data.id}
                      onChange={(e) => setCurrent.mutate(e.target.value)}
                      options={(versions.data ?? []).map((v) => ({ value: v.id, label: `v${v.version}${v.isCurrent ? " ✓" : ""}` }))}
                    />
                  </div>
                  <Button variant="secondary" disabled={newVersion.isPending} onClick={() => newVersion.mutate(data.id)}>
                    + Версия
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* Layer toggles */}
          <div className="row" style={{ flexWrap: "wrap", gap: 6, margin: "12px 0" }}>
            {PLAN_LAYERS.map((l) => (
              <button
                key={l}
                onClick={() => toggleLayer(l)}
                className="chip"
                style={{
                  cursor: "pointer",
                  border: `1px solid ${LAYER_COLOR[l]}`,
                  color: visible.has(l) ? "#fff" : LAYER_COLOR[l],
                  background: visible.has(l) ? LAYER_COLOR[l] : "transparent",
                }}
              >
                {LAYER_LABEL[l]}
              </button>
            ))}
          </div>

          {/* Canvas */}
          <StageCanvas
            plan={data}
            elements={elements}
            visible={visible}
            editable={canManage}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDrag={(id, x, y) => setDrag((d) => ({ ...d, [id]: { x, y } }))}
            onDrop={(id) => {
              const el = elements.find((e) => e.id === id);
              if (el) {
                moveElements.mutate(
                  { planId: data.id, items: [{ id, x: el.x, y: el.y, rotation: el.rotation }] },
                  { onSuccess: () => setDrag((d) => { const n = { ...d }; delete n[id]; return n; }) }
                );
              }
            }}
          />

          {/* Selected element panel */}
          {selected && canManage && (
            <Card style={{ marginTop: 12 }}>
              <div className="row row--between" style={{ marginBottom: 8 }}>
                <Chip label={LAYER_LABEL[selected.layer]} tone="neutral" />
                <Button variant="danger" onClick={() => { deleteElement.mutate(selected.id); setSelectedId(null); }}>
                  Удалить
                </Button>
              </div>
              <Field label="Подпись">
                <Input value={selected.label} onChange={(e) => updateElement.mutate({ id: selected.id, input: { label: e.target.value } })} />
              </Field>
              {selected.kind === "cable" ? (
                <div className="row">
                  <div style={{ flex: 1 }}>
                    <Select
                      value={selected.fromId ?? ""}
                      onChange={(e) => updateElement.mutate({ id: selected.id, input: { fromId: e.target.value || null } })}
                      options={devices.map((d) => ({ value: d.id, label: `от: ${d.label || d.id.slice(0, 4)}` }))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Select
                      value={selected.toId ?? ""}
                      onChange={(e) => updateElement.mutate({ id: selected.id, input: { toId: e.target.value || null } })}
                      options={devices.map((d) => ({ value: d.id, label: `к: ${d.label || d.id.slice(0, 4)}` }))}
                    />
                  </div>
                </div>
              ) : (
                <div className="row">
                  <Button variant="secondary" onClick={() => updateElement.mutate({ id: selected.id, input: { rotation: (selected.rotation + 15) % 360 } })}>
                    Повернуть ⟳
                  </Button>
                  <div style={{ flex: 1 }}>
                    <Select
                      value={selected.unitId ?? ""}
                      onChange={(e) => updateElement.mutate({ id: selected.id, input: { unitId: e.target.value || null } })}
                      options={[{ value: "", label: "— привязать единицу —" }, ...(units.data ?? []).map((u) => ({ value: u.id, label: u.assetTag }))]}
                    />
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Add element */}
          {canManage && (
            <Card style={{ marginTop: 12 }}>
              <SectionHead label={isCableLayer(newLayer) ? "Протянуть кабель" : "Добавить прибор"} />
              <div className="row" style={{ marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <Select value={newLayer} onChange={(e) => setNewLayer(e.target.value as PlanLayer)} options={PLAN_LAYERS.map((l) => ({ value: l, label: LAYER_LABEL[l] }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={isCableLayer(newLayer) ? "Подпись (необяз.)" : "Подпись (MH1, U2…)"} />
                </div>
              </div>

              {isCableLayer(newLayer) ? (
                devices.length < 2 ? (
                  <p className="card__subtitle">Сначала добавьте минимум два прибора (слои «Приборы» / «Риггинг») — кабель соединяет их.</p>
                ) : (() => {
                  const from = fromEl || devices[0]!.id;
                  const to = toEl || devices[1]!.id;
                  const a = devices.find((d) => d.id === from);
                  const b = devices.find((d) => d.id === to);
                  return (
                    <>
                      <div className="row">
                        <div style={{ flex: 1 }}>
                          <Select value={from} onChange={(e) => setFromEl(e.target.value)} options={devices.map((d) => ({ value: d.id, label: `от: ${deviceName(d.id)}` }))} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <Select value={to} onChange={(e) => setToEl(e.target.value)} options={devices.map((d) => ({ value: d.id, label: `к: ${deviceName(d.id)}` }))} />
                        </div>
                      </div>
                      <Button
                        block
                        style={{ marginTop: 8 }}
                        disabled={addElement.isPending || from === to || !a || !b}
                        onClick={() =>
                          addElement.mutate(
                            {
                              planId: data.id, layer: newLayer, kind: "cable", label: newLabel,
                              x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2, fromId: from, toId: to,
                            },
                            { onSuccess: () => setNewLabel("") }
                          )
                        }
                      >
                        🔌 Соединить кабелем
                      </Button>
                      {from === to && <p className="card__subtitle" style={{ color: "var(--alert)", marginTop: 6 }}>Выберите два разных прибора</p>}
                    </>
                  );
                })()
              ) : (
                <>
                  <Button
                    block
                    disabled={addElement.isPending}
                    onClick={() =>
                      addElement.mutate(
                        { planId: data.id, layer: newLayer, kind: KIND_FOR_LAYER[newLayer], label: newLabel, x: data.stageW / 2, y: data.stageH / 2 },
                        { onSuccess: () => setNewLabel("") }
                      )
                    }
                  >
                    + На сцену
                  </Button>
                  <p className="card__subtitle" style={{ marginTop: 8 }}>Перетаскивай приборы по сцене, чтобы расставить. DMX / Питание / Звук — это кабели между приборами.</p>
                </>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
