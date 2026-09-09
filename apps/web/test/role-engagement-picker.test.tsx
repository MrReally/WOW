import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { engagementDuration, RoleEngagementPicker } from "../src/features/projects/components/RoleEngagementPicker.tsx";

describe("RoleEngagementPicker", () => {
  const setDateTime = (label: string, value: string) => {
    const editor = within(screen.getByRole("group", { name: label }));
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
    if (!match) throw new Error(`Invalid test date-time: ${value}`);
    fireEvent.change(editor.getByLabelText("Год"), { target: { value: match[1] } });
    fireEvent.change(editor.getByLabelText("Месяц"), { target: { value: match[2] } });
    fireEvent.change(editor.getByLabelText("День"), { target: { value: match[3] } });
    fireEvent.change(editor.getByLabelText("Часы"), { target: { value: match[4] } });
    fireEvent.change(editor.getByLabelText("Минуты"), { target: { value: match[5] } });
  };

  it("formats hours and day-plus-hours durations", () => {
    expect(engagementDuration("2026-08-24T10:00", "2026-08-24T18:00")).toBe("8 ч");
    expect(engagementDuration("2026-08-24T10:00", "2026-08-25T13:30")).toBe("1 сут. 3 ч 30 мин");
  });

  it("opens from the clock, shows the duration, and saves the interval", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <RoleEngagementPicker
        startsAt={null}
        endsAt={null}
        fallbackStartsAt="2026-08-24T08:00:00.000Z"
        fallbackEndsAt="2026-08-24T16:00:00.000Z"
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Указать время занятости" }));
    setDateTime("Начало работы", "2026-08-24T10:00");
    setDateTime("Конец работы", "2026-08-25T13:30");

    expect(screen.getByText("Продолжительность · 1 сут. 3 ч 30 мин")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onSave).toHaveBeenCalledWith(
      new Date("2026-08-24T10:00").toISOString(),
      new Date("2026-08-25T13:30").toISOString(),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Время занятости" })).toBeNull());
  });

  it("clears a saved role interval", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <RoleEngagementPicker
        startsAt="2026-08-24T08:00:00.000Z"
        endsAt="2026-08-24T16:00:00.000Z"
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Изменить время занятости" }));
    await user.click(screen.getByRole("button", { name: "Очистить" }));
    expect(onSave).toHaveBeenCalledWith(null, null);
  });
});
