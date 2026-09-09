import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppSettings } from "@sever/contracts";
import { useDateFormatSettings } from "./dateFormat.tsx";

type Mode = "date" | "datetime";
type Draft = { year: string; month: string; day: string; hour: string; minute: string; period: "AM" | "PM" };

const emptyDraft = (): Draft => ({ year: "", month: "", day: "", hour: "", minute: "", period: "AM" });
const pad = (value: string | number) => String(value).padStart(2, "0");

function draftFromValue(value: string, timeFormat: AppSettings.TimeFormat): Draft {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!match) return emptyDraft();
  const hour24 = Number(match[4] ?? 0);
  return {
    year: match[1]!,
    month: match[2]!,
    day: match[3]!,
    hour: timeFormat === "12h" ? String(hour24 % 12 || 12) : pad(hour24),
    minute: match[5] ?? "00",
    period: hour24 >= 12 ? "PM" : "AM",
  };
}

function fullYear(raw: string, short: boolean): number {
  const year = Number(raw);
  if (!short || raw.length > 2) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function canonicalValue(draft: Draft, mode: Mode, dateFormat: AppSettings.DateFormat, timeFormat: AppSettings.TimeFormat): string | null {
  const shortYear = dateFormat.includes("YY") && !dateFormat.includes("YYYY");
  const year = fullYear(draft.year, shortYear);
  const month = Number(draft.month);
  const day = Number(draft.day);
  if (!Number.isInteger(year) || year < 1900 || year > 2199 || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  const dateValue = `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
  if (mode === "date") return dateValue;
  const enteredHour = Number(draft.hour);
  const minute = Number(draft.minute);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  let hour = enteredHour;
  if (timeFormat === "12h") {
    if (!Number.isInteger(hour) || hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (draft.period === "PM" ? 12 : 0);
  } else if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return `${dateValue}T${pad(hour)}:${pad(minute)}`;
}

function monthOptions(style: "short" | "long") {
  const htmlLocale = document.documentElement.lang || "ru";
  return Array.from({ length: 12 }, (_, index) => ({
    value: pad(index + 1),
    label: new Intl.DateTimeFormat(htmlLocale, { month: style, timeZone: "UTC" }).format(new Date(Date.UTC(2026, index, 1))).replace(/\.$/, ""),
  }));
}

export function ConfiguredDateInput(props: EditorProps) {
  return <ConfiguredEditor {...props} mode="date" />;
}

export function ConfiguredDateTimeInput(props: EditorProps) {
  return <ConfiguredEditor {...props} mode="datetime" />;
}

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

function ConfiguredEditor({ value, onChange, disabled = false, className = "", mode, "aria-label": ariaLabel }: EditorProps & { mode: Mode }) {
  const settings = useDateFormatSettings();
  const [draft, setDraft] = useState(() => draftFromValue(value, settings.timeFormat));
  const lastEmitted = useRef(value);
  const tokens = useMemo(() => settings.dateFormat.match(/YYYY|YY|MMMM|MMM|MM|DD|D|[^DMY]+/g) ?? [], [settings.dateFormat]);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setDraft(draftFromValue(value, settings.timeFormat));
  }, [value, settings.timeFormat]);

  useEffect(() => {
    setDraft(draftFromValue(value, settings.timeFormat));
  }, [settings.dateFormat, settings.timeFormat]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchDraft = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    const canonical = canonicalValue(next, mode, settings.dateFormat, settings.timeFormat) ?? "";
    lastEmitted.current = canonical;
    onChange(canonical);
  };

  const dateParts: ReactNode[] = tokens.map((token, index) => {
    if (!/[DMY]/.test(token)) return <span className="configured-editor__separator" key={`${token}-${index}`}>{token}</span>;
    if (token.startsWith("D")) return <Segment key={token} label="День" value={draft.day} placeholder={token} maxLength={2} disabled={disabled} onChange={(day) => patchDraft({ day })} />;
    if (token === "MMM" || token === "MMMM") return (
      <select key={token} className="configured-editor__segment configured-editor__month" aria-label="Месяц" value={draft.month} disabled={disabled} onChange={(event) => patchDraft({ month: event.target.value })}>
        <option value="">{token}</option>
        {monthOptions(token === "MMM" ? "short" : "long").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
    if (token.startsWith("M")) return <Segment key={token} label="Месяц" value={draft.month} placeholder={token} maxLength={2} disabled={disabled} onChange={(month) => patchDraft({ month })} />;
    return <Segment key={token} label="Год" value={settings.dateFormat.includes("YYYY") ? draft.year : draft.year.slice(-2)} placeholder={token} maxLength={token.length} disabled={disabled} onChange={(year) => patchDraft({ year })} />;
  });

  return (
    <div className={`configured-editor ${className}`} role={ariaLabel ? "group" : undefined} aria-label={ariaLabel}>
      <div className="configured-editor__date">{dateParts}</div>
      {mode === "datetime" && (
        <div className="configured-editor__time">
          <Segment label="Часы" value={draft.hour} placeholder={settings.timeFormat === "24h" ? "ЧЧ" : "HH"} maxLength={2} disabled={disabled} onChange={(hour) => patchDraft({ hour })} />
          <span className="configured-editor__separator">:</span>
          <Segment label="Минуты" value={draft.minute} placeholder="ММ" maxLength={2} disabled={disabled} onChange={(minute) => patchDraft({ minute })} />
          {settings.timeFormat === "12h" && <select className="configured-editor__segment configured-editor__period" aria-label="Период" value={draft.period} disabled={disabled} onChange={(event) => patchDraft({ period: event.target.value as "AM" | "PM" })}><option>AM</option><option>PM</option></select>}
        </div>
      )}
    </div>
  );
}

function Segment({ label, value, placeholder, maxLength, disabled, onChange }: { label: string; value: string; placeholder: string; maxLength: number; disabled: boolean; onChange: (value: string) => void }) {
  return <input className="configured-editor__segment" aria-label={label} inputMode="numeric" value={value} placeholder={placeholder} maxLength={maxLength} disabled={disabled} onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, maxLength))} />;
}
