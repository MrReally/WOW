import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Equipment, Plans } from "@sever/contracts";
import { PLAN_LAYERS } from "@sever/contracts";
import { Button, Card, Chip, EmptyState, ErrorState, Field, Input, Loading, SectionHead, Select, Textarea } from "../../ui-kit/index.ts";
import { useSession } from "../../app/session.ts";
import { StageCanvas } from "./StageCanvas.tsx";
import {
  useAddElement,
  useCreatePlan,
  useCurrentPlan,
  useDeleteElement,
  useMoveElements,
  useNewVersion,
  usePlanVersions,
  useProjectModels,
  useProjectUnits,
  useSetCurrentPlan,
  useUpdateElement,
} from "./hooks.ts";
import { calculatePower, cableAttrs, elementLabel, findDmxConflicts, isCableCompatible, LAYER_COLOR, LAYER_LABEL, modelAttrs, numberAttr, stageSymbol } from "./planUtils.ts";
import "./stage-plan.css";

type PlanLayer = Plans.PlanLayer;
type AddMode = "device" | "power" | "cable";

const DEVICE_LAYERS: PlanLayer[] = ["light", "sound"];
const CABLE_LAYERS: PlanLayer[] = ["dmx", "power", "audio"];

export function StagePlanPage() {
  const { id: projectId = "" } = useParams();
  const navigate = useNavigate();
  const { can } = useSession();
  const canManage = can("plans.manage");
  const plan = useCurrentPlan(projectId);
  const versions = usePlanVersions(projectId);
  const modelsQuery = useProjectModels();
  const unitsQuery = useProjectUnits(projectId);
  const createPlan = useCreatePlan(projectId);
  const newVersion = useNewVersion(projectId);
  const setCurrent = useSetCurrentPlan(projectId);
  const addElement = useAddElement(projectId);
  const updateElement = useUpdateElement(projectId);
  const deleteElement = useDeleteElement(projectId);
  const moveElements = useMoveElements(projectId);

  const [editMode, setEditMode] = useState(false);
  const [visible, setVisible] = useState<Set<PlanLayer>>(new Set(PLAN_LAYERS));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Record<string, { x: number; y: number }>>({});
  const [planName, setPlanName] = useState("Сцена");
  const data = plan.data ?? null;
  const models = modelsQuery.data ?? [];
  const units = unitsQuery.data ?? [];
  const elements = useMemo(
    () => (data?.elements ?? []).map((element) => drag[element.id] ? { ...element, ...drag[element.id] } : element),
    [data, drag],
  );
  const selected = elements.find((element) => element.id === selectedId) ?? null;
  const dmxConflicts = useMemo(() => findDmxConflicts(elements), [elements]);
  const power = useMemo(() => calculatePower(elements, models), [elements, models]);

  useEffect(() => {
    if (!canManage) setEditMode(false);
  }, [canManage]);
  useEffect(() => {
    if (selectedId && !elements.some((element) => element.id === selectedId)) setSelectedId(null);
  }, [elements, selectedId]);
  useEffect(() => {
    if (!editMode || !selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["input", "textarea", "select"].includes(target.tagName.toLowerCase()))) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (confirm(`Удалить «${elementLabel(selected, models.find((model) => model.id === selected.modelId))}»? Связанные линии тоже будут удалены.`)) {
          deleteElement.mutate(selected.id);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteElement, editMode, models, selected]);

  if (plan.isLoading || modelsQuery.isLoading) return <Loading />;
  if (plan.error) return <ErrorState error={plan.error} onRetry={plan.refetch} />;
  if (modelsQuery.error) return <ErrorState error={modelsQuery.error} onRetry={modelsQuery.refetch} />;

  const showPreset = (layers: PlanLayer[]) => setVisible(new Set(layers));
  const toggleLayer = (layer: PlanLayer) => setVisible((current) => {
    const next = new Set(current);
    next.has(layer) ? next.delete(layer) : next.add(layer);
    return next;
  });

  return (
    <div className="stage-plan">
      <div className="stage-plan__topbar">
        <Button variant="ghost" onClick={() => navigate(`/projects/${projectId}`)}>← К проекту</Button>
        {canManage && data && (
          <div className="stage-plan__mode" aria-label="Режим схемы">
            <button className={!editMode ? "is-active" : ""} onClick={() => setEditMode(false)}>Просмотр</button>
            <button className={editMode ? "is-active" : ""} onClick={() => setEditMode(true)}>Редактирование</button>
          </div>
        )}
      </div>

      {!data ? (
        <Card>
          <SectionHead label="Схема сцены" />
          {canManage ? (
            <div className="stage-plan__create">
              <Field label="Название"><Input value={planName} maxLength={120} onChange={(event) => setPlanName(event.target.value)} /></Field>
              <Button disabled={!planName.trim() || createPlan.isPending} onClick={() => createPlan.mutate({ name: planName.trim() })}>Создать схему</Button>
            </div>
          ) : <EmptyState title="Схема ещё не создана" />}
        </Card>
      ) : (
        <>
          <Card className="stage-plan__header">
            <div>
              <p className="card__title">{data.name}</p>
              <p className="card__subtitle">Версия {data.version}{data.isCurrent ? " · текущая" : ""} · {elements.length} элементов</p>
            </div>
            {editMode && (
              <div className="stage-plan__versions">
                <Select value={data.id} aria-label="Версия схемы" onChange={(event) => setCurrent.mutate(event.target.value)} options={(versions.data ?? []).map((version) => ({ value: version.id, label: `v${version.version}${version.isCurrent ? " ✓" : ""}` }))} />
                <Button variant="secondary" disabled={newVersion.isPending} onClick={() => newVersion.mutate(data.id)}>Новая версия</Button>
              </div>
            )}
          </Card>

          <div className="stage-plan__layers" aria-label="Слои схемы">
            <button onClick={() => showPreset(PLAN_LAYERS)}>Все</button>
            <button onClick={() => showPreset(["light", "dmx"])}>Свет</button>
            <button onClick={() => showPreset(["sound", "audio"])}>Звук</button>
            <button onClick={() => showPreset(["power"])}>Питание</button>
            {PLAN_LAYERS.map((layer) => (
              <button key={layer} className={visible.has(layer) ? "is-active" : ""} onClick={() => toggleLayer(layer)}>
                <span style={{ background: LAYER_COLOR[layer] }} />{LAYER_LABEL[layer]}
              </button>
            ))}
          </div>

          <StageCanvas
            plan={data}
            elements={elements}
            models={models}
            visible={visible}
            editable={editMode}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDrag={(id, x, y) => setDrag((current) => ({ ...current, [id]: { x, y } }))}
            onDrop={(id) => {
              const element = elements.find((item) => item.id === id);
              if (!element) return;
              moveElements.mutate({ planId: data.id, items: [{ id, x: element.x, y: element.y, rotation: element.rotation }] }, {
                onSettled: () => setDrag((current) => { const next = { ...current }; delete next[id]; return next; }),
              });
            }}
          />

          <PlanHealth
            elements={elements}
            models={models}
            power={power}
            conflicts={dmxConflicts}
            onSelect={setSelectedId}
          />

          {selected && (
            <ElementInspector
              key={selected.id}
              element={selected}
              elements={elements}
              models={models}
              units={units}
              editable={editMode}
              saving={updateElement.isPending}
              onSave={(input) => updateElement.mutate({ id: selected.id, input })}
              onDelete={() => {
                if (confirm(`Удалить «${elementLabel(selected, models.find((model) => model.id === selected.modelId))}»? Связанные линии тоже будут удалены.`)) {
                  deleteElement.mutate(selected.id);
                }
              }}
            />
          )}

          {editMode && (
            <AddElementPanel plan={data} elements={elements} models={models} units={units} pending={addElement.isPending} onAdd={(input) => addElement.mutate(input)} />
          )}
        </>
      )}
    </div>
  );
}

