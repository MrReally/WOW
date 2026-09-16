import { describe, expect, it } from "vitest";
import { peakBookedQuantity } from "../src/modules/projects/reservationAvailability.js";

const at = (hour: number) => new Date(Date.UTC(2026, 8, 18, hour));
const booking = (start: number, end: number, qty: number) => ({ starts_at: at(start), ends_at: at(end), qty });

describe("peak reservation demand", () => {
  it("does not add bookings in separate parts of the same project window", () => {
    expect(peakBookedQuantity([booking(0, 24, 1), booking(0, 12, 8), booking(12, 24, 8)])).toBe(9);
  });

  it("counts simultaneous bookings and releases units at the end boundary", () => {
    expect(peakBookedQuantity([booking(0, 12, 6), booking(6, 18, 4), booking(18, 24, 5)])).toBe(10);
    expect(peakBookedQuantity([])).toBe(0);
  });
});
