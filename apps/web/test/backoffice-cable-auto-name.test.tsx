import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Equipment } from "@sever/contracts";

const mocks = vi.hoisted(() => ({
  createModel: vi.fn(),
  cableSettings: null as Equipment.CableSettingsDTO | null,
}));

vi.mock("../src/app/session.ts", () => ({ useSession: () => ({ user: { id: "owner", displayName: "Тест" }, can: () => true }) }));
vi.mock("../src/app/theme.tsx", () => ({ useTheme: () => ({ theme: "light", toggle: vi.fn() }) }));
vi.mock("../src/features/backoffice/ResizableSplit.tsx", () => ({ useBackofficeSplitResize: () => {} }));
vi.mock("../src/features/backoffice/hooks.ts", () => ({
  useBackofficeAppearance: () => ({ view: "classic", selectView: vi.fn() }),
  useBackofficeCommands: () => ({}),
  useBackofficeData: () => ({
    types: { data: [{ id: "cable", name: "Кабели", trackingMode: "cable" }] },
    models: { data: [] }, categories: { data: [] }, warehouses: { data: [] }, storageZones: { data: [] },
  }),
}));
vi.mock("../src/features/warehouse/hooks.ts", () => ({
  useCableConnectors: () => ({ data: [] }),
  useCableSettings: () => ({ data: mocks.cableSettings }),
  useCreateModel: () => ({ mutateAsync: mocks.createModel, isPending: false }),
  useSetModelStock: () => ({ mutateAsync: vi.fn() }),
  useModelStock: () => ({ data: null }),
  useModelStockAtWarehouse: () => ({ data: null }),
  useTransferQty: () => ({ mutate: vi.fn(), isPending: false }),
  useRepairQty: () => ({ mutate: vi.fn(), isPending: false }),
  useServiceQty: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { BackofficePage } from "../src/features/backoffice/BackofficePage.tsx";

describe("Backoffice cable creation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.createModel.mockReset();
    mocks.createModel.mockResolvedValue({ id: "created" });
    mocks.cableSettings = null;
  });

  it("uses the saved template in preview and the model creation request", async () => {
    const view = render(<MemoryRouter initialEntries={["/backoffice?domain=cables"]}><BackofficePage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "+ Тип кабеля" }));
    fireEvent.change(screen.getByLabelText("Тип кабеля"), { target: { value: "DMX" } });
    fireEvent.change(screen.getByLabelText("Длина кабеля"), { target: { value: "12" } });
    expect((screen.getByRole("button", { name: "Создать" }) as HTMLButtonElement).disabled).toBe(true);

    mocks.cableSettings = { connectors: [], nameFormat: ["[type]-[length]"], extensionNameFormat: ["E[length]m[outlets]s"] };
    view.rerender(<MemoryRouter initialEntries={["/backoffice?domain=cables"]}><BackofficePage /></MemoryRouter>);
    expect(screen.getByText("Автоимя: DMX-12m")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Создать" }));
    await waitFor(() => expect(mocks.createModel).toHaveBeenCalledWith(expect.objectContaining({ name: "DMX-12m", attrs: expect.objectContaining({ cableType: "DMX", lengthM: 12 }) })));
  });
});
