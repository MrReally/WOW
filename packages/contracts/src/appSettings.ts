export const DATE_FORMATS = [
  "DD.MM.YYYY",
  "DD.MM.YY",
  "DD/MM/YYYY",
  "DD/MM/YY",
  "DD-MM-YYYY",
  "DD-MM-YY",
  "DD MMM YYYY",
  "DD MMM YY",
  "D MMM YYYY",
  "D MMM YY",
  "DD MMMM YYYY",
  "D MMMM YYYY",
  "MM/DD/YYYY",
  "MM/DD/YY",
  "MMM DD, YYYY",
  "MMMM DD, YYYY",
  "YYYY-MM-DD",
  "YYYY/MM/DD",
  "YYYY.MM.DD",
] as const;

export type DateFormat = typeof DATE_FORMATS[number];
export type TimeFormat = "24h" | "12h";

/**
 * SEVER operates in Serbia. Dates are stored as UTC instants, but every
 * user-facing date/time must be rendered in the business timezone instead of
 * the timezone of the browser or API process.
 */
export const SEVER_TIME_ZONE = "Europe/Belgrade";

export interface DateTimeSettingsDTO {
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
}

export type UpdateDateTimeSettingsInput = DateTimeSettingsDTO;

export interface DressCodeOptionDTO {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
}

export interface AppSettingsService {
  getDateTimeSettings(): Promise<DateTimeSettingsDTO>;
  updateDateTimeSettings(input: UpdateDateTimeSettingsInput): Promise<DateTimeSettingsDTO>;
  listDressCodeOptions(includeArchived?: boolean): Promise<DressCodeOptionDTO[]>;
  createDressCodeOption(input: { label: string }): Promise<DressCodeOptionDTO>;
  updateDressCodeOption(id: string, input: { label?: string; active?: boolean; sortOrder?: number }): Promise<DressCodeOptionDTO>;
}

export const DEFAULT_DATE_TIME_SETTINGS: DateTimeSettingsDTO = {
  dateFormat: "DD.MM.YYYY",
  timeFormat: "24h",
};

const pad = (value: number) => String(value).padStart(2, "0");

function asDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  // A calendar-only value has no timezone semantics. Noon UTC keeps its
  // calendar day stable when it is rendered in Belgrade (UTC+1/UTC+2).
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
}

interface ZonedDateParts {
  day: string;
  shortDay: string;
  month: string;
  year: string;
  shortYear: string;
  hours: number;
  minutes: string;
}

function zonedParts(date: Date): ZonedDateParts | null {
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SEVER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  const year = part("year");
  const day = part("day");
  return {
    day,
    shortDay: String(Number(day)),
    month: part("month"),
    year,
    shortYear: year.slice(-2),
    hours: Number(part("hour")),
    minutes: part("minute"),
  };
}

function shortMonth(date: Date, locale: string): string {
  const part = new Intl.DateTimeFormat(locale, { timeZone: SEVER_TIME_ZONE, day: "numeric", month: "short" }).formatToParts(date).find((item) => item.type === "month");
  return (part?.value ?? "").replace(/\.$/, "");
}

function longMonth(date: Date, locale: string): string {
  const part = new Intl.DateTimeFormat(locale, { timeZone: SEVER_TIME_ZONE, day: "numeric", month: "long" }).formatToParts(date).find((item) => item.type === "month");
  return part?.value ?? "";
}

export function formatDateValue(value: string | Date, settings: DateTimeSettingsDTO, locale = "ru-RU"): string {
  const date = asDate(value);
  const parts = zonedParts(date);
  if (!parts) return "—";
  const { day, shortDay, month, year, shortYear } = parts;
  const monthName = shortMonth(date, locale);
  const fullMonthName = longMonth(date, locale);
  switch (settings.dateFormat) {
    case "DD.MM.YY": return `${day}.${month}.${shortYear}`;
    case "DD/MM/YYYY": return `${day}/${month}/${year}`;
    case "DD/MM/YY": return `${day}/${month}/${shortYear}`;
    case "DD-MM-YYYY": return `${day}-${month}-${year}`;
    case "DD-MM-YY": return `${day}-${month}-${shortYear}`;
    case "DD MMM YYYY": return `${day} ${monthName} ${year}`;
    case "DD MMM YY": return `${day} ${monthName} ${shortYear}`;
    case "D MMM YYYY": return `${shortDay} ${monthName} ${year}`;
    case "D MMM YY": return `${shortDay} ${monthName} ${shortYear}`;
    case "DD MMMM YYYY": return `${day} ${fullMonthName} ${year}`;
    case "D MMMM YYYY": return `${shortDay} ${fullMonthName} ${year}`;
    case "MM/DD/YYYY": return `${month}/${day}/${year}`;
    case "MM/DD/YY": return `${month}/${day}/${shortYear}`;
    case "MMM DD, YYYY": return `${monthName} ${day}, ${year}`;
    case "MMMM DD, YYYY": return `${fullMonthName} ${day}, ${year}`;
    case "YYYY-MM-DD": return `${year}-${month}-${day}`;
    case "YYYY/MM/DD": return `${year}/${month}/${day}`;
    case "YYYY.MM.DD": return `${year}.${month}.${day}`;
    default: return `${day}.${month}.${year}`;
  }
}

export function formatTimeValue(value: string | Date, settings: DateTimeSettingsDTO): string {
  const date = asDate(value);
  const parts = zonedParts(date);
  if (!parts) return "—";
  const { hours, minutes } = parts;
  if (settings.timeFormat === "12h") {
    return `${hours % 12 || 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
  }
  return `${pad(hours)}:${minutes}`;
}

export function formatDateTimeValue(value: string | Date, settings: DateTimeSettingsDTO, locale = "ru-RU"): string {
  return `${formatDateValue(value, settings, locale)} ${formatTimeValue(value, settings)}`;
}

export function formatDateRangeValue(
  startsAt: string | null,
  endsAt: string | null,
  settings: DateTimeSettingsDTO,
  locale = "ru-RU",
  emptyLabel = "Дата не указана",
): string {
  if (!startsAt || !endsAt) return emptyLabel;
  const start = asDate(startsAt);
  const end = asDate(endsAt);
  const startParts = zonedParts(start);
  const endParts = zonedParts(end);
  const sameDay = !!startParts && !!endParts
    && startParts.year === endParts.year
    && startParts.month === endParts.month
    && startParts.day === endParts.day;
  return sameDay
    ? `${formatDateValue(start, settings, locale)} ${formatTimeValue(start, settings)}–${formatTimeValue(end, settings)}`
    : `${formatDateTimeValue(start, settings, locale)} → ${formatDateTimeValue(end, settings, locale)}`;
}
