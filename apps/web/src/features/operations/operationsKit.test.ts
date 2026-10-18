import { describe, expect, it } from "vitest";
import { isKitComplete, kitCompletionStatus } from "./OperationsProjectPage.tsx";

describe("operations equipment kit", () => {
  it("automatically maps kit completion to the stage mark", () => {
    expect(kitCompletionStatus("prep")).toBe("ready");
    expect(kitCompletionStatus("dismantle")).toBe("collected");
    expect(kitCompletionStatus("pickup")).toBeNull();
  });

  it("is complete only when every required component is checked", () => {
    expect(isKitComplete(["power", "case"], ["power", "case"])).toBe(true);
    expect(isKitComplete(["power"], ["power", "case"])).toBe(false);
    expect(isKitComplete([], [])).toBe(false);
  });
});
