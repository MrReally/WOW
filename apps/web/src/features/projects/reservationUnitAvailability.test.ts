import { describe, expect, it } from "vitest";
import type { Equipment, Projects } from "@sever/contracts";
import { getReservationUnitAvailability } from "./reservationUnitAvailability.ts";

const unit = { id: "unit", assetTag: "SP-001", modelId: "model", status: "on_project", currentProjectId: "current" } as Equipment.EquipmentUnitDTO;
const target = { id: "target-reservation", projectId: "target", modelId: "model", qty: 1, isReserve: false, startsAt: "2026-08-12T10:00:00.000Z", endsAt: "2026-08-12T12:00:00.000Z", resolvedUnitIds: [], createdAt: "2026-08-01T10:00:00.000Z" } as Projects.ReservationDTO;
const project = (startsAt: string, endsAt: string) => ({ id: "current", name: "Space X Wedding", startsAt, endsAt }) as Projects.ProjectDTO;

describe("reservation unit availability", () => {
  it("allows a unit that is currently away when it returns before the future event", () => {
    const result = getReservationUnitAvailability(unit, target, [], [project("2026-08-10T10:00:00.000Z", "2026-08-10T12:00:00.000Z")]);
    expect(result).toEqual({ reason: null, currentlyAway: true, currentProjectName: "Space X Wedding" });
  });

  it("shows and blocks the project that occupies the requested time", () => {
    const result = getReservationUnitAvailability(unit, target, [], [project("2026-08-12T11:00:00.000Z", "2026-08-12T13:00:00.000Z")]);
    expect(result.reason).toBe("Уже забронировано на «Space X Wedding»");
  });
});
