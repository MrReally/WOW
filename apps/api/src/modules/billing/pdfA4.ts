import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { DEFAULT_DATE_TIME_SETTINGS, formatDateValue, type AppSettings, type Finance } from "@sever/contracts";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 33.75;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const FONT = fileURLToPath(new URL("../../../../web/public/fonts/Manrope-Variable.ttf", import.meta.url));
const BLACK = "#080808";
const SECTION = "#cbcbcb";
const STRIPE = "#f3f3f3";
const MUTED = "#777777";
const CARD = "M 0 -100 L 17 -17 L 100 0 L 17 17 L 0 100 L -17 17 L -100 0 L -17 -17 Z";
const DIAG = "M 39.6 -39.6 L 16 0 L 39.6 39.6 L 0 16 L -39.6 39.6 L -16 0 L -39.6 -39.6 L 0 -16 Z";
const HOLE = "M 0 -15 L 2.8 -2.8 L 15 0 L 2.8 2.8 L 0 15 L -2.8 2.8 L -15 0 L -2.8 -2.8 Z";

type Labels = {
  equipment: string;
  qty: string;
  price: string;
  before: string;
  discount: string;
  final: string;
  comment: string;
  beforeDiscount: string;
  finalTotal: string;
  contacts: string;
  phone: string;
  email: string;
  telegram: string;
  website: string;
  rentalPeriod: (days: number) => string;
};

