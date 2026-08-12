import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Equipment } from "@sever/contracts";
import { EquipmentUnitSearch } from "../src/features/backoffice/EquipmentUnitSearch.tsx";

const model = { id: "model-1", typeId: "type-1", trackingMode: "serial", name: "MegaPointe", manufacturer: "Robe", imageUrl: null, unitCostEUR: 0, dailyPriceEUR: 0, attrs: {}, requiredComponentModelIds: [], createdAt: "2026-08-12T00:00:00.000Z" } as Equipment.EquipmentModelDTO;
const unit = { id: "unit-1", modelId: model.id, assetTag: "LIGHT-001", serial: "RB-9001", status: "in_stock", warehouseId: null, zoneId: null, currentProjectId: null, notes: null, createdAt: "2026-08-12T00:00:00.000Z" } as Equipment.EquipmentUnitDTO;

describe("EquipmentUnitSearch", () => {
  it("immediately selects an exact number pasted in one action", () => {
    const onSelect = vi.fn();
    render(<EquipmentUnitSearch ariaLabel="Поиск прибора" units={[unit]} models={[model]} onSelect={onSelect} />);
    fireEvent.paste(screen.getByLabelText("Поиск прибора"), { clipboardData: { getData: () => "LIGHT-001" } });
    expect(onSelect).toHaveBeenCalledWith(unit);
    expect((screen.getByLabelText("Поиск прибора") as HTMLInputElement).value).toBe("");
  });

  it("recognizes a fast character burst from a barcode scanner", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T00:00:00.000Z"));
    const onSelect = vi.fn();
    render(<EquipmentUnitSearch ariaLabel="Поиск прибора" units={[unit]} models={[model]} onSelect={onSelect} />);
    const input = screen.getByLabelText("Поиск прибора");
    [..."RB-9001"].forEach((_, index) => {
      fireEvent.change(input, { target: { value: "RB-9001".slice(0, index + 1) } });
      vi.advanceTimersByTime(10);
    });
    expect(onSelect).toHaveBeenCalledWith(unit);
    vi.useRealTimers();
  });

  it("waits for Enter when the exact number is typed manually", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T00:00:00.000Z"));
    const onSelect = vi.fn();
    render(<EquipmentUnitSearch ariaLabel="Поиск прибора" units={[unit]} models={[model]} onSelect={onSelect} />);
    const input = screen.getByLabelText("Поиск прибора");
    [..."LIGHT-001"].forEach((_, index) => {
      fireEvent.change(input, { target: { value: "LIGHT-001".slice(0, index + 1) } });
      vi.advanceTimersByTime(80);
    });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(unit);
    vi.useRealTimers();
  });

  it("shows manufacturer and model matches and waits for a choice", async () => {
    const onSelect = vi.fn();
    render(<EquipmentUnitSearch ariaLabel="Поиск прибора" units={[unit]} models={[model]} onSelect={onSelect} />);
    await userEvent.type(screen.getByLabelText("Поиск прибора"), "Robe");
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("option", { name: /Robe.*MegaPointe.*LIGHT-001/ })).toBeTruthy();
    await userEvent.click(screen.getByRole("option"));
    expect(onSelect).toHaveBeenCalledWith(unit);
  });
});
