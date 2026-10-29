import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectWizardSheet } from "../src/features/projects/components/ProjectWizardSheet.tsx";

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  loadInvoice: vi.fn(),
  equipmentModels: [
    { id: "model-shure", name: "SM58", manufacturer: "Shure" },
    { id: "model-sennheiser", name: "e 835", manufacturer: "Sennheiser" },
    { id: "model-yamaha", name: "DXR12", manufacturer: "Yamaha" },
  ],
  idleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../src/features/projects/hooks.ts", () => ({
  useClients: () => ({ data: [{ id: "client-1", name: "Клиент" }] }),
  useVenues: () => ({ data: [] }),
  useEquipmentModels: () => ({ data: mocks.equipmentModels, isLoading: false }),
  useEquipmentTypes: () => ({ data: [] }),
  useEquipmentStorageZones: () => ({ data: [] }),
  useAllUnits: () => ({ data: [] }),
  useEquipmentModelAvailability: () => ({ data: {}, isLoading: false }),
  useContractors: () => ({ data: [] }),
  useCreateClient: mocks.idleMutation,
  useCreateProject: () => ({ mutateAsync: mocks.createProject, isPending: false }),
  useCreateReservation: mocks.idleMutation,
  useCreateProjectRole: mocks.idleMutation,
  useAddContractorItem: mocks.idleMutation,
  useCreateContractor: mocks.idleMutation,
}));

vi.mock("../src/features/plans/hooks.ts", () => ({
  useVenues: () => ({ data: [] }),
  useCreateVenue: mocks.idleMutation,
}));

vi.mock("../src/features/settings/hooks.ts", () => ({
  useDressCodeOptions: () => ({ data: [] }),
}));

vi.mock("../src/app/session.ts", () => ({
  useSession: () => ({ can: () => true }),
}));

vi.mock("../src/features/places/AddressInput.tsx", () => ({
  AddressInput: () => null,
}));

vi.mock("../src/features/projects/components/RoleEngagementPicker.tsx", () => ({
  RoleEngagementPicker: () => null,
}));

vi.mock("../src/lib/api.ts", () => ({
  api: {
    get: mocks.loadInvoice,
    put: vi.fn(),
  },
}));

describe("ProjectWizardSheet completion", () => {
  beforeEach(() => {
    mocks.createProject.mockReset();
    mocks.loadInvoice.mockReset();
  });

  it("shows the created-project screen even when optional setup fails afterwards", async () => {
    const user = userEvent.setup();
    mocks.createProject.mockResolvedValue({ id: "project-1", name: "Новый проект" });
    mocks.loadInvoice.mockRejectedValue(new Error("invoice failed"));

    render(
      <MemoryRouter>
        <ProjectWizardSheet open onClose={vi.fn()} />
      </MemoryRouter>,
    );

    await user.type(screen.getByPlaceholderText("Villa Viko · 12/06"), "Новый проект");
    await user.click(screen.getByRole("button", { name: "Дальше" }));
    await user.selectOptions(screen.getByRole("combobox"), "client-1");
    await user.click(screen.getByRole("button", { name: "Дальше" }));

    for (let optionalStep = 0; optionalStep < 6; optionalStep += 1) {
      await user.click(screen.getByRole("button", { name: "Пропустить" }));
    }

    await user.click(screen.getByRole("button", { name: "Создать проект" }));

    expect(await screen.findByText("Проект создан")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Открыть проект" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Создать проект" })).toBeNull();
    expect(await screen.findByText(/часть дополнительных данных не сохранилась/i)).toBeTruthy();
    expect(mocks.createProject).toHaveBeenCalledTimes(1);
  });

  it("filters reservation models by model name or manufacturer", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ProjectWizardSheet open onClose={vi.fn()} />
      </MemoryRouter>,
    );

    await user.type(screen.getByPlaceholderText("Villa Viko · 12/06"), "Новый проект");
    await user.click(screen.getByRole("button", { name: "Дальше" }));
    await user.selectOptions(screen.getByRole("combobox"), "client-1");
    await user.click(screen.getByRole("button", { name: "Дальше" }));
    await user.click(screen.getByRole("button", { name: "Пропустить" }));
    await user.click(screen.getByRole("button", { name: "Пропустить" }));

    const search = screen.getByRole("searchbox", { name: "Поиск оборудования для брони" });
    expect(screen.getByText("SM58")).toBeTruthy();
    expect(screen.getByText("e 835")).toBeTruthy();

    await user.type(search, "shure");
    expect(screen.getByText("SM58")).toBeTruthy();
    expect(screen.queryByText("e 835")).toBeNull();

    await user.clear(search);
    await user.type(search, "dxr");
    expect(screen.getByText("DXR12")).toBeTruthy();
    expect(screen.queryByText("SM58")).toBeNull();
  });
});
