import type { Equipment, Projects } from "@sever/contracts";

export interface ReservationUnitAvailability {
  reason: string | null;
  currentlyAway: boolean;
  currentProjectName: string | null;
}

export function getReservationUnitAvailability(
  unit: Equipment.EquipmentUnitDTO,
  reservation: Projects.ReservationDTO,
  overlappingReservations: Projects.ReservationDTO[],
  projects: Projects.ProjectDTO[],
): ReservationUnitAvailability {
  if (!reservation.startsAt || !reservation.endsAt) {
    return { reason: "Дата проекта не указана", currentlyAway: false, currentProjectName: null };
  }
  const projectName = (projectId: string | null | undefined) => projects.find((project) => project.id === projectId)?.name ?? "другой проект";
  const reservationClash = overlappingReservations.find((item) => item.id !== reservation.id && item.resolvedUnitIds.includes(unit.id));
  if (reservationClash) return { reason: `Уже забронировано на «${projectName(reservationClash.projectId)}»`, currentlyAway: unit.status === "on_project", currentProjectName: null };

  if (unit.status === "in_repair") return { reason: "В ремонте", currentlyAway: false, currentProjectName: null };
  if (unit.status === "at_contractor") return { reason: "У подрядчика", currentlyAway: false, currentProjectName: null };
  if (unit.status === "lost") return { reason: "Утеряно", currentlyAway: false, currentProjectName: null };

  const currentlyAway = unit.status === "on_project" && !!unit.currentProjectId && unit.currentProjectId !== reservation.projectId;
  if (!currentlyAway) return { reason: null, currentlyAway: false, currentProjectName: null };
  const currentProject = projects.find((project) => project.id === unit.currentProjectId);
  if (!currentProject || !currentProject.startsAt || !currentProject.endsAt || (Date.parse(currentProject.startsAt) < Date.parse(reservation.endsAt) && Date.parse(currentProject.endsAt) > Date.parse(reservation.startsAt))) {
    return { reason: `Уже забронировано на «${currentProject?.name ?? "другой проект"}»`, currentlyAway: true, currentProjectName: currentProject?.name ?? null };
  }
  return { reason: null, currentlyAway: true, currentProjectName: currentProject.name };
}