const labels: Record<Finance.InvoiceLang, Labels> = {
  EN: { equipment: "EQUIPMENT / SERVICE", qty: "QTY", price: "PRICE", before: "BEFORE", discount: "DISCOUNT", final: "FINAL", comment: "COMMENT", beforeDiscount: "BEFORE DISCOUNT", finalTotal: "FINAL TOTAL", contacts: "CONTACTS", phone: "Phone", email: "Email", telegram: "Telegram", website: "Website", rentalPeriod: (days) => `RENTAL PERIOD: ${days} DAYS` },
  RU: { equipment: "ОБОРУДОВАНИЕ / УСЛУГА", qty: "КОЛ-ВО", price: "ЦЕНА", before: "ДО СКИДКИ", discount: "СКИДКА", final: "ИТОГ", comment: "КОММЕНТАРИЙ", beforeDiscount: "ДО СКИДКИ", finalTotal: "ИТОГО", contacts: "КОНТАКТЫ", phone: "Телефон", email: "Email", telegram: "Telegram", website: "Сайт", rentalPeriod: (days) => `ПЕРИОД АРЕНДЫ: ${days} ${days % 10 === 1 && days % 100 !== 11 ? "ДЕНЬ" : [2, 3, 4].includes(days % 10) && ![12, 13, 14].includes(days % 100) ? "ДНЯ" : "ДНЕЙ"}` },
  RS: { equipment: "OPREMA / USLUGA", qty: "KOL.", price: "CENA", before: "PRE POPUSTA", discount: "POPUST", final: "KONAČNO", comment: "KOMENTAR", beforeDiscount: "PRE POPUSTA", finalTotal: "UKUPNO", contacts: "KONTAKTI", phone: "Telefon", email: "Email", telegram: "Telegram", website: "Sajt", rentalPeriod: (days) => `PERIOD NAJMA: ${days} DANA` },
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const clean = (value: string) => value.trim().replace(/\s+/g, " ");
const converted = (eur: number, req: Finance.EstimatePdfRequestDTO) => req.currency === "EUR" || !req.rateToEUR ? eur : eur / req.rateToEUR;
const numeric = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(round2(value)).replace(/,/g, " ");
const money = (eur: number, req: Finance.EstimatePdfRequestDTO) => `${numeric(converted(eur, req))} ${req.currency}`;
const localeFor = (lang: Finance.InvoiceLang) => lang === "EN" ? "en-US" : lang === "RS" ? "sr-RS" : "ru-RU";
const invoiceDate = (value: string, settings: AppSettings.DateTimeSettingsDTO, lang: Finance.InvoiceLang) =>
  /^\d{2}\.\d{2}-\d{2}\.\d{2}$/.test(value) ? value : formatDateValue(value, settings, localeFor(lang));

function logoBuffer(dataUrl: string | null): Buffer | null {
  if (dataUrl) {
    const match = /^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (match) return Buffer.from(match[1]!, "base64");
  }
  return null;
}

function drawBrandMark(doc: PDFKit.PDFDocument, x: number, y: number, size: number): void {
  doc.save().translate(x + size / 2, y + size / 2).scale(size / 224);
  doc.fillColor("#ffffff").path(CARD).fill().path(DIAG).fill();
  doc.fillColor(BLACK).path(HOLE).fill();
  doc.restore();
}

function setFont(doc: PDFKit.PDFDocument, size: number): void {
  doc.font(FONT).fontSize(size);
}

function fitText(
  doc: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { size: number; color?: string; align?: "left" | "center" | "right"; padding?: number; minSize?: number; bold?: boolean },
): void {
  if (!value) return;
  const padding = options.padding ?? 8;
  const innerW = Math.max(1, width - padding * 2);
  let size = options.size;
  const minSize = options.minSize ?? 6;
  setFont(doc, size);
  while (size > minSize && doc.heightOfString(value, { width: innerW, lineGap: 0 }) > height - 4) {
    size -= 0.5;
    setFont(doc, size);
  }
  const textH = doc.heightOfString(value, { width: innerW, lineGap: 0 });
  const tx = x + padding;
  const ty = y + Math.max(0, (height - textH) / 2);
  const textOptions = {
    width: innerW,
    height,
    align: options.align ?? "left",
    lineGap: 0,
    ellipsis: true,
  } as const;
  doc.fillColor(options.color ?? BLACK).text(value, tx, ty, textOptions);
  if (options.bold) doc.fillColor(options.color ?? BLACK).text(value, tx + .24, ty, textOptions);
}

function drawHeader(doc: PDFKit.PDFDocument, req: Finance.EstimatePdfRequestDTO, settings: AppSettings.DateTimeSettingsDTO): number {
  const height = 109.5;
  doc.fillColor(BLACK).rect(0, 0, PAGE_W, height).fill();
  const title = clean(req.documentTitle) || clean(req.number) || "SEVER";
  fitText(doc, "S E V E R / T E C H N I C A L  P R O D U C T I O N", MARGIN_X, 17, 360, 12, { size: 6.6, color: "#ffffff", padding: 0, bold: true });
  fitText(doc, title.toUpperCase(), MARGIN_X, 32, 405, 34, { size: 22, color: "#ffffff", padding: 0, minSize: 12, bold: true });
  fitText(doc, invoiceDate(req.date, settings, req.lang), MARGIN_X, 72, 88, 16, { size: 9.6, color: "#ffffff", padding: 0, bold: true });
  fitText(doc, clean(req.place) || "—", MARGIN_X + 92, 72, 250, 16, { size: 9.6, color: "#ffffff", padding: 0 });
  try {
    const logo = logoBuffer(req.company.logoDataUrl);
    if (logo) doc.image(logo, PAGE_W - 135, 17, { fit: [76, 76], align: "center", valign: "center" });
    else drawBrandMark(doc, PAGE_W - 135, 17, 76);
  } catch {
    drawBrandMark(doc, PAGE_W - 135, 17, 76);
  }
  return height + 13.5;
}

type Column = { key: "name" | "qty" | "before" | "discount" | "final" | "price" | "comment"; width: number; align?: "left" | "center" | "right" };

function columns(hasDiscount: boolean): Column[] {
  return hasDiscount
    ? [
      { key: "name", width: CONTENT_W * .40 }, { key: "qty", width: CONTENT_W * .09, align: "center" },
      { key: "before", width: CONTENT_W * .13, align: "center" }, { key: "discount", width: CONTENT_W * .14, align: "center" },
      { key: "final", width: CONTENT_W * .11, align: "center" }, { key: "comment", width: CONTENT_W * .13, align: "center" },
    ]
    : [
      { key: "name", width: CONTENT_W * .44 }, { key: "qty", width: CONTENT_W * .14, align: "center" },
      { key: "price", width: CONTENT_W * .20, align: "center" }, { key: "comment", width: CONTENT_W * .22, align: "center" },
    ];
}

function headerLabel(column: Column, l: Labels): string {
  return ({ name: l.equipment, qty: l.qty, price: l.price, before: l.before, discount: l.discount, final: l.final, comment: l.comment })[column.key];
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number, cols: Column[], l: Labels): number {
  const height = 27;
  doc.fillColor(BLACK).rect(MARGIN_X, y, CONTENT_W, height).fill();
  let x = MARGIN_X;
  for (const col of cols) {
    fitText(doc, headerLabel(col, l), x, y, col.width, height, { size: 7.8, color: "#ffffff", align: col.align, padding: 7, minSize: 5.5, bold: true });
    x += col.width;
  }
  return y + height;
}

function textHeight(doc: PDFKit.PDFDocument, value: string, width: number, size: number): number {
  if (!value) return 0;
  setFont(doc, size);
  return doc.heightOfString(value, { width: Math.max(1, width - 16), lineGap: 0 });
}

function rowHeight(doc: PDFKit.PDFDocument, line: Finance.EstimatePdfLineDTO, cols: Column[], compact: boolean): number {
  const nameW = cols.find((col) => col.key === "name")!.width;
  const commentW = cols.find((col) => col.key === "comment")!.width;
  return Math.max(compact ? 25.5 : 27, Math.max(textHeight(doc, clean(line.name), nameW, 8.2), textHeight(doc, clean(line.comment), commentW, 7.2)) + 10);
}

function drawSection(doc: PDFKit.PDFDocument, value: string, y: number): number {
  const height = 18;
  doc.fillColor(SECTION).rect(MARGIN_X, y, CONTENT_W, height).fill();
  fitText(doc, clean(value) || "—", MARGIN_X, y, CONTENT_W, height, { size: 9, padding: 8, bold: true });
  return y + height;
}

function drawLine(doc: PDFKit.PDFDocument, req: Finance.EstimatePdfRequestDTO, line: Finance.EstimatePdfLineDTO, y: number, height: number, cols: Column[], rowIndex: number): number {
  if (rowIndex % 2 === 1) doc.fillColor(STRIPE).rect(MARGIN_X, y, CONTENT_W, height).fill();
  const before = Math.max(line.originalPriceEUR ?? line.priceEUR, line.priceEUR);
  const discount = Math.max(0, before - line.priceEUR);
  if (discount > .004) doc.fillColor(BLACK).rect(MARGIN_X, y, 2.2, height).fill();
  const values: Record<Column["key"], string> = {
    name: clean(line.name) || "—",
    qty: clean(line.count) || "1",
    before: numeric(converted(before, req)),
    discount: discount > .004 ? `−${numeric(converted(discount, req))}` : "—",
    final: numeric(converted(line.priceEUR, req)),
    price: numeric(converted(line.priceEUR, req)),
    comment: clean(line.comment) || "—",
  };
  let x = MARGIN_X;
  for (const col of cols) {
    const emphasized = col.key === "final" || col.key === "price" || (col.key === "discount" && discount > .004);
    fitText(doc, values[col.key], x, y, col.width, height, { size: emphasized ? 8.6 : col.key === "comment" ? 7.2 : 8.2, color: col.key === "before" ? MUTED : BLACK, align: col.align, padding: 8, minSize: 5.5, bold: emphasized });
    x += col.width;
  }
  return y + height;
}

function summaryRequiredHeight(req: Finance.EstimatePdfRequestDTO): number {
  return 53 + (req.rentalPeriodDays > 1 ? 12 : 0) + 25 + 74;
}

function drawTotalsAndContacts(doc: PDFKit.PDFDocument, req: Finance.EstimatePdfRequestDTO, y: number, hasDiscount: boolean, l: Labels): void {
  const beforeEUR = round2(req.lines.reduce((sum, line) => sum + Math.max(line.originalPriceEUR ?? line.priceEUR, line.priceEUR), 0));
  const finalEUR = round2(Math.max(0, req.lines.reduce((sum, line) => sum + line.priceEUR, 0) - req.totalDiscountEUR));
  const discountEUR = round2(Math.max(0, beforeEUR - finalEUR));
  const totalH = 53;
  const periodH = req.rentalPeriodDays > 1 ? 12 : 0;
  const required = summaryRequiredHeight(req);
  if (y + required > PAGE_H - 18) {
    doc.addPage({ size: "A4", margin: 0 });
    y = 35;
  } else {
    y = Math.max(y + 18, PAGE_H - required - 18);
  }

  if (hasDiscount) {
    const widths = [CONTENT_W * .30, CONTENT_W * .30, CONTENT_W * .40];
    const blocks = [
      [l.beforeDiscount, money(beforeEUR, req)],
      [l.discount, `−${money(discountEUR, req)}`],
      [l.finalTotal, money(finalEUR, req)],
    ];
    let x = MARGIN_X;
    blocks.forEach(([label, value], index) => {
      doc.fillColor(index === 2 ? BLACK : STRIPE).rect(x, y, widths[index]!, totalH).fill();
      fitText(doc, label!, x, y + 8, widths[index]!, 12, { size: 6.5, color: index === 2 ? "#ffffff" : BLACK, padding: 12, bold: true });
      fitText(doc, value!, x, y + 22, widths[index]!, 24, { size: 16, color: index === 2 ? "#ffffff" : BLACK, padding: 12, bold: true });
      x += widths[index]!;
    });
  } else {
    doc.fillColor(BLACK).rect(MARGIN_X, y, CONTENT_W, totalH).fill();
    fitText(doc, l.finalTotal, MARGIN_X, y, CONTENT_W * .55, totalH, { size: 16, color: "#ffffff", padding: 14, bold: true });
    fitText(doc, money(finalEUR, req), MARGIN_X + CONTENT_W * .55, y, CONTENT_W * .45, totalH, { size: 17, color: "#ffffff", align: "right", padding: 14, bold: true });
  }
  y += totalH;
  if (periodH) {
    fitText(doc, l.rentalPeriod(req.rentalPeriodDays), MARGIN_X + CONTENT_W * .58, y, CONTENT_W * .42, periodH, { size: 6.5, color: "#888888", align: "right", padding: 0 });
    y += periodH;
  }

  y += 21;
  fitText(doc, l.contacts, MARGIN_X, y, CONTENT_W, 14, { size: 9.5, padding: 2, bold: true });
  y += 17;
  doc.strokeColor("#d2d2d2").lineWidth(.7).moveTo(MARGIN_X, y).lineTo(MARGIN_X + CONTENT_W, y).stroke();
  y += 7;
  const labelW = 82;
  const valueW = CONTENT_W / 2 - labelW;
  const half = CONTENT_W / 2;
  const rows: [[string, string], [string, string]][] = [
    [[l.phone, req.company.phone], [l.telegram, req.company.telegram]],
    [[l.email, req.company.email], [l.website, req.company.website]],
  ];
  rows.forEach((row) => {
    row.forEach(([label, value], column) => {
      const x = MARGIN_X + column * half;
      fitText(doc, label, x, y, labelW, 14, { size: 6.8, padding: 2, bold: true });
      fitText(doc, clean(value), x + labelW, y, valueW, 14, { size: 6.8, padding: 2 });
    });
    y += 16;
  });
}

export async function renderSeverA4Pdf(req: Finance.EstimatePdfRequestDTO, settings: AppSettings.DateTimeSettingsDTO = DEFAULT_DATE_TIME_SETTINGS): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true, compress: true, info: { Title: clean(req.documentTitle) || req.number, Author: req.company.name || "SEVER" } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      const l = labels[req.lang];
      const beforeEUR = round2(req.lines.reduce((sum, line) => sum + Math.max(line.originalPriceEUR ?? line.priceEUR, line.priceEUR), 0));
      const finalEUR = round2(Math.max(0, req.lines.reduce((sum, line) => sum + line.priceEUR, 0) - req.totalDiscountEUR));
      const hasDiscount = beforeEUR - finalEUR > .004;
      const cols = columns(hasDiscount);
      let y = drawHeader(doc, req, settings);
      y = drawTableHeader(doc, y, cols, l);
      let rowIndex = 0;
      const grouped = new Map<string, Finance.EstimatePdfLineDTO[]>();
      for (const line of req.lines) {
        const section = clean(line.section) || "—";
        if (!grouped.has(section)) grouped.set(section, []);
        grouped.get(section)!.push(line);
      }
      const newTablePage = () => {
        doc.addPage({ size: "A4", margin: 0 });
        y = drawTableHeader(doc, 28, cols, l);
      };
      const groups = [...grouped.entries()];
      for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
        const [section, items] = groups[groupIndex]!;
        const firstH = items[0] ? rowHeight(doc, items[0], cols, hasDiscount) : 0;
        const isLastGroup = groupIndex === groups.length - 1;
        if (y + 18 + firstH + (isLastGroup && items.length === 1 ? summaryRequiredHeight(req) : 0) > PAGE_H - 28) newTablePage();
        y = drawSection(doc, section, y);
        for (let lineIndex = 0; lineIndex < items.length; lineIndex += 1) {
          const line = items[lineIndex]!;
          const height = rowHeight(doc, line, cols, hasDiscount);
          const isLastLine = isLastGroup && lineIndex === items.length - 1;
          if (y + height + (isLastLine ? summaryRequiredHeight(req) : 0) > PAGE_H - 28) newTablePage();
          y = drawLine(doc, req, line, y, height, cols, rowIndex++);
        }
      }
      drawTotalsAndContacts(doc, req, y, hasDiscount, l);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
