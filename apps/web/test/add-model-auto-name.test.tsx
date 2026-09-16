import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Equipment } from "@sever/contracts";

const mocks = vi.hoisted(() => ({
  createModel: vi.fn(),
  cableSettings: null as Equipment.CableSettingsDTO | null,
}));

vi.mock("../src/features/warehouse/hooks.ts", () => ({
  useCreateType: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateModel: () => ({ mutate: mocks.createModel, isPending: false }),
  useCreateUnit: () => ({ mutate: vi.fn(), isPending: false }),
  useSetModelStock: () => ({ mutate: vi.fn(), isPending: false }),
  useWarehouses: () => ({ data: [] }),
  useCableSettings: () => ({ data: mocks.cableSettings }),
  useCategories: () => ({ data: [] }),
  useModelStockAtWarehouse: () => ({ data: null }),
}));

import { AddModelSheet } from "../src/features/warehouse/components/AddModelSheet.tsx";

const types = [
  { id: "serial", name: "Оборудование", trackingMode: "serial", reservationAssignmentMode: null },
  { id: "cable", name: "Кабели", trackingMode: "cable", reservationAssignmentMode: null },
] as Equipment.EquipmentTypeDTO[];

describe("creating a model with a saved auto-name template", () => {
  beforeEach(() => {
    mocks.createModel.mockReset();
    mocks.cableSettings = null;
  });

  it("waits for settings, then submits a serial extension's calculated name", () => {
    const view = render(<AddModelSheet open onClose={vi.fn()} types={types} models={[]} />);
    fireEvent.click(screen.getByLabelText("Это удлинитель: хранить длину и розетки"));
    fireEvent.change(screen.getByLabelText("Длина, м"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Сторона B"), { target: { value: "Schuko" } });
    fireEvent.change(screen.getAllByLabelText("Кол-во")[1]!, { target: { value: "4" } });
    expect((screen.getByRole("button", { name: "Создать модель" }) as HTMLButtonElement).disabled).toBe(true);

    mocks.cableSettings = { connectors: [], nameFormat: ["[sideA] [arrow] [sideB] [length]"], extensionNameFormat: ["Удлинитель [length] м / [outlets] розетки"] };
    view.rerender(<AddModelSheet open onClose={vi.fn()} types={types} models={[]} />);
    expect(screen.getByText("Автоимя: Удлинитель 10 м / 4 розетки")).toBeTruthy();
    expect((screen.getByLabelText("Название модели") as HTMLInputElement).value).toBe("Удлинитель 10 м / 4 розетки");
    fireEvent.change(screen.getByLabelText("Сразу добавить единиц"), { target: { value: "2" } });
    expect((screen.getByLabelText("Короткая маркировка") as HTMLInputElement).value).toBe("E10m4s");
    fireEvent.click(screen.getByRole("button", { name: "Создать модель" }));
    expect(mocks.createModel).toHaveBeenCalledWith(expect.objectContaining({ name: "Удлинитель 10 м / 4 розетки", attrs: expect.objectContaining({ lengthM: 10, sideBQty: 4 }), initialUnits: { count: 2, assetTagPrefix: "E10m4s" } }), expect.any(Object));
  });

  it("prefills only available Schuko connectors and allows manual names and markings", () => {
    mocks.cableSettings = { connectors: ["Schuko plug male", "Schuko socket female"], nameFormat: ["[sideA] [arrow] [sideB] [length]"], extensionNameFormat: ["E[length]m[outlets]s"] };
    render(<AddModelSheet open onClose={vi.fn()} types={types} models={[]} />);
    fireEvent.click(screen.getByLabelText("Это удлинитель: хранить длину и розетки"));
    expect((screen.getByLabelText("Тип кабеля") as HTMLInputElement).value).toBe("Power");
    expect((screen.getByLabelText("Сторона A") as HTMLInputElement).value).toBe("Schuko plug male");
    expect((screen.getByLabelText("Сторона B") as HTMLInputElement).value).toBe("Schuko socket female");
    fireEvent.change(screen.getByLabelText("Длина, м"), { target: { value: "10" } });
    expect((screen.getByLabelText("Название модели") as HTMLInputElement).value).toBe("E10m1s");
    fireEvent.change(screen.getByLabelText("Название модели"), { target: { value: "Мой удлинитель" } });
    fireEvent.change(screen.getByLabelText("Длина, м"), { target: { value: "15" } });
    expect((screen.getByLabelText("Название модели") as HTMLInputElement).value).toBe("Мой удлинитель");
    fireEvent.change(screen.getByLabelText("Сразу добавить единиц"), { target: { value: "1" } });
    expect((screen.getByLabelText("Короткая маркировка") as HTMLInputElement).value).toBe("E15m1s");
    fireEvent.change(screen.getByLabelText("Короткая маркировка"), { target: { value: "CUSTOM" } });
    fireEvent.change(screen.getByLabelText("Длина, м"), { target: { value: "20" } });
    expect((screen.getByLabelText("Короткая маркировка") as HTMLInputElement).value).toBe("CUSTOM");
    fireEvent.click(screen.getByRole("button", { name: "Создать модель" }));
    expect(mocks.createModel).toHaveBeenCalledWith(expect.objectContaining({ name: "Мой удлинитель", initialUnits: { count: 1, assetTagPrefix: "CUSTOM" } }), expect.any(Object));
  });

  it("does not invent Schuko connectors when they are absent from settings", () => {
    mocks.cableSettings = { connectors: ["Schuko plug male", "XLR 3 pin male"], nameFormat: ["[sideA] [arrow] [sideB] [length]"], extensionNameFormat: ["E[length]m[outlets]s"] };
    render(<AddModelSheet open onClose={vi.fn()} types={types} models={[]} />);
    fireEvent.click(screen.getByLabelText("Это удлинитель: хранить длину и розетки"));
    expect((screen.getByLabelText("Сторона A") as HTMLInputElement).value).toBe("Schuko plug male");
    expect((screen.getByLabelText("Сторона B") as HTMLInputElement).value).toBe("");
  });

  it("does not carry an extension auto-name into a cable model after switching type", () => {
    mocks.cableSettings = { connectors: [], nameFormat: ["[type]-[length]"], extensionNameFormat: ["E[length]m[outlets]s"] };
    render(<AddModelSheet open onClose={vi.fn()} types={types} models={[]} />);
    fireEvent.click(screen.getByLabelText("Это удлинитель: хранить длину и розетки"));
    fireEvent.change(screen.getByLabelText("Длина, м"), { target: { value: "10" } });
    expect((screen.getByLabelText("Название модели") as HTMLInputElement).value).toBe("E10m1s");
    fireEvent.change(screen.getByLabelText("Тип", { selector: "select" }), { target: { value: "cable" } });
    expect((screen.getByPlaceholderText("Power-10m") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Создать модель" }));
    expect(mocks.createModel).toHaveBeenCalledWith(expect.objectContaining({ name: "Power-10m" }), expect.any(Object));
  });

  it("submits the configured cable name with adjacent placeholders", () => {
    mocks.cableSettings = { connectors: [], nameFormat: ["[type]-[length]"], extensionNameFormat: ["E[length]m[outlets]s"] };
    render(<AddModelSheet open onClose={vi.fn()} types={types} models={[]} />);
    fireEvent.change(screen.getByLabelText("Тип", { selector: "select" }), { target: { value: "cable" } });
    fireEvent.change(screen.getByLabelText("Тип кабеля"), { target: { value: "DMX" } });
    fireEvent.change(screen.getByLabelText("Длина, м"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать модель" }));
    expect(mocks.createModel).toHaveBeenCalledWith(expect.objectContaining({ name: "DMX-5m" }), expect.any(Object));
  });
});
