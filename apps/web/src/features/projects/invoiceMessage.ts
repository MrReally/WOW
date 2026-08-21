import type { Finance } from "@sever/contracts";

export type InvoiceMessageLang = "SR" | "EN" | "RU";

const COPY: Record<InvoiceMessageLang, { offer: string; total: string }> = {
  SR: { offer: "Ponuda za", total: "Ukupno" },
  EN: { offer: "Offer for", total: "Total" },
  RU: { offer: "Предложение для", total: "Итого" },
};

const moneyEUR = (amount: number) => `${new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
}).format(amount)} €`;

const singleLine = (value: string) => value.trim().replace(/\s+/g, " ");

export function formatInvoiceMessage(
  projectName: string,
  invoice: Pick<Finance.ProjectInvoiceDTO, "rentalLines" | "invoiceEUR">,
  lang: InvoiceMessageLang,
): string {
  const labels = COPY[lang];
  const positions = invoice.rentalLines.map((line) => {
    const quantity = line.qty > 1 ? ` × ${line.qty}` : "";
    return `• ${singleLine(line.label)}${quantity} — ${moneyEUR(line.amountEUR)}`;
  });

  return [
    `${labels.offer} *${singleLine(projectName)}*`,
    "",
    ...positions,
    "",
    `${labels.total}: *${moneyEUR(invoice.invoiceEUR)}*`,
  ].join("\n");
}