function PlanHealth({ elements, models, power, conflicts, onSelect }: {
  elements: Plans.PlanElementDTO[];
  models: Equipment.EquipmentModelDTO[];
  power: ReturnType<typeof calculatePower>;
  conflicts: ReturnType<typeof findDmxConflicts>;
  onSelect: (id: string) => void;
}) {
  const modelById = new Map(models.map((model) => [model.id, model]));
  const byId = new Map(elements.map((element) => [element.id, element]));
  const powerCables = elements.filter((element) => element.kind === "cable" && element.layer === "power");
  const incompatibleCableIds=elements.filter(element=>element.kind==="cable"&&element.modelId).filter(element=>{const model=modelById.get(element.modelId!);return !!model&&!isCableCompatible(element.layer,model);}).map(element=>element.id);
  const hasWarnings = conflicts.length > 0 || power.unconnectedIds.length > 0 || power.undersizedCableIds.length > 0 || incompatibleCableIds.length>0 || power.requiredOutlets > power.availableOutlets || (power.capacityW > 0 && power.totalPowerW > power.capacityW);
  return (
    <Card className="stage-plan__health">
      <div className="stage-plan__health-head">
        <div><p className="card__title">Питание и проверка</p><p className="card__subtitle">Значения введены вручную; сводка пересчитывается из схемы.</p></div>
        <Chip label={hasWarnings ? "Есть замечания" : "Проверено"} tone={hasWarnings ? "warn" : "ok"} />
      </div>
      <div className="stage-plan__metrics">
        <Metric value={`${power.totalPowerW} Вт`} label="нагрузка" warn={power.capacityW > 0 && power.totalPowerW > power.capacityW} />
        <Metric value={power.capacityW ? `${power.capacityW} Вт` : "—"} label="доступная мощность" />
        <Metric value={`${power.requiredOutlets} / ${power.availableOutlets}`} label="нужно / доступно розеток" warn={power.requiredOutlets > power.availableOutlets} />
        <Metric value={String(powerCables.length)} label="силовых линий" />
      </div>
      {power.sourceBreakdown.length > 0 && <div className="stage-plan__sources">{power.sourceBreakdown.map((source) => { const point=byId.get(source.sourceId); return <button key={source.sourceId} onClick={()=>onSelect(source.sourceId)}><b>{point?.label||"Точка питания"}</b><span>{source.totalPowerW} / {source.capacityW||"—"} Вт · {source.requiredOutlets} / {source.availableOutlets} роз. · приборов {source.consumerIds.length}</span></button>; })}</div>}
      {powerCables.length > 0 && (
        <div className="stage-plan__schedule">
          {powerCables.map((line) => {
            const model = line.modelId ? modelById.get(line.modelId) : undefined;
            const attrs = cableAttrs(model);
            const needed = numberAttr(line, "cableLengthM");
            return <button key={line.id} onClick={() => onSelect(line.id)}><b>{elementLabel(line, model)}</b><span>{model?.name ?? "Кабель не выбран"} · требуется {needed ?? "—"} м · имеется {attrs?.lengthM ?? "—"} м</span></button>;
          })}
        </div>
      )}
      <div className="stage-plan__warnings">
        {conflicts.map((conflict) => <button key={`${conflict.firstId}-${conflict.secondId}`} onClick={() => onSelect(conflict.firstId)}>Конфликт DMX: universe {conflict.universe}, адреса {conflict.from}–{conflict.to}</button>)}
        {power.unconnectedIds.map((id) => <button key={id} onClick={() => onSelect(id)}>Нет линии питания: {byId.get(id)?.label || "прибор"}</button>)}
        {power.undersizedCableIds.map((id) => <button key={id} onClick={() => onSelect(id)}>Выбранный силовой кабель короче требуемой длины</button>)}
        {incompatibleCableIds.map(id=><button key={id} onClick={()=>onSelect(id)}>Тип выбранного кабеля не соответствует слою</button>)}
        {power.requiredOutlets > power.availableOutlets && <p>Не хватает розеток: {power.requiredOutlets - power.availableOutlets}</p>}
        {power.capacityW > 0 && power.totalPowerW > power.capacityW && <p>Превышение мощности: {power.totalPowerW - power.capacityW} Вт</p>}
      </div>
    </Card>
  );
}

