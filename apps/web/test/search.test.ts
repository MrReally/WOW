import { describe, expect, it } from "vitest";
import type { Equipment, People } from "@sever/contracts";
import { contractorMatches, equipmentModelMatches, equipmentUnitMatches, personMatches } from "../src/lib/search.ts";

const type = { id: "type-1", name: "Радиосистемы", trackingMode: "serial", createdAt: "" } as Equipment.EquipmentTypeDTO;
const model = {
  id: "model-1",
  typeId: type.id,
  trackingMode: "serial",
  name: "EW 100 G4",
  manufacturer: "Sennheiser",
  imageUrl: null,
  unitCostEUR: 0,
  dailyPriceEUR: 0,
  attrs: { sideAConnector: "BNC", sideBConnector: "XLR" },
  requiredComponentModelIds: [],
  createdAt: "",
} as Equipment.EquipmentModelDTO;
const zone = { id: "zone-1", warehouseId: "warehouse-1", parentId: null, name: "Стеллаж радио", code: "RF-01", kind: "rack", active: true, sortOrder: 0, createdAt: "" } as Equipment.StorageZoneDTO;
const unit = { id: "unit-1", modelId: model.id, assetTag: "RF-007", serial: "SN-ABC", status: "in_stock", warehouseId: "warehouse-1", zoneId: zone.id, currentProjectId: null, installedVenueId: null, notes: null, createdAt: "" } as Equipment.EquipmentUnitDTO;
const equipment = { models: [model], types: [type], units: [unit], zones: [zone] };

describe("shared search", () => {
  it.each(["ew 100", "SENNHEISER", "радиосистемы", "rf-007", "sn-abc", "СТЕЛЛАЖ", "rf-01", "bnc", "XLR"])(
    "finds equipment by %s without regard to case",
    (query) => {
      expect(equipmentModelMatches(model, query, equipment)).toBe(true);
      expect(equipmentUnitMatches(unit, query, equipment)).toBe(true);
    },
  );

  it.each(["иван", "ПЕТРОВ", "техник", "PERSON@EXAMPLE.COM", "telegram_user", "VANYA", "+38160123456"])(
    "finds a person by %s without regard to case",
    (query) => {
      const person = {
        displayName: "Иван Петров",
        firstName: "Иван",
        lastName: "Петров",
        patronymic: null,
        roleName: "Техник",
        email: "person@example.com",
        telegramUsername: "telegram_user",
        nickname: "Vanya",
        phone: "+38160123456",
      } as People.UserDTO;
      expect(personMatches(person, query)).toBe(true);
    },
  );

  it("finds contractors by name and contacts without regard to case", () => {
    const contractor = { id: "contractor-1", name: "Audio Rent", contacts: "OFFICE@AUDIO.RS · +38160000", createdAt: "" };
    expect(contractorMatches(contractor, "audio rent")).toBe(true);
    expect(contractorMatches(contractor, "office@audio.rs")).toBe(true);
  });
});
