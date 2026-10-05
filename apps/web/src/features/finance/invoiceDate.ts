const DAY_MS = 86_400_000;
const SEVER_TIME_ZONE = "Europe/Belgrade";

function dateParts(value: string): { day: string; month: string; year: string } | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SEVER_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const day = get("day");
  const month = get("month");
  const year = get("year");
  return day && month && year ? { day, month, year } : null;
}

/** Value shown in the invoice date field: event start, or its billed rental period. */
export function projectInvoiceDate(startsAt: string | null, endsAt: string | null): string | null {
  if (!startsAt) return null;
  const start = dateParts(startsAt);
  if (!start) return null;

  const durationDays = endsAt
    ? Math.max(1, Math.ceil((Date.parse(endsAt) - Date.parse(startsAt)) / DAY_MS))
    : 1;
  if (durationDays < 2 || !endsAt) return `${start.year}-${start.month}-${start.day}`;

  const end = dateParts(endsAt);
  return end ? `${start.day}.${start.month}-${end.day}.${end.month}` : `${start.year}-${start.month}-${start.day}`;
}

export function isInvoiceDateRange(value: string): boolean {
  return /^\d{2}\.\d{2}-\d{2}\.\d{2}$/.test(value);
}
