import { describe, expect, it } from "vitest";
import { renderEstimatePdf } from "../src/modules/billing/pdf.js";

describe("estimate PDF", () => {
  it("renders a Unicode invoice as a real PDF", async () => {
    const pdf = await renderEstimatePdf({
      number: "EST-TEST",
      documentTitle: "Unicode понуда",
      date: "2026-08-01",
      place: "Klub Gore",
      clientName: "Клиент",
      company: { name: "SEVER", requisites: "", phone: "+381 00", email: "mail@example.com", telegram: "@sever", website: "https://severbeo.rs", logoDataUrl: null },
      lang: "RS",
      currency: "EUR",
      rateToEUR: 1,
      totalDiscountEUR: 5,
      rentalPeriodDays: 5,
      templateId: "sever_a4",
      templateVersion: 1,
      note: "",
      lines: [
        { id: "1", section: "Звуковое оборудование", name: "Монтаж+демонтаж", count: "1", priceEUR: 40, originalPriceEUR: 50, costEUR: 0, comment: "1 day × 40 €/day" },
      ],
    });

    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(8_000);
    expect(pdf.toString("latin1")).toContain("/MediaBox [0 0 595.28 841.89]");
  });

  it("paginates long A4 proposals without dropping totals", async () => {
    const lines = Array.from({ length: 80 }, (_, index) => ({
      id: String(index), section: `Section ${Math.floor(index / 8) + 1}`, name: `Equipment ${index + 1} with a deliberately long descriptive name`, count: "2", priceEUR: 40, originalPriceEUR: index % 3 === 0 ? 50 : 40, costEUR: 0, comment: "Main stage",
    }));
    const pdf = await renderEstimatePdf({
      number: "EST-LONG", documentTitle: "Long multi-page proposal", date: "2026-11-11", place: "Belgrade", clientName: "Client",
      company: { name: "SEVER", requisites: "", phone: "+381 62 850 8797", email: "sever.beo.contact@gmail.com", telegram: "@sever_contact", website: "https://severbeo.rs", logoDataUrl: null },
      lang: "EN", currency: "EUR", rateToEUR: 1, note: "Not printed", lines, totalDiscountEUR: 25, rentalPeriodDays: 3, templateId: "sever_a4", templateVersion: 1,
    });
    expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(2);
  });

  it("keeps legacy document versions on the previous Letter renderer", async () => {
    const pdf = await renderEstimatePdf({
      number: "LEGACY", documentTitle: "Ignored by legacy", date: "2026-11-11", place: "Belgrade", clientName: "Client",
      company: { name: "SEVER", requisites: "", phone: "+381 62 850 8797", email: "mail@example.com", telegram: "@sever", website: "https://severbeo.rs", logoDataUrl: null },
      lang: "EN", currency: "EUR", rateToEUR: 1, note: "", lines: [{ id: "1", section: "Equipment", name: "Speaker", count: "1", priceEUR: 50, costEUR: 0, comment: "" }], totalDiscountEUR: 0, rentalPeriodDays: 1, templateId: "legacy", templateVersion: 1,
    });
    expect(pdf.toString("latin1")).toContain("/MediaBox [0 0 612 792]");
  });
});
