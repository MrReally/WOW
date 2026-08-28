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
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

function shortMonth(date: Date, locale: string): string {
  const part = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).formatToParts(date).find((item) => item.type === "month");
  return (part?.value ?? "").replace(/\.$/, "");
}

function longMonth(date: Date, locale: string): string {
  const part = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).formatToParts(date).find((item) => item.type === "month");
  return part?.value ?? "";
}

export function formatDateValue(value: string | Date, settings: DateTimeSettingsDTO, locale = "ru-RU"): string {
  const date = asDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  const day = pad(date.getDate());
  const shortDay = String(date.getDate());
  const month = pad(date.getMonth() + 1);
  const monthName = shortMonth(date, locale);
  const fullMonthName = longMonth(date, locale);
  const year = String(date.getFullYear());
  const shortYear = year.slice(-2);
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
  if (Number.isNaN(date.getTime())) return "—";
  const minutes = pad(date.getMinutes());
  if (settings.timeFormat === "12h") {
    const hours = date.getHours();
    return `${hours % 12 || 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
  }
  return `${pad(date.getHours())}:${minutes}`;
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
  const sameDay = start.getFullYear() === end.getFullYear()
    && start.getMonth() === end.getMonth()
    && start.getDate() === end.getDate();
  return sameDay
    ? `${formatDateValue(start, settings, locale)} ${formatTimeValue(start, settings)}–${formatTimeValue(end, settings)}`
    : `${formatDateTimeValue(start, settings, locale)} → ${formatDateTimeValue(end, settings, locale)}`;
}
