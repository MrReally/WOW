import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../src/ui-kit/index.ts";

describe("mobile action button", () => {
  it("keeps its text as the accessible name while rendering the requested icon", () => {
    render(<Button mobileIcon="duplicate">Дублировать</Button>);

    const button = screen.getByRole("button", { name: "Дублировать" });
    expect(button.classList.contains("btn--mobile-icon")).toBe(true);
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.textContent).toContain("Дублировать");
  });
});
