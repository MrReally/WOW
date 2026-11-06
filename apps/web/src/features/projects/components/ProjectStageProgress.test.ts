import { describe, expect, it } from "vitest";
import { projectStageOrder } from "./ProjectStageProgress.tsx";

describe("projectStageOrder", () => {
  it("omits delivery, mount and dismantle for dry rentals", () => {
    expect(projectStageOrder(true)).toEqual(["prep", "pickup", "show", "return"]);
  });

  it("keeps delivery but omits installation for dry rental with delivery", () => {
    expect(projectStageOrder("dry_rental_delivery")).toEqual(["prep", "pickup", "delivery", "show", "return"]);
  });
});
