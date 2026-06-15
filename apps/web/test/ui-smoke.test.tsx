import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/app/App.tsx";

// End-to-end UI smoke test: mounts the REAL app against a running API and walks
// the employee flow, asserting screens render and key buttons are wired (open
// their sheets / navigate). Catches render crashes and dead buttons.
//
// Requires the API at http://localhost:4000 with seed data; if it's not
// reachable the suite skips (so `pnpm -r test` doesn't fail without a backend).

const API = "http://localhost:4000";
const apiUp = await fetch(`${API}/health`)
  .then((r) => r.ok)
  .catch(() => false);

async function openSwitcherAndGo(user: ReturnType<typeof userEvent.setup>, workspace: string) {
  // The header workspace bar opens the switcher.
  const bar = await screen.findByRole("button", { name: "Сменить workspace" });
  await user.click(bar);
  const sheet = await screen.findByText(/Другие workspaces/i);
  const container = sheet.closest(".sheet") as HTMLElement;
  await user.click(within(container).getByText(workspace));
}

describe.skipIf(!apiUp)("UI smoke — employee walkthrough", () => {
  // BrowserRouter reads jsdom's shared history, so reset the URL between tests.
  beforeEach(() => window.history.pushState({}, "", "/"));

  it("renders Operations and opens pickup/return", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Operations (Apex) is the landing workspace.
    expect(await screen.findByText("Выдача / Возврат оборудования", {}, { timeout: 10000 })).toBeTruthy();

    await user.click(screen.getByText("Выдача / Возврат оборудования"));
    // Sheet shows the issue/return toggle.
    expect(await screen.findByText("Выдача")).toBeTruthy();
    expect(screen.getByText("Возврат")).toBeTruthy();
  });

  it("navigates every workspace without crashing and key buttons exist", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Выдача / Возврат оборудования", {}, { timeout: 10000 });

    // Warehouse → import + template button.
    await openSwitcherAndGo(user, "Warehouse");
    await user.click(await screen.findByText("Импорт CSV"));
    expect(await screen.findByText(/Скачать шаблон/i)).toBeTruthy();
    // close the sheet
    await user.keyboard("{Escape}");

    // Planning → new project.
    await openSwitcherAndGo(user, "Planning");
    expect(await screen.findByText(/Новый проект/i)).toBeTruthy();

    // Finance → add transaction.
    await openSwitcherAndGo(user, "Finance");
    expect(await screen.findByText(/Транзакция/i)).toBeTruthy();

    // Admin → theme toggle.
    await openSwitcherAndGo(user, "Admin");
    await waitFor(() => expect(screen.getByText(/Переключить/i)).toBeTruthy());
  });

  it("creates a project end-to-end through the UI form", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Выдача / Возврат оборудования", {}, { timeout: 10000 });

    await openSwitcherAndGo(user, "Planning");
    await user.click(await screen.findByText(/Новый проект/i));

    const sheet = (await screen.findByText("Новый проект")).closest(".sheet") as HTMLElement;
    const name = `UI Test Rent ${Date.now()}`;
    await user.type(within(sheet).getByPlaceholderText(/Корпоратив/), name);

    // Pick the seeded client.
    const clientSelect = within(sheet).getAllByRole("combobox")[0]!;
    await user.selectOptions(clientSelect, "Acme Events");

    await user.click(within(sheet).getByText("Создать проект"));

    // Sheet closes and the new project shows up in the list.
    await waitFor(() => expect(screen.queryByText("Новый проект")).toBeNull());
    expect(await screen.findByText(name, {}, { timeout: 10000 })).toBeTruthy();
  });
});
