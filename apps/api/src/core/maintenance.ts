let maintenanceReason: string | null = null;

export function startMaintenance(reason: string): void {
  maintenanceReason = reason;
}

export function stopMaintenance(): void {
  maintenanceReason = null;
}

export function getMaintenanceReason(): string | null {
  return maintenanceReason;
}
