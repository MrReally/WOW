import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TableSelectAllCheckbox } from "../src/features/backoffice/TableSelectAllCheckbox.tsx";

describe("TableSelectAllCheckbox", () => {
  it("selects every row when not all rows are selected", async () => {
    const onChange = vi.fn();
    render(<TableSelectAllCheckbox selectedIds={["one"]} rowIds={["one", "two"]} onChange={onChange} />);
    const checkbox = screen.getByRole("checkbox", { name: "Выбрать все строки" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.indeterminate).toBe(true);
    await userEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(["one", "two"]);
  });

  it("is checked when all rows are selected and clears them on click", async () => {
    const onChange = vi.fn();
    render(<TableSelectAllCheckbox selectedIds={["one", "two"]} rowIds={["one", "two"]} onChange={onChange} />);
    const checkbox = screen.getByRole("checkbox", { name: "Выбрать все строки" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    await userEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
