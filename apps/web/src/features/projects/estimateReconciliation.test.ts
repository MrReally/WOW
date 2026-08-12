import { describe, expect, it } from "vitest";
import type { Finance } from "@sever/contracts";
import { staleDurationEstimateIds } from "./estimateReconciliation.ts";

const saved = (comment: string): Finance.ProjectEstimateLineDTO => ({
  id: "old-line", projectId: "project", source: "equipment", sourceRefId: "old-reservation",
  section: "Эффекты", name: "Smoke Machine 1500W", qty: 1, priceEUR: 25, costEUR: 0,
  discountType: "percent", discountValue: 0, comment, hidden: false, sortOrder: 0,
  createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z",
});

describe("estimate duration reconciliation", () => {
  it("hides the stale one-day row when a current two-day row exists", () => {
    const ids = staleDurationEstimateIds([saved("1 day × 25 €/day")], [{ refId: "new", label: "Smoke Machine 1500W", detail: "2 days × 25 €/day" }], 2);
    expect([...ids]).toEqual(["old-line"]);
  });

  it("keeps a row whose duration is current", () => {
    const ids = staleDurationEstimateIds([saved("2 days × 25 €/day")], [{ refId: "new", label: "Smoke Machine 1500W", detail: "2 days × 25 €/day" }], 2);
    expect(ids.size).toBe(0);
  });
});
