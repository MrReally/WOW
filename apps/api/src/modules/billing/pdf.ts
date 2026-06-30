import type { Finance } from "@sever/contracts";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 46;
const FONT = "F1";
const FONT_BOLD = "F2";

const labels: Record<Finance.InvoiceLang, { title: string; date: string; place: string; client: string; name: string; count: string; price: string; comment: string; total: string; contacts: string; phone: string; email: string; telegram: string }> = {
  EN: { title: "Purchase Order", date: "Date", place: "Place", client: "Client", name: "Name", count: "Count", price: "Price", comment: "Comment", total: "TOTAL:", contacts: "Contacts", phone: "Phone", email: "Email", telegram: "Telegram" },
  RU: { title: "Смета", date: "Дата", place: "Место", client: "Заказчик", name: "Название", count: "Кол-во", price: "Цена", comment: "Комментарий", total: "ИТОГО:", contacts: "Контакты", phone: "Телефон", email: "Email", telegram: "Telegram" },
  RS: { title: "Ponuda", date: "Datum", place: "Mesto", client: "Klijent", name: "Naziv", count: "Količina", price: "Cena", comment: "Komentar", total: "UKUPNO:", contacts: "Kontakti", phone: "Telefon", email: "Email", telegram: "Telegram" },
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const currencyAmount = (eur: number, req: Finance.EstimatePdfRequestDTO) =>
  req.currency === "EUR" || !req.rateToEUR ? eur : eur / req.rateToEUR;
const money = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(round2(n));

function pdfText(text: string): string {
  const bytes: number[] = [0xfe, 0xff];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    bytes.push((code >> 8) & 255, code & 255);
  }
  return `<${bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}>`;
}

function esc(text: string): string {
  return pdfText(text);
}

function approxWidth(text: string, size: number): number {
  return [...text].reduce((sum, ch) => sum + (/[A-ZА-Я]/.test(ch) ? 0.62 : /[ilI1\.\s]/.test(ch) ? 0.28 : 0.52) * size, 0);
}

