import { describe, expect, it } from "vitest";
import { amountAfterDiscountEUR, discountAmountEUR } from "@sever/contracts";

describe("estimate discounts", () => {
  it("applies a percentage discount", () => {
    expect(discountAmountEUR(250, "percent", 10, 0.0085)).toBe(25);
    expect(amountAfterDiscountEUR(250, "percent", 10, 0.0085)).toBe(225);
  });

  it("converts a fixed dinar discount to euros", () => {
    expect(discountAmountEUR(250, "fixed_rsd", 1_000, 0.0085)).toBe(8.5);
    expect(amountAfterDiscountEUR(250, "fixed_rsd", 1_000, 0.0085)).toBe(241.5);
  });

  it("never discounts below zero", () => {
    expect(amountAfterDiscountEUR(25, "percent", 150, 0.0085)).toBe(0);
    expect(amountAfterDiscountEUR(25, "fixed_rsd", 10_000, 0.0085)).toBe(0);
  });
});
