import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/app/App.tsx";

const API = "http://localhost:4000";
const apiUp = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false);

describe.skipIf(!apiUp)("UI smoke — desktop employee walkthrough", () => {
  beforeEach(() => window.history.pushState({}, "", "/"));

  it("renders the authenticated shell and opens the live equipment register", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("button", { name: /Backoffice/i }, { timeout: 10000 })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Backoffice/i }));
    const nav = await screen.findByRole("navigation", { name: "Разделы Backoffice" });
    await user.click(within(nav).getByRole("button", { name: /^Оборудование/ }));
    expect(await screen.findByRole("heading", { name: "Оборудование" })).toBeTruthy();
    expect(await screen.findByRole("textbox", { name: "Поиск в реестре" })).toBeTruthy();
    const register = screen.getByRole("table");
    const rows = within(register).getAllByRole("row");
    expect(rows.length).toBeGreaterThan(1);
    await user.click(within(rows[1]!).getAllByRole("cell")[0]!);
    expect(await screen.findByText("Карточка оборудования")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Основное" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "История" })).toBeTruthy();
  });

  it("opens an equipment card from a direct desktop link", async () => {
    const units = await fetch(`${API}/api/equipment/units`).then((r) => r.json()) as Array<{ id: string; assetTag: string }>;
    expect(units.length).toBeGreaterThan(0);
    window.history.pushState({}, "", `/backoffice?domain=equipment&id=${units[0]!.id}`);
    render(<App />);
    expect(await screen.findByText("Карточка оборудования", {}, { timeout: 10000 })).toBeTruthy();
    expect(await screen.findByDisplayValue(units[0]!.assetTag)).toBeTruthy();
  });

  it("opens Backoffice and renders every real-data domain", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /Backoffice/i }, { timeout: 10000 }));
    expect(await screen.findByRole("heading", { name: "Обзор" })).toBeTruthy();
    for (const label of ["Оборудование", "Проекты", "Движение", "Люди", "Подрядчики", "Финансы", "Проблемы", "Номенклатура", "Конструктор отчётов", "Права доступа"]) {
      const nav = screen.getByRole("navigation", { name: "Разделы Backoffice" });
      await user.click(within(nav).getByRole("button", { name: new RegExp(`^${label}`) }));
      expect(await screen.findByRole("heading", { name: label })).toBeTruthy();
    }
  });

  it("switches the per-user Backoffice appearance", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /Backoffice/i }, { timeout: 10000 }));
    await user.click(await screen.findByText("Иван Комаров"));
    const stylish = await screen.findByRole("button", { name: "Stylish" });
    await user.click(stylish);
    expect(stylish.getAttribute("class")).toContain("is-active");
  });
});