function wrap(text: string, maxWidth: number, size: number): string[] {
  const words = clean(text || "—").split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (approxWidth(next, size) <= maxWidth || !current) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

class PdfCanvas {
  private chunks: string[] = [];
  y = PAGE_H - M;

  raw(s: string) { this.chunks.push(s); }
  line(x1: number, y1: number, x2: number, y2: number) { this.raw(`${x1} ${y1} m ${x2} ${y2} l S\n`); }
  rect(x: number, y: number, w: number, h: number, fill?: string) {
    if (fill) this.raw(`${fill} rg ${x} ${y} ${w} ${h} re f 0 g\n`);
    this.raw(`${x} ${y} ${w} ${h} re S\n`);
  }
  fillRect(x: number, y: number, w: number, h: number, gray = 0) { this.raw(`${gray} g ${x} ${y} ${w} ${h} re f 0 g\n`); }
  text(text: string, x: number, y: number, size = 10, font = FONT, color = "0 0 0") {
    this.raw(`BT /${font} ${size} Tf ${color} rg ${x} ${y} Td ${esc(text)} Tj ET\n`);
  }
  centered(text: string, x: number, y: number, w: number, size = 10, font = FONT) {
    const tx = x + Math.max(0, (w - approxWidth(text, size)) / 2);
    this.text(text, tx, y, size, font);
  }
  content() { return this.chunks.join(""); }
}

function sectionClass(section: string): string {
  const s = section.toLowerCase();
  if (s.includes("sound") || s.includes("звук")) return "0.86 0.93 0.82";
  if (s.includes("light") || s.includes("свет")) return "1 0.95 0.8";
  if (s.includes("staff") || s.includes("crew") || s.includes("команд")) return "0.96 0.8 0.8";
  if (s.includes("delivery") || s.includes("transport")) return "0.85 0.92 0.94";
  return "0.93 0.93 0.93";
}

function drawBrand(c: PdfCanvas, x: number, y: number, w: number) {
  const cx = x + w / 2;
  const cy = y - 42;
  const s = 22;
  const pts: [number, number][] = [
    [0, -2.15], [0.35, -0.35], [2.15, 0], [0.35, 0.35],
    [0, 2.15], [-0.35, 0.35], [-2.15, 0], [-0.35, -0.35],
  ];
  c.raw(`${cx + pts[0]![0] * s} ${cy - pts[0]![1] * s} m `);
  for (const [px, py] of pts.slice(1)) c.raw(`${cx + px * s} ${cy - py * s} l `);
  c.raw("h f\n");
  c.centered("SEVER", x, y - 104, w, 30, FONT_BOLD);
  c.centered("EVENT RENTAL", x, y - 124, w, 10, FONT);
}

function drawHeader(c: PdfCanvas, req: Finance.EstimatePdfRequestDTO) {
  const l = labels[req.lang];
  const leftW = 260;
  const logoX = M + leftW;
  const topY = PAGE_H - 92;
  c.fillRect(M, topY, leftW, 58, 0);
  c.centered(l.title, M, topY + 20, leftW, 22, FONT_BOLD);
  c.raw(`1 1 1 rg BT /${FONT_BOLD} 24 Tf ${M + 45} ${topY + 20} Td ${esc(l.title)} Tj ET 0 g\n`);
  c.rect(M, topY - 58, leftW, 58);
  c.text(l.date, M + 18, topY - 24, 14, FONT_BOLD);
  c.text(req.date.split("-").reverse().join("/"), M + 150, topY - 24, 13, FONT_BOLD);
  c.rect(M, topY - 98, leftW, 40);
  c.text(l.client, M + 18, topY - 82, 12, FONT_BOLD);
  for (const [i, line] of wrap(req.clientName || "—", 112, 10.5).entries()) c.text(line, M + 130, topY - 82 - i * 12, 10.5, FONT_BOLD);
  c.rect(M, topY - 150, leftW, 52);
  c.text(l.place, M + 18, topY - 120, 12, FONT_BOLD);
  for (const [i, line] of wrap(req.place || "—", 112, 11).entries()) c.text(line, M + 130, topY - 120 - i * 13, 11, FONT_BOLD);
  c.rect(logoX, topY - 132, PAGE_W - M - logoX, 190);
  drawBrand(c, logoX, topY + 10, PAGE_W - M - logoX);
  c.y = topY - 170;
}

function drawTable(c: PdfCanvas, req: Finance.EstimatePdfRequestDTO) {
  const l = labels[req.lang];
  const x = M;
  const cols: [number, number, number, number] = [250, 58, 82, PAGE_W - M * 2 - 250 - 58 - 82];
  const totalW = cols.reduce((a, b) => a + b, 0);
  const headerH = 24;
  c.rect(x, c.y - headerH, totalW, headerH);
  c.text(l.name, x + 8, c.y - 16, 10, FONT_BOLD);
  c.centered(l.count, x + cols[0], c.y - 16, cols[1], 10, FONT_BOLD);
  c.centered(l.price, x + cols[0] + cols[1], c.y - 16, cols[2], 10, FONT_BOLD);
  c.text(l.comment, x + cols[0] + cols[1] + cols[2] + 8, c.y - 16, 10, FONT_BOLD);
  c.y -= headerH;

  const grouped = new Map<string, Finance.EstimatePdfLineDTO[]>();
  for (const line of req.lines) {
    const section = clean(line.section) || "Equipment";
    if (!grouped.has(section)) grouped.set(section, []);
    grouped.get(section)!.push(line);
  }

  for (const [section, items] of grouped) {
    const h = 22;
    c.raw(`${sectionClass(section)} rg ${x} ${c.y - h} ${totalW} ${h} re f 0 g\n`);
    c.rect(x, c.y - h, totalW, h);
    c.centered(section, x, c.y - 15, totalW, 11, FONT_BOLD);
    c.y -= h;
    for (const line of items) {
      const nameLines = wrap(line.name || "—", cols[0] - 14, 10);
      const commentLines = wrap(line.comment || "", cols[3] - 14, 9);
      const rowH = Math.max(24, Math.max(nameLines.length, commentLines.length) * 12 + 10);
      if (c.y - rowH < 120) break;
      c.rect(x, c.y - rowH, totalW, rowH);
      let cx = x;
      for (let i = 0; i < cols.length - 1; i++) {
        cx += cols[i]!;
        c.line(cx, c.y, cx, c.y - rowH);
      }
      nameLines.forEach((t, i) => c.text(t, x + 7, c.y - 15 - i * 12, 9.5));
      c.centered(clean(line.count) || "1", x + cols[0], c.y - 15, cols[1], 9.5);
      c.centered(money(currencyAmount(line.priceEUR, req)), x + cols[0] + cols[1], c.y - 15, cols[2], 9.5);
      commentLines.forEach((t, i) => c.text(t, x + cols[0] + cols[1] + cols[2] + 7, c.y - 15 - i * 12, 8.5));
      c.y -= rowH;
    }
  }

  const total = req.lines.reduce((sum, line) => sum + currencyAmount(line.priceEUR, req), 0);
  c.fillRect(x + cols[0], c.y - 24, totalW - cols[0], 24, 0);
  c.raw(`1 1 1 rg BT /${FONT_BOLD} 12 Tf ${x + cols[0] + 10} ${c.y - 16} Td ${esc(l.total)} Tj ET\n`);
  c.raw(`1 1 1 rg BT /${FONT_BOLD} 12 Tf ${x + cols[0] + cols[1] + 8} ${c.y - 16} Td ${esc(money(total))} Tj ET\n`);
  c.raw(`1 1 1 rg BT /${FONT} 11 Tf ${x + cols[0] + cols[1] + cols[2] + 8} ${c.y - 16} Td ${esc(req.currency)} Tj ET 0 g\n`);
  c.y -= 42;
}

function drawFooter(c: PdfCanvas, req: Finance.EstimatePdfRequestDTO) {
  const l = labels[req.lang];
  if (req.note.trim()) {
    for (const [i, line] of wrap(req.note, PAGE_W - M * 2, 9).entries()) c.text(line, M, c.y - i * 11, 8.5);
    c.y -= 48;
  }
  const w = 280;
  const x = PAGE_W - M - w;
  const rowH = 22;
  const rows: [string, string][] = [[l.phone, req.company.phone], [l.email, req.company.email], [l.telegram, req.company.telegram]];
  c.rect(x, 58 + rows.length * rowH, w, rowH);
  c.centered(l.contacts, x, 58 + rows.length * rowH + 7, w, 10, FONT_BOLD);
  rows.forEach((row, idx) => {
    const y = 58 + (rows.length - idx - 1) * rowH;
    c.rect(x, y, w, rowH);
    c.line(x + 82, y + rowH, x + 82, y);
    c.centered(row[0], x, y + 7, 82, 9, FONT_BOLD);
    c.text(row[1], x + 92, y + 7, 9);
  });
}

function makePdf(content: string): Buffer {
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /${FONT} 4 0 R /${FONT_BOLD} 5 0 R >> >> /Contents 6 0 R >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`,
    `<< /Length ${Buffer.byteLength(content, "binary")} >>\nstream\n${content}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, "binary"));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "binary");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, "binary");
}

export function renderEstimatePdf(req: Finance.EstimatePdfRequestDTO): Buffer {
  const canvas = new PdfCanvas();
  drawHeader(canvas, req);
  drawTable(canvas, req);
  drawFooter(canvas, req);
  return makePdf(canvas.content());
}
