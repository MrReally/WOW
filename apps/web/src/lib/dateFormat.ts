import {
  DEFAULT_DATE_TIME_SETTINGS,
  formatDateRangeValue,
  formatDateTimeValue,
  formatDateValue,
  formatTimeValue,
  type AppSettings,
} from "@sever/contracts";

let activeSettings: AppSettings.DateTimeSettingsDTO = DEFAULT_DATE_TIME_SETTINGS;

export function setActiveDateTimeSettings(settings: AppSettings.DateTimeSettingsDTO) {
  activeSettings = settings;
}

export const configuredDate = (value: string | Date, locale = "ru-RU") =>
  formatDateValue(value, activeSettings, locale);

export const configuredTime = (value: string | Date) =>
  formatTimeValue(value, activeSettings);

export const configuredDateTime = (value: string | Date, locale = "ru-RU") =>
  formatDateTimeValue(value, activeSettings, locale);

export const configuredDateRange = (
  startsAt: string | null,
  endsAt: string | null,
  locale = "ru-RU",
  emptyLabel = "Дата не указана",
) => formatDateRangeValue(startsAt, endsAt, activeSettings, locale, emptyLabel);
