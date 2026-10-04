import type { ID, ISODateTime } from "./common.js";

export type FuelType = "petrol" | "diesel" | "electric" | "hybrid";

export interface VehicleDTO {
  id: ID;
  plateNumber: string;
  model: string;
  requiredLicenseCategory: string;
  fuelType: FuelType;
  consumptionLPer100Km: number;
  depreciationEURPerKm: number;
  active: boolean;
  createdAt: ISODateTime;
}

export interface CreateVehicleInput {
  plateNumber: string;
  model: string;
  requiredLicenseCategory: string;
  fuelType: FuelType;
  consumptionLPer100Km: number;
  depreciationEURPerKm?: number;
}

export type UpdateVehicleInput = Partial<CreateVehicleInput> & { active?: boolean };

export interface RouteQuoteInput {
  originAddress: string;
  destinationAddress: string;
  vehicleId: ID;
  /** Manual fallback/override. When omitted, the current official Serbian price is used. */
  fuelPriceEURPerL?: number;
  /** Current configured SEVER rate: 1 RSD = rateToEUR EUR. */
  rsdRateToEUR?: number;
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
  fuelPriceEURPerL: number;
  fuelPriceRSDPerL: number | null;
  fuelPriceSource: "serbia_ministry" | "manual" | "not_applicable";
  fuelPriceSourceUrl: string | null;
  fuelCostEUR: number;
  depreciationEURPerKm: number;
  depreciationCostEUR: number;
  totalCostEUR: number;
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
