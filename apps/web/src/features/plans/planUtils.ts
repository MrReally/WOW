import type { Equipment, Plans } from "@sever/contracts";

export const LAYER_LABEL: Record<Plans.PlanLayer, string> = {
  light: "Свет",
  sound: "Звук",
  dmx: "DMX",
  power: "Питание",
  audio: "Аудио",
};

export const LAYER_COLOR: Record<Plans.PlanLayer, string> = {
  light: "var(--accent)",
  sound: "var(--ok)",
  dmx: "var(--info)",
  power: "var(--alert)",
  audio: "var(--warn)",
};

export const DEFAULT_SYMBOL: Equipment.StageSymbol = {
  shape: "circle",
  code: "",
  width: 24,
  height: 24,
  color: null,
};

export function modelAttrs(model: Equipment.EquipmentModelDTO | undefined): Equipment.ModelAttrs {
  return (model?.attrs ?? {}) as Equipment.ModelAttrs;
}

export function stageSymbol(model: Equipment.EquipmentModelDTO | undefined): Equipment.StageSymbol {
  const value = modelAttrs(model).stageSymbol;
  if (!value) return DEFAULT_SYMBOL;
  const shapes: Equipment.StageSymbol["shape"][] = ["circle", "square", "rectangle", "bar", "diamond"];
  return {
    shape: shapes.includes(value.shape) ? value.shape : "circle",
    code: typeof value.code === "string" ? value.code.slice(0, 16) : "",
    width: finitePositive(value.width, 24),
    height: finitePositive(value.height, 24),
    color: typeof value.color === "string" && /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : null,
  };
}

export function cableAttrs(model: Equipment.EquipmentModelDTO | undefined): Equipment.CableAttrs | null {
  if (!model || model.trackingMode !== "cable" || !model.attrs) return null;
  const attrs = model.attrs as Partial<Equipment.CableAttrs>;
  return typeof attrs.cableType === "string" && typeof attrs.lengthM === "number" ? attrs as Equipment.CableAttrs : null;
}

export function elementLabel(element: Plans.PlanElementDTO, model: Equipment.EquipmentModelDTO | undefined): string {
  return element.label.trim() || stageSymbol(model).code || model?.name || "Без названия";
}

export interface DmxConflict {
  firstId: string;
  secondId: string;
  universe: number;
  from: number;
  to: number;
}

export function findDmxConflicts(elements: Plans.PlanElementDTO[]): DmxConflict[] {
  const ranges = elements.flatMap((element) => {
    const universe = numberAttr(element, "dmxUniverse");
    const address = numberAttr(element, "dmxAddress");
    const channels = numberAttr(element, "dmxChannels") ?? 1;
    if (!universe || !address || channels < 1) return [];
    return [{ id: element.id, universe, from: address, to: Math.min(512, address + channels - 1) }];
  });
  const conflicts: DmxConflict[] = [];
  for (let index = 0; index < ranges.length; index += 1) {
    for (let other = index + 1; other < ranges.length; other += 1) {
      const a = ranges[index]!;
      const b = ranges[other]!;
      if (a.universe === b.universe && a.from <= b.to && b.from <= a.to) {
        conflicts.push({ firstId: a.id, secondId: b.id, universe: a.universe, from: Math.max(a.from, b.from), to: Math.min(a.to, b.to) });
      }
    }
  }
  return conflicts;
}

export interface PowerSummary {
  totalPowerW: number;
  capacityW: number;
  requiredOutlets: number;
  availableOutlets: number;
  consumerCount: number;
  unconnectedIds: string[];
  undersizedCableIds: string[];
  sourceBreakdown: Array<{ sourceId: string; totalPowerW: number; capacityW: number; requiredOutlets: number; availableOutlets: number; consumerIds: string[] }>;
}

