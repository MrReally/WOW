import { describe, expect, it } from "vitest";
import { formatDateRangeValue, formatDateTimeValue, formatDateValue, formatTimeValue, type AppSettings } from "@sever/contracts";

const at = new Date(2026, 0, 31, 18, 30);

describe("global date and time formatting", () => {
  it.each<[AppSettings.DateFormat, string]>([
    ["DD.MM.YYYY", "31.01.2026"],
    ["DD.MM.YY", "31.01.26"],
    ["DD/MM/YYYY", "31/01/2026"],
    ["DD/MM/YY", "31/01/26"],
    ["DD-MM-YYYY", "31-01-2026"],
    ["DD-MM-YY", "31-01-26"],
    ["DD MMM YYYY", "31 янв 2026"],
    ["DD MMM YY", "31 янв 26"],
    ["D MMM YYYY", "31 янв 2026"],
    ["D MMM YY", "31 янв 26"],
    ["DD MMMM YYYY", "31 января 2026"],
    ["D MMMM YYYY", "31 января 2026"],
    ["MM/DD/YYYY", "01/31/2026"],
    ["MM/DD/YY", "01/31/26"],
    ["MMM DD, YYYY", "янв 31, 2026"],
    ["MMMM DD, YYYY", "января 31, 2026"],
    ["YYYY-MM-DD", "2026-01-31"],
    ["YYYY/MM/DD", "2026/01/31"],
    ["YYYY.MM.DD", "2026.01.31"],
  ])("renders %s from the shared formatter", (dateFormat, expected) => {
    expect(formatDateValue(at, { dateFormat, timeFormat: "24h" }, "ru-RU")).toBe(expected);
  });

  it("switches the same time between 24-hour and 12-hour display", () => {
    expect(formatTimeValue(at, { dateFormat: "DD.MM.YYYY", timeFormat: "24h" })).toBe("18:30");
    expect(formatTimeValue(at, { dateFormat: "DD.MM.YYYY", timeFormat: "12h" })).toBe("6:30 PM");
  });

  it("uses the configured format for date-times and ranges", () => {
    const settings = { dateFormat: "DD MMM YY", timeFormat: "12h" } as const;
    expect(formatDateTimeValue(at, settings, "ru-RU")).toBe("31 янв 26 6:30 PM");
    expect(formatDateRangeValue(
      new Date(2026, 0, 31, 9, 0).toISOString(),
      new Date(2026, 0, 31, 18, 30).toISOString(),
      settings,
      "ru-RU",
    )).toBe("31 янв 26 9:00 AM–6:30 PM");
  });
});
