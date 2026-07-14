import type { Equipment } from "@sever/contracts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export function cableAttrs(model: Equipment.EquipmentModelDTO): Equipment.CableAttrs | null {
  if (model.trackingMode !== "cable" || !isRecord(model.attrs)) return null;
  const legacy = typeof model.attrs.connectors === "string" ? model.attrs.connectors : "";
  return {
    cableType: typeof model.attrs.cableType === "string" ? model.attrs.cableType : "",
    lengthM: Number(model.attrs.lengthM) || 0,
    sideAConnector: typeof model.attrs.sideAConnector === "string" ? model.attrs.sideAConnector : legacy,
    sideAQty: Math.max(1, Math.trunc(Number(model.attrs.sideAQty) || 1)),
    sideBConnector: typeof model.attrs.sideBConnector === "string" ? model.attrs.sideBConnector : legacy,
    sideBQty: Math.max(1, Math.trunc(Number(model.attrs.sideBQty) || 1)),
    sideAEnds: Array.isArray(model.attrs.sideAEnds) ? model.attrs.sideAEnds.filter((value):value is string=>typeof value==="string") : undefined,
    sideBEnds: Array.isArray(model.attrs.sideBEnds) ? model.attrs.sideBEnds.filter((value):value is string=>typeof value==="string") : undefined,
    connectors: legacy || null,
  };
}

export function formatCableModel(model: Equipment.EquipmentModelDTO, format: string[] = ["sideA", "arrow", "sideB", "length"]): string {
  const attrs = cableAttrs(model);
  if (!attrs) return model.name;
  const side = (qty: number, connector: string, ends?:string[]) => ends?.length ? ends.join(" + ") : `${qty > 1 ? `${qty}x ` : ""}${connector || "?"}`;
  const parts: Record<string, string> = {
    type: attrs.cableType,
    sideA: side(attrs.sideAQty, attrs.sideAConnector,attrs.sideAEnds),
    arrow: "->",
    sideB: side(attrs.sideBQty, attrs.sideBConnector,attrs.sideBEnds),
    length: attrs.lengthM ? `${attrs.lengthM}m` : "",
    name: model.name,
  };
  return format.map((key) => parts[key] ?? key).filter(Boolean).join(" ").replace(/\s+->\s+/g, " -> ").trim();
}
