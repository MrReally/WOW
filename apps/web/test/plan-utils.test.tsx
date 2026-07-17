import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { Equipment, Plans } from "@sever/contracts";
import { StageCanvas } from "../src/features/plans/StageCanvas.tsx";
import { calculatePower, findDmxConflicts, isCableCompatible, stageSymbol } from "../src/features/plans/planUtils.ts";

const now = "2026-07-17T00:00:00.000Z";
const model = (id: string, attrs: Record<string, unknown>, trackingMode: Equipment.TrackingMode = "serial"): Equipment.EquipmentModelDTO => ({ id, typeId: "type", trackingMode, name: id, manufacturer: null, imageUrl: null, unitCostEUR: 0, dailyPriceEUR: 0, attrs, requiredComponentModelIds: [], createdAt: now });
const element = (id: string, layer: Plans.PlanLayer, kind: Plans.PlanElementKind, attrs: Plans.PlanElementAttrs = {}, extra: Partial<Plans.PlanElementDTO> = {}): Plans.PlanElementDTO => ({ id, planId: "plan", layer, kind, label: id, x: 50, y: 50, rotation: 0, w: null, h: null, fromId: null, toId: null, modelId: null, unitId: null, attrs, createdAt: now, ...extra });

describe("stage plan calculations and abuse cases", () => {
  it("detects overlapping DMX ranges only inside the same universe", () => {
    const fixtures = [
      element("a", "light", "fixture", { dmxUniverse: 1, dmxAddress: 1, dmxChannels: 16 }),
      element("b", "light", "fixture", { dmxUniverse: 1, dmxAddress: 16, dmxChannels: 8 }),
      element("c", "light", "fixture", { dmxUniverse: 2, dmxAddress: 1, dmxChannels: 512 }),
    ];
    expect(findDmxConflicts(fixtures)).toEqual([{ firstId: "a", secondId: "b", universe: 1, from: 16, to: 16 }]);
  });

  it("calculates sockets, extension outputs, power capacity, missing lines and short cables", () => {
    const cableModel = model("extension", { cableType: "Power", lengthM: 5, sideAConnector: "Schuko plug", sideAQty: 1, sideBConnector: "Schuko socket", sideBQty: 4 }, "cable");
    const source = element("source", "power", "power", { availableOutlets: 2, maxPowerW: 3000 });
    const lamp = element("lamp", "light", "fixture", { powerW: 1200, requiredOutlets: 1 });
    const speaker = element("speaker", "sound", "fixture", { powerW: 2000, requiredOutlets: 2 });
    const line = element("line", "power", "cable", { cableLengthM: 10, cableQuantity: 1 }, { fromId: source.id, toId: lamp.id, modelId: cableModel.id });
    const summary = calculatePower([source, lamp, speaker, line], [cableModel]);
    expect(summary).toMatchObject({ totalPowerW: 3200, capacityW: 3000, requiredOutlets: 3, availableOutlets: 5, consumerCount: 2, unconnectedIds: ["speaker"], undersizedCableIds: ["line"] });
    expect(summary.sourceBreakdown).toEqual([{ sourceId: "source", totalPowerW: 1200, capacityW: 3000, requiredOutlets: 1, availableOutlets: 5, consumerIds: ["lamp"] }]);
  });

  it("offers cable models only on compatible technical layers",()=>{
    expect(isCableCompatible("power",model("power",{cableType:"Power",lengthM:10,sideAConnector:"A",sideAQty:1,sideBConnector:"B",sideBQty:1},"cable"))).toBe(true);
    expect(isCableCompatible("dmx",model("power",{cableType:"Power",lengthM:10,sideAConnector:"A",sideAQty:1,sideBConnector:"B",sideBQty:1},"cable"))).toBe(false);
  });

  it("sanitizes a broken model symbol instead of breaking SVG", () => {
    const broken = model("broken", { stageSymbol: { shape: "unknown", code: "12345678901234567890", width: -1, height: Number.NaN, color: "red" } });
    expect(stageSymbol(broken)).toEqual({ shape: "circle", code: "1234567890123456", width: 24, height: 24, color: null });
  });

  it("renders a long LED bar and keeps cable endpoints visible in a power-only layer", () => {
    const bar = model("LED BAR", { stageSymbol: { shape: "bar", code: "BAR", width: 80, height: 10, color: "#123456" } });
    const fixture = element("fixture", "light", "fixture", {}, { modelId: bar.id });
    const source = element("source", "power", "power", { availableOutlets: 1 }, { x: 150 });
    const line = element("line", "power", "cable", {}, { fromId: source.id, toId: fixture.id });
    const plan: Plans.PlanDTO = { id: "plan", projectId: "project", venueId: null, name: "Stage", version: 1, isCurrent: true, stageW: 400, stageH: 300, createdAt: now, elements: [fixture, source, line] };
    const { container } = render(<StageCanvas plan={plan} elements={plan.elements} models={[bar]} visible={new Set(["power"])} editable={false} selectedId={null} onSelect={() => {}} onDrag={() => {}} onDrop={() => {}} />);
    expect(container.querySelector('rect[width="80"][height="10"]')).toBeTruthy();
    expect(container.querySelector('g[opacity="0.45"]')).toBeTruthy();
    expect(container.querySelectorAll("line").length).toBeGreaterThanOrEqual(2);
  });
});
