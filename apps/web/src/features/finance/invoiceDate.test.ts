import { describe, expect, it } from "vitest";
import { isInvoiceDateRange, projectInvoiceDate } from "./invoiceDate.ts";

describe("project invoice date", () => {
  it("uses the event start date for a one-day rental", () => {
    expect(projectInvoiceDate("2026-10-04T10:00:00.000Z", "2026-10-04T18:00:00.000Z")).toBe("2026-10-04");
  });

  it("uses a DD.MM-DD.MM period for rentals billed for two or more days", () => {
    expect(projectInvoiceDate("2026-10-04T10:00:00.000Z", "2026-10-06T18:00:00.000Z")).toBe("04.10-06.10");
  });

  it("formats dates in the application's time zone", () => {
    expect(projectInvoiceDate("2026-10-03T22:30:00.000Z", "2026-10-04T08:00:00.000Z")).toBe("2026-10-04");
  });

  it("recognizes only generated rental ranges", () => {
    expect(isInvoiceDateRange("04.10-06.10")).toBe(true);
    expect(isInvoiceDateRange("2026-10-04")).toBe(false);
  });
});
