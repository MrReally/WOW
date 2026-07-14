import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/app/App.tsx";

const API = "http://localhost:4000";
const apiUp = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false);

describe.skipIf(!apiUp)("UI smoke — desktop employee walkthrough", () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.removeItem("sever.backoffice.collapsed-groups"); localStorage.removeItem("sever.backoffice.tabs"); window.history.pushState({}, "", "/"); });

  it("renders the authenticated shell and opens the live equipment register", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("button", { name: /Backoffice/i }, { timeout: 10000 })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Backoffice/i }));
    const nav = await screen.findByRole("navigation", { name: "Разделы Backoffice" });
    fireEvent.click(within(nav).getByRole("button", { name: /^Оборудование/ }));
    expect((await screen.findByRole("tab", { name: /Оборудование/ })).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByRole("textbox", { name: "Поиск в реестре" })).toBeTruthy();
    const register = screen.getByRole("table");
    const rows = within(register).getAllByRole("row");
    expect(rows.length).toBeGreaterThan(1);
    await user.click(within(rows[1]!).getAllByRole("cell")[0]!);
    expect(await screen.findByText("Карточка оборудования")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Основное" })).toBeTruthy();
    expect(await screen.findByRole("combobox", { name: "Модель оборудования" })).toBeTruthy();
    expect(await screen.findByRole("combobox", { name: "Тип оборудования" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Сохранить единицу" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Сохранить модель и тип" })).toBeTruthy();
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
    expect((await screen.findByRole("tab", { name: /Обзор/ })).getAttribute("aria-selected")).toBe("true");
    for (const label of ["Оборудование", "Модели", "Кабели", "Комплектующие", "Проекты", "Перемещения", "Движение", "Люди", "Подрядчики", "Финансы", "Проблемы", "Расходники и комплекты", "Конструктор отчётов", "Права доступа", "Разъёмы кабелей"]) {
      const nav = screen.getByRole("navigation", { name: "Разделы Backoffice" });
      fireEvent.click(within(nav).getByRole("button", { name: new RegExp(`^${label}`) }));
      expect((await screen.findByRole("tab", { name: new RegExp(label) })).getAttribute("aria-selected")).toBe("true");
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

  it("exposes the essential desktop creation flows", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /Backoffice/i }, { timeout: 10000 }));
    const nav = await screen.findByRole("navigation", { name: "Разделы Backoffice" });

    fireEvent.click(within(nav).getByRole("button", { name: /^Проекты/ }));
    await screen.findByRole("tab", { name: /Проекты/ });
    await user.click(await screen.findByRole("button", { name: "Новый проект" }));
    expect(screen.getByRole("button", { name: "Создать проект" })).toBeTruthy();

    fireEvent.click(within(screen.getByRole("navigation", { name: "Разделы Backoffice" })).getByRole("button", { name: /^Расходники и комплекты/ }));
    await screen.findByRole("tab", { name: /Расходники и комплекты/ });
    await user.click(await screen.findByRole("button", { name: "Новая позиция" }));
    expect(screen.getByRole("button", { name: "Создать позицию" })).toBeTruthy();

    fireEvent.click(within(screen.getByRole("navigation", { name: "Разделы Backoffice" })).getByRole("button", { name: /^Люди/ }));
    await screen.findByRole("tab", { name: /Люди/ });
    await user.click(await screen.findByRole("button", { name: "Новый сотрудник" }));
    expect(screen.getByRole("button", { name: "Создать сотрудника" })).toBeTruthy();

    fireEvent.click(within(screen.getByRole("navigation", { name: "Разделы Backoffice" })).getByRole("button", { name: /^Подрядчики/ }));
    await screen.findByRole("tab", { name: /Подрядчики/ });
    await user.click(await screen.findByRole("button", { name: "Новый подрядчик" }));
    expect(screen.getByRole("button", { name: "Создать подрядчика" })).toBeTruthy();
  });

  it("uses the shared mobile data in advanced desktop flows", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /Backoffice/i }, { timeout: 10000 }));

    const nav = () => screen.getByRole("navigation", { name: "Разделы Backoffice" });
    fireEvent.click(within(nav()).getByRole("button", { name: /^Проекты/ }));
    await user.click(await screen.findByText("Корпоратив Acme — летняя сцена"));
    expect(await screen.findByRole("tablist", { name: "Разделы проекта" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Брони" })).toBeTruthy();
    expect(await screen.findByRole("tab", { name: "Финансы" })).toBeTruthy();

    fireEvent.click(within(nav()).getByRole("button", { name: /^Расходники и комплекты/ }));
    await user.click(await screen.findByText("Комплект расходников для сцены"));
    expect(await screen.findByText("Версия 1")).toBeTruthy();
    expect(screen.getByText("Проверить комплект перед выдачей")).toBeTruthy();

    fireEvent.click(within(nav()).getByRole("button", { name: /^Перемещения/ }));
    const scanner = await screen.findByRole("textbox", { name: "Сканер оборудования" });
    await user.type(scanner, "AU-001{Enter}");
    expect(await screen.findByText("AU-001 добавлено")).toBeTruthy();
    await user.type(scanner, "AU-001{Enter}");
    expect(await screen.findByText("AU-001 уже добавлено")).toBeTruthy();
  });
});
