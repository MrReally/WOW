import { createRequire } from "node:module";
import PDFDocument from "pdfkit";
import { DEFAULT_DATE_TIME_SETTINGS, formatDateValue, type AppSettings, type Finance } from "@sever/contracts";

// The preview is 816 x 1056 CSS pixels: US Letter at the browser's 96 dpi.
// Rendering at 72 dpi keeps the PDF geometry identical to the preview.
const SCALE = 72 / 96;
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 78 * SCALE;
const MARGIN_TOP = 92 * SCALE;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const require = createRequire(import.meta.url);
const FONTS = {
  latin: {
    regular: require.resolve("@fontsource/roboto-condensed/files/roboto-condensed-latin-400-normal.woff"),
    bold: require.resolve("@fontsource/roboto-condensed/files/roboto-condensed-latin-700-normal.woff"),
  },
  latinExt: {
    regular: require.resolve("@fontsource/roboto-condensed/files/roboto-condensed-latin-ext-400-normal.woff"),
    bold: require.resolve("@fontsource/roboto-condensed/files/roboto-condensed-latin-ext-700-normal.woff"),
  },
  cyrillic: {
    regular: require.resolve("@fontsource/roboto-condensed/files/roboto-condensed-cyrillic-400-normal.woff"),
    bold: require.resolve("@fontsource/roboto-condensed/files/roboto-condensed-cyrillic-700-normal.woff"),
  },
};

const CARD = "M 0 -100 L 17 -17 L 100 0 L 17 17 L 0 100 L -17 17 L -100 0 L -17 -17 Z";
const DIAG = "M 39.6 -39.6 L 16 0 L 39.6 39.6 L 0 16 L -39.6 39.6 L -16 0 L -39.6 -39.6 L 0 -16 Z";
const HOLE = "M 0 -15 L 2.8 -2.8 L 15 0 L 2.8 2.8 L 0 15 L -2.8 2.8 L -15 0 L -2.8 -2.8 Z";

