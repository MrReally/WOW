import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "@sever/contracts";
import { ConfiguredDateInput, ConfiguredDateTimeInput, ConfiguredTimeInput } from "../src/app/ConfiguredDateTimeInput.tsx";

const configured = vi.hoisted(() => ({ dateFormat: "DD.MM.YYYY" as AppSettings.DateFormat, timeFormat: "24h" as AppSettings.TimeFormat }));
vi.mock("../src/app/dateFormat.tsx", () => ({ useDateFormatSettings: () => configured }));

describe("configured date/time editors", () => {
  beforeEach(() => {
    configured.dateFormat = "DD.MM.YYYY";
    configured.timeFormat = "24h";
  });

  it("uses SEVER's date order and 24-hour time without native browser editors", () => {
    const onChange = vi.fn();
    const { container } = render(<ConfiguredDateTimeInput value="2026-09-12T19:30" onChange={onChange} />);

    const segments = container.querySelectorAll("input");
    expect([...segments].map((segment) => segment.getAttribute("aria-label"))).toEqual(["День", "Месяц", "Год", "Часы", "Минуты"]);
    expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
    expect((screen.getByLabelText("Часы") as HTMLInputElement).value).toBe("19");

    fireEvent.change(screen.getByLabelText("Часы"), { target: { value: "07" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-09-12T07:30");
  });

  it("shows and converts AM/PM only when SEVER is configured for 12 hours", () => {
    configured.timeFormat = "12h";
    const onChange = vi.fn();
    const { container } = render(<ConfiguredDateTimeInput value="2026-09-12T19:30" onChange={onChange} />);

    expect((screen.getByLabelText("Часы") as HTMLInputElement).value).toBe("7");
    expect((screen.getByLabelText("Период") as HTMLSelectElement).value).toBe("PM");
    fireEvent.change(screen.getByLabelText("Период"), { target: { value: "AM" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-09-12T07:30");
    expect(container.querySelector('input[type="time"]')).toBeNull();
  });

  it("uses the configured year-first order for date-only fields", () => {
    configured.dateFormat = "YYYY-MM-DD";
    const { container } = render(<ConfiguredDateInput value="1998-11-06" onChange={() => undefined} />);
    expect([...container.querySelectorAll("input")].map((segment) => segment.getAttribute("aria-label"))).toEqual(["Год", "Месяц", "День"]);
    expect(container.querySelector('input[type="date"]')).toBeNull();
  });

  it("keeps an incomplete value empty instead of replacing it with a date", () => {
    const onChange = vi.fn();
    const { container } = render(<ConfiguredDateTimeInput value="2026-09-12T19:30" onChange={onChange} />);

    fireEvent.change(within(container).getByLabelText("Месяц"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("moves between date and time segments with the left and right arrows", () => {
    const { container } = render(<ConfiguredDateTimeInput value="2026-09-12T19:30" onChange={() => undefined} />);
    const day = within(container).getByLabelText("День");
    const month = within(container).getByLabelText("Месяц");
    const year = within(container).getByLabelText("Год");
    const hour = within(container).getByLabelText("Часы");

    day.focus();
    fireEvent.keyDown(day, { key: "ArrowRight" });
    expect(document.activeElement).toBe(month);
    fireEvent.keyDown(month, { key: "ArrowRight" });
    expect(document.activeElement).toBe(year);
    fireEvent.keyDown(year, { key: "ArrowRight" });
    expect(document.activeElement).toBe(hour);
    fireEvent.keyDown(hour, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(year);
  });

  it("supports clearing a standalone time value", () => {
    const onChange = vi.fn();
    const { container } = render(<ConfiguredTimeInput value="09:30" onChange={onChange} />);

    expect((within(container).getByLabelText("Часы") as HTMLInputElement).value).toBe("09");
    fireEvent.change(within(container).getByLabelText("Минуты"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});
