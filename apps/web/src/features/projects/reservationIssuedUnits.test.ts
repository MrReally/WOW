import { describe, expect, it } from "vitest";
import type { Equipment, Projects } from "@sever/contracts";
import { ISSUED_RESERVATION_DELETE_ERROR, issuedUnitsForReservation } from "./reservationIssuedUnits.ts";

const reservation = {
  projectId: "kaif-ladys",
  resolvedUnitIds: ["akg-sr40-1"],
} as Pick<Projects.ReservationDTO, "projectId" | "resolvedUnitIds">;

const unit = (id: string, currentProjectId: string | null): Equipment.EquipmentUnitDTO => ({
  id,
  modelId: "akg-sr40",
  assetTag: id,
  serial: null,
  status: currentProjectId ? "on_project" : "in_stock",
  warehouseId: null,
  zoneId: null,
  installedVenueId: null,
  currentProjectId,
  notes: null,
  createdAt: "2026-08-15T00:00:00.000Z",
});

describe("issuedUnitsForReservation", () => {
  it("provides an explicit English explanation for the delete protection", () => {
    expect(ISSUED_RESERVATION_DELETE_ERROR).toBe(
      "This reservation cannot be deleted because equipment assigned to it is currently issued to this project. Return the equipment before deleting the reservation.",
    );
  });

  it("does not attribute an issued unit to another reservation of the same model", () => {
    const units = [
      unit("akg-sr40-1", "kaif-ladys"),
      unit("akg-sr40-2", "kaif-ladys"),
    ];

    expect(issuedUnitsForReservation(reservation, units).map((item) => item.id)).toEqual(["akg-sr40-1"]);
    expect(issuedUnitsForReservation({ ...reservation, resolvedUnitIds: ["akg-sr40-2"] }, units).map((item) => item.id)).toEqual(["akg-sr40-2"]);
    expect(issuedUnitsForReservation({ ...reservation, resolvedUnitIds: [] }, units)).toEqual([]);
  });

  it("ignores an assigned unit that is not currently issued to this project", () => {
    expect(issuedUnitsForReservation(reservation, [unit("akg-sr40-1", null)])).toEqual([]);
    expect(issuedUnitsForReservation(reservation, [unit("akg-sr40-1", "another-project")])).toEqual([]);
  });
});
