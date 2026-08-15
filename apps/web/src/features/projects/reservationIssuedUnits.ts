import type { Equipment, Projects } from "@sever/contracts";

export const ISSUED_RESERVATION_DELETE_ERROR =
  "This reservation cannot be deleted because equipment assigned to it is currently issued to this project. Return the equipment before deleting the reservation.";

export function issuedUnitsForReservation(
  reservation: Pick<Projects.ReservationDTO, "projectId" | "resolvedUnitIds">,
  units: Equipment.EquipmentUnitDTO[],
): Equipment.EquipmentUnitDTO[] {
  const assignedUnitIds = new Set(reservation.resolvedUnitIds);
  return units.filter((unit) =>
    assignedUnitIds.has(unit.id)
    && unit.status === "on_project"
    && unit.currentProjectId === reservation.projectId
  );
}
