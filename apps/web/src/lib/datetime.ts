import { SEVER_TIME_ZONE } from "@sever/contracts";

// datetime-local values are business wall-clock values. They must never be
// interpreted in the browser's timezone: SEVER's only business timezone is
// Europe/Belgrade.
const pad = (n: number) => String(n).padStart(2, "0");

const belgradeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SEVER_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function belgradeParts(date: Date) {
  const parts = belgradeFormatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function offsetAt(timestamp: number) {
  const parts = belgradeParts(new Date(timestamp));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - timestamp;
}

export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = belgradeParts(d);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function isoFromLocal(local: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!match) throw new RangeError("Invalid Belgrade date/time");
  const year = match[1]!;
  const month = match[2]!;
  const day = match[3]!;
  const hour = match[4]!;
  const minute = match[5]!;
  const second = match[6] ?? "0";
  const wallClock = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  let instant = wallClock - offsetAt(wallClock);
  // The first estimate can straddle a daylight-saving transition.
  instant = wallClock - offsetAt(instant);
  return new Date(instant).toISOString();
}