const labels: Record<Finance.InvoiceLang, { title: string; date: string; place: string; name: string; count: string; price: string; comment: string; discount: string; total: string; contacts: string; phone: string; email: string; telegram: string }> = {
  EN: { title: "Purchase Order", date: "Date", place: "Place", name: "Name", count: "Count", price: "Price", comment: "Comment", discount: "DISCOUNT:", total: "TOTAL:", contacts: "Contacts", phone: "Phone", email: "Email", telegram: "Telegram" },
  RU: { title: "Смета", date: "Дата", place: "Место", name: "Название", count: "Кол-во", price: "Цена", comment: "Комментарий", discount: "СКИДКА:", total: "ИТОГО:", contacts: "Контакты", phone: "Телефон", email: "Email", telegram: "Telegram" },
  RS: { title: "Ponuda", date: "Datum", place: "Mesto", name: "Naziv", count: "Količina", price: "Cena", comment: "Komentar", discount: "POPUST:", total: "UKUPNO:", contacts: "Kontakti", phone: "Telefon", email: "Email", telegram: "Telegram" },
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const currencyAmount = (eur: number, req: Finance.EstimatePdfRequestDTO) =>
  req.currency === "EUR" || !req.rateToEUR ? eur : eur / req.rateToEUR;
const money = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(round2(n));

type Align = "left" | "center" | "right";

type FontFamily = keyof typeof FONTS;

function familyFor(value: string): FontFamily {
  if (/[\u0400-\u04ff]/.test(value)) return "cyrillic";
  if (/[\u0100-\u024f]/.test(value)) return "latinExt";
  return "latin";
}

function setFont(doc: PDFKit.PDFDocument, value: string, size: number, bold = false): void {
  const family = FONTS[familyFor(value)];
  doc.font(bold ? family.bold : family.regular).fontSize(size);
}

function textHeight(doc: PDFKit.PDFDocument, value: string, width: number, size: number): number {
  if (!value) return 0;
  setFont(doc, value, size);
  return doc.heightOfString(value, { width, lineGap: 0 });
}

function textRuns(value: string): { value: string; family: FontFamily }[] {
  const result: { value: string; family: FontFamily }[] = [];
  for (const char of value) {
    const family = familyFor(char);
    const last = result[result.length - 1];
    if (last?.family === family) last.value += char;
    else result.push({ value: char, family });
  }
  return result;
}

function drawText(
  doc: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { size: number; bold?: boolean; align?: Align; color?: string; padding?: number },
): void {
  const padding = options.padding ?? 6;
  const innerW = Math.max(1, width - padding * 2);
  if (!value) return;
  const text = value;
  setFont(doc, text, options.size, options.bold);
  const h = doc.heightOfString(text, { width: innerW, lineGap: 0 });
  const tx = x + padding;
  const ty = y + Math.max(0, (height - h) / 2);
  const config = { width: innerW, height: Math.max(h, height), align: options.align ?? "center", lineGap: 0, ellipsis: true } as const;

  const runs = textRuns(text);
  if (runs.length > 1 && !text.includes("\n")) {
    const widths = runs.map((run) => {
      const family = FONTS[run.family];
      doc.font(options.bold ? family.bold : family.regular).fontSize(options.size);
      return doc.widthOfString(run.value);
    });
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    if (totalWidth <= innerW) {
      const align = options.align ?? "center";
      let cursor = align === "left" ? tx : align === "right" ? tx + innerW - totalWidth : tx + (innerW - totalWidth) / 2;
      doc.fillColor(options.color ?? "#111111");
      runs.forEach((run, index) => {
        const family = FONTS[run.family];
        doc.font(options.bold ? family.bold : family.regular).fontSize(options.size).text(run.value, cursor, ty, { lineBreak: false });
        cursor += widths[index]!;
      });
      return;
    }
  }
  doc.fillColor(options.color ?? "#111111").text(text, tx, ty, config);
}

function cell(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { fill?: string; border?: string; borderWidth?: number } = {},
): void {
  if (options.fill) doc.save().fillColor(options.fill).rect(x, y, width, height).fill().restore();
  doc.save().lineWidth(options.borderWidth ?? 0.75).strokeColor(options.border ?? "#000000").rect(x, y, width, height).stroke().restore();
}

function sectionColor(section: string): string {
  // Keep this mapping in lockstep with sectionTone() / invoice.css in Preview.
  const key = section.toLowerCase();
  if (key.includes("sound")) return "#dcebd6";
  if (key.includes("light")) return "#fff2cc";
  if (key.includes("other")) return "#fce5cd";
  if (key.includes("staff") || key.includes("crew")) return "#f4cccc";
  if (key.includes("delivery") || key.includes("transport")) return "#d9e9ec";
  return "#eeeeee";
}

function drawStar(doc: PDFKit.PDFDocument, x: number, y: number, size: number): void {
  doc.save().translate(x + size / 2, y + size / 2).scale(size / 224);
  doc.fillColor("#000000").path(CARD).fill().path(DIAG).fill();
  doc.fillColor("#ffffff").path(HOLE).fill();
  doc.restore();
}

function drawHeader(doc: PDFKit.PDFDocument, req: Finance.EstimatePdfRequestDTO, dateTimeSettings: AppSettings.DateTimeSettingsDTO): number {
  const l = labels[req.lang];
  const leftW = 355 * SCALE;
  const rightW = CONTENT_W - leftW;
  const titleH = 98 * SCALE;
  const dateH = 92 * SCALE;
  const placeH = 132 * SCALE;
  const headH = titleH + dateH + placeH;
  const valueW = 118 * SCALE;
  const labelW = leftW - valueW;
  const x = MARGIN_X;
  const y = MARGIN_TOP;

  cell(doc, x, y, leftW, titleH, { fill: "#000000", borderWidth: 1.5 });
  drawText(doc, l.title, x, y, leftW, titleH, { size: 22.5, bold: true, color: "#ffffff" });

  cell(doc, x, y + titleH, labelW, dateH, { borderWidth: 1.5 });
  cell(doc, x + labelW, y + titleH, valueW, dateH, { borderWidth: 1.5 });
  drawText(doc, l.date, x, y + titleH, labelW, dateH, { size: 15, bold: true });
  const locale = req.lang === "EN" ? "en-US" : req.lang === "RS" ? "sr-RS" : "ru-RU";
  drawText(doc, formatDateValue(req.date, dateTimeSettings, locale), x + labelW, y + titleH, valueW, dateH, { size: 13.5, bold: true, padding: 3 });

  cell(doc, x, y + titleH + dateH, labelW, placeH, { borderWidth: 1.5 });
  cell(doc, x + labelW, y + titleH + dateH, valueW, placeH, { borderWidth: 1.5 });
  drawText(doc, l.place, x, y + titleH + dateH, labelW, placeH, { size: 15, bold: true });
  drawText(doc, clean(req.place) || "—", x + labelW, y + titleH + dateH, valueW, placeH, { size: 13.5, bold: true, padding: 4 });

  cell(doc, x + leftW, y, rightW, headH, { border: "#d2d2d2", borderWidth: 0.75 });
  const logoSize = 170 * SCALE;
  drawStar(doc, x + leftW + (rightW - logoSize) / 2, y + (headH - logoSize) / 2, logoSize);
  return y + headH;
}

function drawTable(doc: PDFKit.PDFDocument, req: Finance.EstimatePdfRequestDTO, startY: number): number {
  const l = labels[req.lang];
  const x = MARGIN_X;
  const cols = [CONTENT_W * 0.39, CONTENT_W * 0.14, CONTENT_W * 0.19, CONTENT_W * 0.28];
  const headerH = 33 * SCALE;
  const sectionH = 31 * SCALE;
  let y = startY + 26 * SCALE;

  const tableHeader = () => {
    const values = [l.name, l.count, l.price, l.comment];
    let cx = x;
    values.forEach((value, index) => {
      cell(doc, cx, y, cols[index]!, headerH);
      drawText(doc, value, cx, y, cols[index]!, headerH, { size: 15, bold: true, padding: 4 });
      cx += cols[index]!;
    });
    y += headerH;
  };

  const ensureRoom = (height: number) => {
    if (y + height <= PAGE_H - 42) return;
    doc.addPage();
    y = 42;
    tableHeader();
  };

  tableHeader();
  const grouped = new Map<string, Finance.EstimatePdfLineDTO[]>();
  for (const line of req.lines) {
    const section = clean(line.section) || "Equipment";
    if (!grouped.has(section)) grouped.set(section, []);
    grouped.get(section)!.push(line);
  }

  for (const [section, items] of grouped) {
    ensureRoom(sectionH + 24);
    cell(doc, x, y, CONTENT_W, sectionH, { fill: sectionColor(section) });
    drawText(doc, section, x, y, CONTENT_W, sectionH, { size: 15, bold: true, padding: 5 });
    y += sectionH;

    for (const line of items) {
      const size = 14.25;
      const nameH = textHeight(doc, clean(line.name) || "—", cols[0]! - 14, size);
      const commentH = textHeight(doc, clean(line.comment) || "", cols[3]! - 14, size);
      const rowH = Math.max(31.5 * SCALE, Math.max(nameH, commentH) + 8);
      ensureRoom(rowH);
      const values = [clean(line.name) || "—", clean(line.count) || "1", money(currencyAmount(line.priceEUR, req)), clean(line.comment)];
      let cx = x;
      values.forEach((value, index) => {
        cell(doc, cx, y, cols[index]!, rowH);
        drawText(doc, value, cx, y, cols[index]!, rowH, { size, padding: 5 });
        cx += cols[index]!;
      });
      y += rowH;
    }
  }

  const totalH = 30 * SCALE;
  const subtotalEUR = req.lines.reduce((sum, line) => sum + line.priceEUR, 0);
  const total = currencyAmount(Math.max(0, subtotalEUR - req.totalDiscountEUR), req);
  if (req.totalDiscountEUR > 0) {
    ensureRoom(totalH);
    cell(doc, x, y, cols[0]!, totalH);
    let discountX = x + cols[0]!;
    [l.discount, `−${money(currencyAmount(req.totalDiscountEUR, req))}`, req.currency].forEach((value, index) => {
      const width = cols[index + 1]!;
      cell(doc, discountX, y, width, totalH);
      drawText(doc, value, discountX, y, width, totalH, { size: index === 2 ? 12 : 13.5, bold: index !== 2, align: "left", padding: index === 0 ? 13.5 : 7 });
      discountX += width;
    });
    y += totalH;
  }
  ensureRoom(totalH);
  cell(doc, x, y, cols[0]!, totalH);
  let cx = x + cols[0]!;
  [l.total, money(total), req.currency].forEach((value, index) => {
    const width = cols[index + 1]!;
    cell(doc, cx, y, width, totalH, { fill: "#000000" });
    drawText(doc, value, cx, y, width, totalH, { size: index === 2 ? 12 : 13.5, bold: index !== 2, align: "left", color: "#ffffff", padding: index === 0 ? 13.5 : 7 });
    cx += width;
  });
  return y + totalH;
}

function drawFooter(doc: PDFKit.PDFDocument, req: Finance.EstimatePdfRequestDTO, startY: number): void {
  const l = labels[req.lang];
  let y = startY;
  if (req.note.trim()) {
    y += 14 * SCALE;
    setFont(doc, req.note, 10.5);
    const noteH = doc.heightOfString(req.note, { width: CONTENT_W });
    if (y + noteH > PAGE_H - 42) { doc.addPage(); y = 42; }
    drawText(doc, req.note, MARGIN_X, y, CONTENT_W, noteH, { size: 10.5, align: "left", padding: 0 });
    y += noteH;
  }

  y += 30 * SCALE;
  const w = CONTENT_W * 0.61;
  const x = MARGIN_X + CONTENT_W - w;
  const headerH = 34 * SCALE;
  const rowH = 38 * SCALE;
  if (y + headerH + rowH * 3 > PAGE_H - 36) { doc.addPage(); y = 42; }

  cell(doc, x, y, w, headerH);
  drawText(doc, l.contacts, x, y, w, headerH, { size: 13.5, bold: true });
  y += headerH;
  const labelW = w * 0.28;
  const rows: [string, string][] = [[l.phone, req.company.phone], [l.email, req.company.email], [l.telegram, req.company.telegram]];
  rows.forEach(([label, value]) => {
    cell(doc, x, y, labelW, rowH);
    cell(doc, x + labelW, y, w - labelW, rowH);
    drawText(doc, label, x, y, labelW, rowH, { size: 12, bold: true, padding: 4 });
    drawText(doc, value, x + labelW, y, w - labelW, rowH, { size: 10.5, bold: label === l.telegram, padding: 5 });
    y += rowH;
  });
}

export async function renderEstimatePdf(req: Finance.EstimatePdfRequestDTO, dateTimeSettings: AppSettings.DateTimeSettingsDTO = DEFAULT_DATE_TIME_SETTINGS): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 0, autoFirstPage: true, compress: true, info: { Title: req.number || labels[req.lang].title, Author: req.company.name || "SEVER" } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      const headerBottom = drawHeader(doc, req, dateTimeSettings);
      const tableBottom = drawTable(doc, req, headerBottom);
      drawFooter(doc, req, tableBottom);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
