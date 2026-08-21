import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectSearch } from "../src/ui-kit/components/ProjectSearch.tsx";

function SearchHarness() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  return <ProjectSearch open={open} query={query} onToggle={() => setOpen((value) => !value)} onQueryChange={setQuery} />;
}

describe("project search control", () => {
  it("reveals the search field from the search button", () => {
    render(<SearchHarness />);

    const button = screen.getByRole("button", { name: "🔍 Поиск" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("searchbox", { name: "Поиск мероприятия" })).toBeNull();

    fireEvent.click(button);

    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("searchbox", { name: "Поиск мероприятия" })).toBeTruthy();
  });
});
