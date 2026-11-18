import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Input } from "../src/ui-kit/index.ts";

function NumericField() {
  const [value, setValue] = useState(0);
  return <Input aria-label="Количество" type="number" value={value} onChange={(event) => setValue(Number(event.target.value))} />;
}

describe("numeric input", () => {
  it("lets the user clear a numeric value before entering a replacement", () => {
    render(<NumericField />);
    const input = screen.getByLabelText("Количество") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "125" } });
    expect(input.value).toBe("125");
  });
});
