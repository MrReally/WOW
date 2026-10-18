import { describe, expect, it } from "vitest";
import { projectStageOrder } from "./ProjectStageProgress.tsx";

describe("projectStageOrder", () => {
  it("omits mount and dismantle for dry rentals", () => {
    expect(projectStageOrder(true)).toEqual(["prep", "pickup", "delivery", "show", "return"]);
  });
});
