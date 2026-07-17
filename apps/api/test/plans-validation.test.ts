import { describe, expect, it } from "vitest";
import { validateCableShape, validatePlanAttrs, validatePlanGeometry } from "../src/modules/plans/validation.js";

describe("plan input hardening without a database", () => {
  it("accepts edges and rejects non-finite, negative and outside coordinates", () => {
    const plan = { stage_w: 400, stage_h: 300 };
    expect(() => validatePlanGeometry(plan, { x: 0, y: 300, w: 400, h: 1 })).not.toThrow();
    for (const point of [{ x: -1, y: 0 }, { x: 401, y: 0 }, { x: 0, y: 301 }, { x: Number.NaN, y: 0 }, { x: 0, y: Number.POSITIVE_INFINITY }]) {
      expect(() => validatePlanGeometry(plan, point)).toThrow(/пределах сцены/);
    }
    expect(() => validatePlanGeometry(plan, { x: 1, y: 1, w: 0 })).toThrow(/ширина/);
    expect(() => validatePlanGeometry(plan, { x: 1, y: 1, h: 301 })).toThrow(/высота/);
  });

  it("rejects malformed cable topology before touching SQL", () => {
    expect(() => validateCableShape("power", "cable", "a", "b")).not.toThrow();
    expect(() => validateCableShape("light", "cable", "a", "b")).toThrow(/слое DMX/);
    expect(() => validateCableShape("dmx", "cable", null, "b")).toThrow(/обе точки/);
    expect(() => validateCableShape("audio", "cable", "a", "a")).toThrow(/самим собой/);
    expect(() => validateCableShape("light", "fixture", "a", null)).toThrow(/только кабель/);
  });

  it("rejects DMX overflow and invalid manual power/cable values", () => {
    expect(() => validatePlanAttrs({ dmxAddress: 500, dmxChannels: 13 })).not.toThrow();
    expect(() => validatePlanAttrs({ dmxAddress: 500, dmxChannels: 14 })).toThrow(/512/);
    expect(() => validatePlanAttrs({ powerW: -1 })).toThrow(/powerW/);
    expect(() => validatePlanAttrs({ availableOutlets: 0 })).toThrow(/availableOutlets/);
    expect(() => validatePlanAttrs({ cableLengthM: Number.NaN })).toThrow(/cableLengthM/);
  });
});
