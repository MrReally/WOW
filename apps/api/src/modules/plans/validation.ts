import type { Plans } from "@sever/contracts";
import { BadRequest } from "../../core/errors.js";

export function validatePlanGeometry(plan: { stage_w: number; stage_h: number }, input: { x: number; y: number; w?: number | null; h?: number | null }): void {
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y) || input.x < 0 || input.y < 0 || input.x > plan.stage_w || input.y > plan.stage_h) throw BadRequest("элемент должен находиться в пределах сцены");
  if (input.w != null && (!Number.isFinite(input.w) || input.w <= 0 || input.w > plan.stage_w)) throw BadRequest("некорректная ширина элемента");
  if (input.h != null && (!Number.isFinite(input.h) || input.h <= 0 || input.h > plan.stage_h)) throw BadRequest("некорректная высота элемента");
}

export function validatePlanAttrs(attrs: Plans.PlanElementAttrs | null | undefined): void {
  if (!attrs) return;
  if (attrs.dmxAddress != null && attrs.dmxChannels != null && attrs.dmxAddress + attrs.dmxChannels - 1 > 512) throw BadRequest("диапазон DMX выходит за адрес 512");
  const nonNegative: (keyof Plans.PlanElementAttrs)[] = ["powerW"];
  const positive: (keyof Plans.PlanElementAttrs)[] = ["dmxUniverse", "dmxAddress", "dmxChannels", "requiredOutlets", "availableOutlets", "voltage", "maxPowerW", "cableLengthM", "cableQuantity"];
  for (const key of nonNegative) if (attrs[key] != null && (typeof attrs[key] !== "number" || attrs[key] < 0 || !Number.isFinite(attrs[key]))) throw BadRequest(`некорректное значение ${key}`);
  for (const key of positive) if (attrs[key] != null && (typeof attrs[key] !== "number" || attrs[key] <= 0 || !Number.isFinite(attrs[key]))) throw BadRequest(`некорректное значение ${key}`);
}

export function validateCableShape(layer: Plans.PlanLayer, kind: Plans.PlanElementKind, fromId: string | null, toId: string | null): void {
  if (kind !== "cable") {
    if (fromId || toId) throw BadRequest("только кабель может иметь точки подключения");
    return;
  }
  if (!(["dmx", "power", "audio"] as Plans.PlanLayer[]).includes(layer)) throw BadRequest("кабель можно разместить только на слое DMX, питания или аудио");
  if (!fromId || !toId) throw BadRequest("укажите обе точки подключения кабеля");
  if (fromId === toId) throw BadRequest("кабель не может соединять элемент с самим собой");
}