export function calculatePower(
  elements: Plans.PlanElementDTO[],
  models: Equipment.EquipmentModelDTO[],
): PowerSummary {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const modelById = new Map(models.map((model) => [model.id, model]));
  const sources = elements.filter((element) => element.kind === "power");
  const consumers = elements.filter((element) => element.kind !== "cable" && element.kind !== "power" && ((numberAttr(element, "powerW") ?? 0) > 0 || (numberAttr(element, "requiredOutlets") ?? 0) > 0));
  const powerCables = elements.filter((element) => element.kind === "cable" && element.layer === "power");
  const graph = new Map<string, string[]>();
  for (const cable of powerCables) {
    if (!cable.fromId || !cable.toId || !byId.has(cable.fromId) || !byId.has(cable.toId)) continue;
    graph.set(cable.fromId, [...(graph.get(cable.fromId) ?? []), cable.toId]);
    graph.set(cable.toId, [...(graph.get(cable.toId) ?? []), cable.fromId]);
  }
  const connected = new Set<string>(sources.map((source) => source.id));
  const queue = [...connected];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const neighbor of graph.get(id) ?? []) if (!connected.has(neighbor)) { connected.add(neighbor); queue.push(neighbor); }
  }
  let extensionOutlets = 0;
  const undersizedCableIds: string[] = [];
  for (const cable of powerCables) {
    const attrs = cableAttrs(cable.modelId ? modelById.get(cable.modelId) : undefined);
    const quantity = numberAttr(cable, "cableQuantity") ?? 1;
    if (attrs && cable.fromId && cable.toId && connected.has(cable.fromId) && connected.has(cable.toId)) extensionOutlets += Math.max(0, (attrs.sideBQty || 1) - 1) * quantity;
    const neededLength = numberAttr(cable, "cableLengthM");
    if (attrs && neededLength && attrs.lengthM < neededLength) undersizedCableIds.push(cable.id);
  }
  const sourceBreakdown = sources.map((source) => {
    const reachable = new Set<string>([source.id]);
    const pending = [source.id];
    while (pending.length > 0) {
      const id = pending.shift()!;
      for (const neighbor of graph.get(id) ?? []) if (!reachable.has(neighbor)) { reachable.add(neighbor); pending.push(neighbor); }
    }
    const localConsumers = consumers.filter((consumer) => reachable.has(consumer.id));
    const localExtensions = powerCables.reduce((sum, cable) => {
      if (!cable.fromId || !cable.toId || !reachable.has(cable.fromId) || !reachable.has(cable.toId)) return sum;
      const attrs = cableAttrs(cable.modelId ? modelById.get(cable.modelId) : undefined);
      return sum + (attrs ? Math.max(0, (attrs.sideBQty || 1) - 1) * (numberAttr(cable, "cableQuantity") ?? 1) : 0);
    }, 0);
    return {
      sourceId: source.id,
      totalPowerW: localConsumers.reduce((sum, consumer) => sum + (numberAttr(consumer, "powerW") ?? 0), 0),
      capacityW: numberAttr(source, "maxPowerW") ?? 0,
      requiredOutlets: localConsumers.reduce((sum, consumer) => sum + (numberAttr(consumer, "requiredOutlets") ?? 1), 0),
      availableOutlets: (numberAttr(source, "availableOutlets") ?? 0) + localExtensions,
      consumerIds: localConsumers.map((consumer) => consumer.id),
    };
  });
  return {
    totalPowerW: consumers.reduce((sum, element) => sum + (numberAttr(element, "powerW") ?? 0), 0),
    capacityW: sources.reduce((sum, element) => sum + (numberAttr(element, "maxPowerW") ?? 0), 0),
    requiredOutlets: consumers.reduce((sum, element) => sum + (numberAttr(element, "requiredOutlets") ?? 1), 0),
    availableOutlets: sources.reduce((sum, element) => sum + (numberAttr(element, "availableOutlets") ?? 0), 0) + extensionOutlets,
    consumerCount: consumers.length,
    unconnectedIds: consumers.filter((element) => !connected.has(element.id)).map((element) => element.id),
    undersizedCableIds,
    sourceBreakdown,
  };
}

export function isCableCompatible(layer: Plans.PlanLayer, model: Equipment.EquipmentModelDTO): boolean {
  const attrs = cableAttrs(model);
  if (!attrs) return false;
  const type = attrs.cableType.trim().toLowerCase();
  if (layer === "dmx") return type.includes("dmx");
  if (layer === "power") return type.includes("power") || type.includes("сил") || type.includes("schuko") || type.includes("cee");
  if (layer === "audio") return type.includes("audio") || type.includes("аудио") || type.includes("xlr") || type.includes("jack");
  return false;
}

export function numberAttr(element: Plans.PlanElementDTO, key: keyof Plans.PlanElementAttrs): number | null {
  const value = element.attrs?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finitePositive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
