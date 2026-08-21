import { describe, expect, it } from "vitest";
import { formatInvoiceMessage } from "./invoiceMessage.ts";

const invoice = {
  rentalLines: [
    { refId: "1", section: "Camera", label: "Sony FX3", detail: "2 × 1 day", qty: 2, unitEUR: 100, periods: 1, amountEUR: 200, costEUR: 0 },
    { refId: "2", section: "Light", label: "Aputure 600D", detail: "1 × 1 day", qty: 1, unitEUR: 75.5, periods: 1, amountEUR: 75.5, costEUR: 0 },
  ],
  invoiceEUR: 250.5,
};

describe("invoice message", () => {
  it("formats a Serbian offer for sharing", () => {
    expect(formatInvoiceMessage("Music Video", invoice, "SR")).toBe([
      "Ponuda za *Music Video*",
      "",
      "• Sony FX3 × 2 — 200 €",
      "• Aputure 600D — 75.5 €",
      "",
      "Ukupno: *250.5 €*",
    ].join("\n"));
  });

  it.each([
    ["EN", "Offer for *Music Video*", "Total: *250.5 €*"],
    ["RU", "Предложение для *Music Video*", "Итого: *250.5 €*"],
  ] as const)("translates the %s message chrome", (lang, heading, total) => {
    const message = formatInvoiceMessage("Music Video", invoice, lang);
    expect(message).toContain(heading);
    expect(message).toContain(total);
  });
});