function Metric({ value, label, warn = false }: { value: string; label: string; warn?: boolean }) {
  return <div className={warn ? "is-warning" : ""}><strong>{value}</strong><span>{label}</span></div>;
}

function ElementInspector({ element, elements, models, units, editable, saving, onSave, onDelete }: {
  element: Plans.PlanElementDTO;
  elements: Plans.PlanElementDTO[];
  models: Equipment.EquipmentModelDTO[];
  units: Equipment.EquipmentUnitDTO[];
  editable: boolean;
  saving: boolean;
  onSave: (input: Plans.UpdateElementInput) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(element.label);
  const [modelId, setModelId] = useState(element.modelId ?? "");
  const [unitId, setUnitId] = useState(element.unitId ?? "");
  const [rotation, setRotation] = useState(String(element.rotation));
  const [width, setWidth] = useState(element.w == null ? "" : String(element.w));
  const [height, setHeight] = useState(element.h == null ? "" : String(element.h));
  const [fromId, setFromId] = useState(element.fromId ?? "");
  const [toId, setToId] = useState(element.toId ?? "");
  const [attrs, setAttrs] = useState<Record<string, string>>(() => attrsToDraft(element.attrs));
  const model = (modelId ? models.find((item) => item.id === modelId) : undefined) ?? (element.modelId ? models.find((item) => item.id === element.modelId) : undefined);
  const unit = units.find((item) => item.id === element.unitId);
  const devices = elements.filter((item) => item.kind !== "cable");
  const isCable = element.kind === "cable";
  const cable = isCable ? cableAttrs(model) : null;
  const setAttr = (key: string, value: string) => setAttrs((current) => ({ ...current, [key]: value }));
  const dmxEnd = numberAttr(element, "dmxAddress") && numberAttr(element, "dmxChannels") ? numberAttr(element, "dmxAddress")! + numberAttr(element, "dmxChannels")! - 1 : null;

  if (!editable) {
    return (
      <Card className="stage-plan__inspector">
        <div className="stage-plan__inspector-head"><div><Chip label={LAYER_LABEL[element.layer]} tone="neutral" /><h3>{elementLabel(element, model)}</h3></div></div>
        <dl className="stage-plan__details">
          <dt>Модель</dt><dd>{model?.name ?? "Не привязана"}</dd>
          <dt>Единица</dt><dd>{unit?.assetTag ?? "Не привязана"}</dd>
          <dt>Координаты</dt><dd>{Math.round(element.x)}, {Math.round(element.y)} · {element.rotation}°</dd>
          {numberAttr(element, "dmxAddress") && <><dt>DMX</dt><dd>U{numberAttr(element, "dmxUniverse") ?? 1} · {numberAttr(element, "dmxAddress")}{dmxEnd ? `–${dmxEnd}` : ""}</dd></>}
          {numberAttr(element, "powerW") != null && <><dt>Потребление</dt><dd>{numberAttr(element, "powerW")} Вт · {numberAttr(element, "requiredOutlets") ?? 1} роз.</dd></>}
          {element.kind === "power" && <><dt>Точка питания</dt><dd>{numberAttr(element, "availableOutlets") ?? 0} роз. · {numberAttr(element, "maxPowerW") ?? "—"} Вт</dd></>}
          {isCable && <><dt>Соединение</dt><dd>{devices.find((item) => item.id === element.fromId)?.label || "—"} → {devices.find((item) => item.id === element.toId)?.label || "—"}</dd><dt>Кабель</dt><dd>{model?.name ?? "Не выбран"}{cable ? ` · ${cable.lengthM} м` : ""}</dd><dt>Требуемая длина</dt><dd>{numberAttr(element, "cableLengthM") ?? "—"} м</dd></>}
          {element.attrs?.note && <><dt>Примечание</dt><dd>{String(element.attrs.note)}</dd></>}
        </dl>
      </Card>
    );
  }

  const save = () => onSave({
    label: label.trim(),
    modelId: modelId || null,
    unitId: isCable || element.kind === "power" ? null : unitId || null,
    rotation: numeric(rotation, 0),
    w: optionalPositive(width),
    h: optionalPositive(height),
    fromId: isCable ? fromId || null : null,
    toId: isCable ? toId || null : null,
    attrs: draftToAttrs(attrs),
  });

  return (
    <Card className="stage-plan__inspector">
      <div className="stage-plan__inspector-head"><div><Chip label={LAYER_LABEL[element.layer]} tone="neutral" /><h3>Параметры элемента</h3></div><Button variant="danger" onClick={onDelete}>Удалить</Button></div>
      <div className="stage-plan__form-grid">
        <Field label="Подпись"><Input value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} /></Field>
        <Field label="Модель"><Select value={modelId} onChange={(event) => setModelId(event.target.value)} options={[{ value: "", label: "— без модели —" }, ...models.filter((item) => isCable ? item.trackingMode === "cable" && (item.id===modelId||isCableCompatible(element.layer,item)) : item.trackingMode !== "cable").map((item) => ({ value: item.id, label: item.name }))]} /></Field>
        {!isCable && element.kind !== "power" && <Field label="Физическая единица"><Select value={unitId} onChange={(event) => setUnitId(event.target.value)} options={[{ value: "", label: "— без единицы —" }, ...units.filter((item) => !modelId || item.modelId === modelId).map((item) => ({ value: item.id, label: item.assetTag }))]} /></Field>}
        <Field label="Поворот, °"><Input type="number" value={rotation} onChange={(event) => setRotation(event.target.value)} /></Field>
        {!isCable && <><Field label="Ширина (пусто = модель)"><Input type="number" min="1" value={width} onChange={(event) => setWidth(event.target.value)} /></Field><Field label="Высота (пусто = модель)"><Input type="number" min="1" value={height} onChange={(event) => setHeight(event.target.value)} /></Field></>}
        {isCable && <><Field label="От"><Select value={fromId} onChange={(event) => setFromId(event.target.value)} options={devices.map((item) => ({ value: item.id, label: item.label || item.id.slice(0, 6) }))} /></Field><Field label="К"><Select value={toId} onChange={(event) => setToId(event.target.value)} options={devices.map((item) => ({ value: item.id, label: item.label || item.id.slice(0, 6) }))} /></Field><NumberField label="Требуемая длина, м" value={attrs.cableLengthM ?? ""} onChange={(value) => setAttr("cableLengthM", value)} /><NumberField label="Количество кабелей" value={attrs.cableQuantity ?? "1"} onChange={(value) => setAttr("cableQuantity", value)} /></>}
        {!isCable && element.layer === "light" && <><NumberField label="DMX Universe" value={attrs.dmxUniverse ?? ""} onChange={(value) => setAttr("dmxUniverse", value)} /><NumberField label="DMX адрес" value={attrs.dmxAddress ?? ""} onChange={(value) => setAttr("dmxAddress", value)} /><NumberField label="DMX каналов" value={attrs.dmxChannels ?? ""} onChange={(value) => setAttr("dmxChannels", value)} /></>}
        {!isCable && element.kind !== "power" && <><NumberField label="Потребление, Вт" value={attrs.powerW ?? ""} onChange={(value) => setAttr("powerW", value)} /><NumberField label="Требуется розеток" value={attrs.requiredOutlets ?? "1"} onChange={(value) => setAttr("requiredOutlets", value)} /></>}
        {element.kind === "power" && <><NumberField label="Доступно розеток" value={attrs.availableOutlets ?? ""} onChange={(value) => setAttr("availableOutlets", value)} /><NumberField label="Макс. мощность, Вт" value={attrs.maxPowerW ?? ""} onChange={(value) => setAttr("maxPowerW", value)} /><NumberField label="Напряжение, В" value={attrs.voltage ?? "230"} onChange={(value) => setAttr("voltage", value)} /><Field label="Линия / автомат"><Input value={attrs.circuit ?? ""} onChange={(event) => setAttr("circuit", event.target.value)} /></Field></>}
      </div>
      <Field label="Примечание"><Textarea value={attrs.note ?? ""} maxLength={2000} onChange={(event) => setAttr("note", event.target.value)} /></Field>
      <Button block disabled={saving || (isCable && (!fromId || !toId || fromId === toId))} onClick={save}>Сохранить изменения</Button>
    </Card>
  );
}

