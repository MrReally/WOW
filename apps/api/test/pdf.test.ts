import { describe, expect, it } from "vitest";
import { renderEstimatePdf } from "../src/modules/billing/pdf.js";

describe("estimate PDF", () => {
  it("renders a Unicode invoice as a real PDF", async () => {
    const pdf = await renderEstimatePdf({
      number: "EST-TEST",
      date: "2026-08-01",
      place: "Klub Gore",
      clientName: "Клиент",
      company: { name: "SEVER", requisites: "", phone: "+381 00", email: "mail@example.com", telegram: "@sever" },
      lang: "RS",
      currency: "EUR",
      rateToEUR: 1,
      totalDiscountEUR: 0,
      note: "",
      lines: [
        { id: "1", section: "Звуковое оборудование", name: "Монтаж+демонтаж", count: "1", priceEUR: 40, costEUR: 0, comment: "1 day × 40 €/day" },
      ],
    });

    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
  });
});
