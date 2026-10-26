import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TimingReminderPicker } from "../src/features/projects/components/TimingReminderPicker.tsx";

const options = [
  { label: "За 15 минут", minutes: 15 },
  { label: "За 1 час", minutes: 60 },
];

describe("TimingReminderPicker", () => {
  it("keeps the menu open while editing and saves the complete selection", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<TimingReminderPicker options={options} value={[60]} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Когда напомнить · 1" }));
    await user.click(screen.getByRole("checkbox", { name: "За 15 минут" }));

    expect(screen.getByRole("dialog", { name: "Когда напомнить" })).not.toBeNull();
    expect(onSave).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onSave).toHaveBeenCalledWith([60, 15]);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Когда напомнить" })).toBeNull());
  });

  it("closes from the sheet backdrop and discards the draft selection", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <div>
        <TimingReminderPicker options={options} value={[60]} onSave={onSave} />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Когда напомнить · 1" }));
    await user.click(screen.getByRole("checkbox", { name: "За 15 минут" }));
    await user.click(document.querySelector(".sheet__backdrop")!);

    expect(screen.queryByRole("dialog", { name: "Когда напомнить" })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Когда напомнить · 1" }));
    expect((screen.getByRole("checkbox", { name: "За 15 минут" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "За 1 час" }) as HTMLInputElement).checked).toBe(true);
  });
});