function AddElementPanel({ plan, elements, models, units, pending, onAdd }: {
  plan: Plans.PlanDTO;
  elements: Plans.PlanElementDTO[];
  models: Equipment.EquipmentModelDTO[];
  units: Equipment.EquipmentUnitDTO[];
  pending: boolean;
  onAdd: (input: Plans.AddElementInput) => void;
}) {
  const [mode, setMode] = useState<AddMode>("device");
  const [layer, setLayer] = useState<PlanLayer>("light");
  const [label, setLabel] = useState("");
  const [modelId, setModelId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [lengthM, setLengthM] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [sourceOutlets, setSourceOutlets] = useState("6");
  const [sourcePower, setSourcePower] = useState("3500");
  const [sourceCircuit, setSourceCircuit] = useState("");
  const deviceModels = models.filter((model) => model.trackingMode !== "cable");
  const cableModels = models.filter((model) => model.trackingMode === "cable" && isCableCompatible(layer,model));
  const devices = elements.filter((element) => element.kind !== "cable");
  const chosenModel = models.find((model) => model.id === modelId);

  const addDevice = () => {
    const defaults = modelAttrs(chosenModel);
    const symbol = stageSymbol(chosenModel);
    const channels = typeof defaults.dmxChannels === "number" ? defaults.dmxChannels : Number.parseInt(String(defaults.dmxChannels ?? ""), 10);
    onAdd({
      planId: plan.id,
      layer,
      kind: "fixture",
      label: label.trim() || symbol.code,
      x: plan.stageW / 2,
      y: plan.stageH / 2,
      modelId: modelId || null,
      unitId: unitId || null,
      attrs: {
        ...(typeof defaults.powerW === "number" ? { powerW: defaults.powerW, requiredOutlets: 1 } : {}),
        ...(Number.isFinite(channels) && channels > 0 ? { dmxChannels: channels } : {}),
      },
    });
    setLabel("");
  };
  const addPower = () => {
    onAdd({ planId: plan.id, layer: "power", kind: "power", label: label.trim() || "PWR", x: plan.stageW / 2, y: plan.stageH / 2, attrs: { availableOutlets: numeric(sourceOutlets, 1), maxPowerW: numeric(sourcePower, 1), voltage: 230, circuit: sourceCircuit.trim() } });
    setLabel("");
  };
  const addCable = () => {
    const from = devices.find((element) => element.id === fromId);
    const to = devices.find((element) => element.id === toId);
    if (!from || !to || from.id === to.id) return;
    onAdd({ planId: plan.id, layer, kind: "cable", label: label.trim(), x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, fromId: from.id, toId: to.id, modelId: modelId || null, attrs: { ...(lengthM ? { cableLengthM: numeric(lengthM, 1) } : {}), cableQuantity: numeric(quantity, 1) } });
    setLabel("");
  };

  return (
    <Card className="stage-plan__add">
      <SectionHead label="Добавить на схему" />
      <div className="stage-plan__add-tabs">
        <Button variant={mode === "device" ? "primary" : "secondary"} onClick={() => { setMode("device"); setLayer("light"); setModelId(""); }}>Прибор</Button>
        <Button variant={mode === "power" ? "primary" : "secondary"} onClick={() => { setMode("power"); setLayer("power"); setModelId(""); }}>Точка питания</Button>
        <Button variant={mode === "cable" ? "primary" : "secondary"} onClick={() => { setMode("cable"); setLayer("dmx"); setModelId(""); }}>Кабель</Button>
      </div>
      <div className="stage-plan__form-grid">
        {mode !== "power" && <Field label="Слой"><Select value={layer} onChange={(event) => { setLayer(event.target.value as PlanLayer); setModelId(""); }} options={(mode === "device" ? DEVICE_LAYERS : CABLE_LAYERS).map((item) => ({ value: item, label: LAYER_LABEL[item] }))} /></Field>}
        <Field label="Подпись"><Input value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder={mode === "power" ? "Розетки SL" : "MH1, LED BAR…"} /></Field>
        {mode === "device" && <><Field label="Модель"><Select value={modelId} onChange={(event) => { setModelId(event.target.value); setUnitId(""); }} options={[{ value: "", label: "— без модели —" }, ...deviceModels.map((model) => ({ value: model.id, label: model.name }))]} /></Field><Field label="Единица проекта"><Select value={unitId} onChange={(event) => setUnitId(event.target.value)} options={[{ value: "", label: "— без единицы —" }, ...units.filter((unit) => !modelId || unit.modelId === modelId).map((unit) => ({ value: unit.id, label: unit.assetTag }))]} /></Field></>}
        {mode === "power" && <><NumberField label="Количество розеток" value={sourceOutlets} onChange={setSourceOutlets} /><NumberField label="Макс. мощность, Вт" value={sourcePower} onChange={setSourcePower} /><Field label="Линия / автомат"><Input value={sourceCircuit} onChange={(event) => setSourceCircuit(event.target.value)} /></Field></>}
        {mode === "cable" && <><Field label="От"><Select value={fromId} onChange={(event) => setFromId(event.target.value)} options={[{ value: "", label: "Выберите…" }, ...devices.map((element) => ({ value: element.id, label: element.label || element.id.slice(0, 6) }))]} /></Field><Field label="К"><Select value={toId} onChange={(event) => setToId(event.target.value)} options={[{ value: "", label: "Выберите…" }, ...devices.map((element) => ({ value: element.id, label: element.label || element.id.slice(0, 6) }))]} /></Field><Field label="Конкретный кабель / удлинитель"><Select value={modelId} onChange={(event) => setModelId(event.target.value)} options={[{ value: "", label: "— указать только линию —" }, ...cableModels.map((model) => { const attrs = cableAttrs(model); return { value: model.id, label: `${model.name}${attrs ? ` · ${attrs.lengthM} м · ${attrs.sideBQty} вых.` : ""}` }; })]} /></Field><NumberField label="Требуемая длина, м" value={lengthM} onChange={setLengthM} /><NumberField label="Количество" value={quantity} onChange={setQuantity} /></>}
      </div>
      {mode === "device" && <Button block disabled={pending} onClick={addDevice}>Поставить в центр сцены</Button>}
      {mode === "power" && <Button block disabled={pending || numeric(sourceOutlets, 0) < 1 || numeric(sourcePower, 0) < 1} onClick={addPower}>Добавить точку питания</Button>}
      {mode === "cable" && <Button block disabled={pending || !fromId || !toId || fromId === toId} onClick={addCable}>Соединить</Button>}
    </Card>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}><Input type="number" min="0" step="1" value={value} onChange={(event) => onChange(event.target.value)} /></Field>;
}

function attrsToDraft(attrs: Plans.PlanElementAttrs | null): Record<string, string> {
  const keys: (keyof Plans.PlanElementAttrs)[] = ["note", "dmxUniverse", "dmxAddress", "dmxChannels", "powerW", "requiredOutlets", "availableOutlets", "voltage", "maxPowerW", "circuit", "cableLengthM", "cableQuantity"];
  return Object.fromEntries(keys.map((key) => [key, attrs?.[key] == null ? "" : String(attrs[key])]));
}

function draftToAttrs(draft: Record<string, string>): Plans.PlanElementAttrs {
  const numericKeys = new Set(["dmxUniverse", "dmxAddress", "dmxChannels", "powerW", "requiredOutlets", "availableOutlets", "voltage", "maxPowerW", "cableLengthM", "cableQuantity"]);
  const result: Plans.PlanElementAttrs = {};
  for (const [key, raw] of Object.entries(draft)) {
    const value = raw.trim();
    if (!value) continue;
    result[key] = numericKeys.has(key) ? Number(value) : value;
  }
  return result;
}

function numeric(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalPositive(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
