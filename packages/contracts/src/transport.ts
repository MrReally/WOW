import type { ID, ISODateTime } from "./common.js";

export type FuelType = "petrol" | "diesel" | "electric" | "hybrid";

export interface VehicleDTO {
  id: ID;
  plateNumber: string;
  model: string;
  requiredLicenseCategory: string;
  fuelType: FuelType;
  consumptionLPer100Km: number;
  active: boolean;
  createdAt: ISODateTime;
}

export interface CreateVehicleInput {
  plateNumber: string;
  model: string;
  requiredLicenseCategory: string;
  fuelType: FuelType;
  consumptionLPer100Km: number;
}

export type UpdateVehicleInput = Partial<CreateVehicleInput> & { active?: boolean };

export interface RouteQuoteInput {
  originAddress: string;
  destinationAddress: string;
  vehicleId: ID;
  fuelPriceEURPerL: number;
  roundTrip?: boolean;
  /** Allows calculation before Google is configured or for a manually corrected route. */
  distanceKmOverride?: number | null;
}

export interface RouteQuoteDTO {
  vehicleId: ID;
  distanceKm: number;
  durationMinutes: number | null;
  roundTrip: boolean;
  fuelLitres: number;
  fuelCostEUR: number;
  source: "google" | "manual";
}

export interface TransportConfigDTO {
  googleMapsConfigured: boolean;
}

export interface TransportService {
  listVehicles(includeInactive?: boolean): Promise<VehicleDTO[]>;
  createVehicle(input: CreateVehicleInput): Promise<VehicleDTO>;
  updateVehicle(id: ID, input: UpdateVehicleInput): Promise<VehicleDTO>;
  quoteRoute(input: RouteQuoteInput): Promise<RouteQuoteDTO>;
}
