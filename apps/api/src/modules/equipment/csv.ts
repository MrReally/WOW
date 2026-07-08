import type { Equipment } from "@sever/contracts";
import { BadRequest } from "../../core/errors.js";

// Minimal RFC-4180-ish CSV parser: supports quoted fields, embedded commas,
// and "" escapes. Good enough for catalog import without a dependency.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const HEADERS = [
  "type",
  "trackingMode",
  "model",
  "manufacturer",
  "unitCostEUR",
  "dailyPriceEUR",
  "assetTag",
  "serial",
  "qty",
  "cableType",
  "lengthM",
  "sideAConnector",
  "sideAQty",
  "sideBConnector",
  "sideBQty",
  "connectors",
] as const;

const num = (v: string | undefined): number | undefined => {
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Parse a catalog CSV (header row required) into typed import rows. */
export function parseCatalogCsv(text: string): Equipment.ImportRow[] {
  const grid = parseCsv(text);
  if (grid.length < 2) throw BadRequest("CSV needs a header row and at least one data row");

  const header = grid[0]!.map((h) => h.trim());
  const idx = (name: (typeof HEADERS)[number]) =>
    header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  if (idx("type") < 0 || idx("model") < 0) {
    throw BadRequest("CSV must include at least 'type' and 'model' columns");
  }
  const at = (cols: string[], name: (typeof HEADERS)[number]) => {
    const i = idx(name);
    return i >= 0 ? cols[i]?.trim() : undefined;
  };

  return grid.slice(1).map((cols) => {
    const tm = (at(cols, "trackingMode") ?? "serial").toLowerCase();
    const cableByFields = !!(at(cols, "sideAConnector") || at(cols, "sideBConnector") || at(cols, "lengthM"));
    return {
      type: at(cols, "type") ?? "",
      trackingMode: tm === "cable" || cableByFields ? "cable" : tm === "quantity" ? "quantity" : "serial",
      model: at(cols, "model") ?? "",
      manufacturer: at(cols, "manufacturer") || null,
      unitCostEUR: num(at(cols, "unitCostEUR")),
      dailyPriceEUR: num(at(cols, "dailyPriceEUR")),
      assetTag: at(cols, "assetTag") || null,
      serial: at(cols, "serial") || null,
      qty: num(at(cols, "qty")) ?? null,
      cableType: at(cols, "cableType") || null,
      lengthM: num(at(cols, "lengthM")) ?? null,
      sideAConnector: at(cols, "sideAConnector") || null,
      sideAQty: num(at(cols, "sideAQty")) ?? null,
      sideBConnector: at(cols, "sideBConnector") || null,
      sideBQty: num(at(cols, "sideBQty")) ?? null,
      connectors: at(cols, "connectors") || null,
    };
  });
}
