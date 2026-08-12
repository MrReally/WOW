import type { Finance } from "@sever/contracts";

type DerivedLine = Pick<Finance.InvoiceLineDTO, "refId" | "label" | "detail">;

export function withoutSourceEstimateLine<T extends { sourceRefId: string | null }>(lines: T[], sourceRefId: string): T[] {
  return lines.filter((line) => line.sourceRefId !== sourceRefId);
}

const normalized = (value: string) => value.trim().toLocaleLowerCase();
const billedDays = (detail: string): number | null => {
  const match = detail.trim().match(/^(\d+)\s+days?\s*[×x]/i);
  return match ? Number(match[1]) : null;
};

/**
 * Older projects can contain an auto-generated equipment estimate for the old
 * project duration plus a fresh derived line for the current duration. Hide the
 * stale source row so it remains linked to its reservation but is not billed.
 */
export function staleDurationEstimateIds(
  saved: Finance.ProjectEstimateLineDTO[],
  derived: DerivedLine[],
  projectDays: number,
): Set<string> {
  const currentNames = new Set(
    derived
      .filter((line) => billedDays(line.detail) === projectDays)
      .map((line) => normalized(line.label)),
  );
  return new Set(saved
    .filter((line) =>
      line.source === "equipment"
      && !line.hidden
      && billedDays(line.comment) !== null
      && billedDays(line.comment) !== projectDays
      && currentNames.has(normalized(line.name)))
    .map((line) => line.id));
}
