import type { Transport } from "@sever/contracts";
import { one, query, type Sql } from "../../core/db.js";
import { BadRequest, NotFound } from "../../core/errors.js";
import { env } from "../../env.js";

interface VehicleRow {
  id: string;
  plate_number: string;
  model: string;
  required_license_category: string;
  fuel_type: Transport.FuelType;
  consumption_l_per_100_km: string;
  active: boolean;
  created_at: Date;
}

const dto = (row: VehicleRow): Transport.VehicleDTO => ({
  id: row.id,
  plateNumber: row.plate_number,
  model: row.model,
  requiredLicenseCategory: row.required_license_category,
  fuelType: row.fuel_type,
  consumptionLPer100Km: Number(row.consumption_l_per_100_km),
  active: row.active,
  createdAt: row.created_at.toISOString(),
});

export function createTransportService(db: Sql): Transport.TransportService {
  const get = async (id: string) => {
    const row = await one<VehicleRow>(db, `SELECT * FROM transport.vehicles WHERE id=$1`, [id]);
    if (!row) throw NotFound("vehicle", id);
    return row;
  };
  return {
    async listVehicles(includeInactive = false) {
      const rows = await query<VehicleRow>(db, `SELECT * FROM transport.vehicles ${includeInactive ? "" : "WHERE active=true"} ORDER BY active DESC, plate_number`);
      return rows.map(dto);
    },
    async createVehicle(input) {
      const row = await one<VehicleRow>(db, `INSERT INTO transport.vehicles
        (plate_number,model,required_license_category,fuel_type,consumption_l_per_100_km)
        VALUES ($1,$2,$3,$4,$5) RETURNING *`, [input.plateNumber.toUpperCase(), input.model, input.requiredLicenseCategory.toUpperCase(), input.fuelType, input.consumptionLPer100Km]);
      return dto(row!);
    },
    async updateVehicle(id, input) {
      const current = await get(id);
      const row = await one<VehicleRow>(db, `UPDATE transport.vehicles SET
        plate_number=$2,model=$3,required_license_category=$4,fuel_type=$5,consumption_l_per_100_km=$6,active=$7
        WHERE id=$1 RETURNING *`, [id, input.plateNumber?.toUpperCase() ?? current.plate_number, input.model ?? current.model, input.requiredLicenseCategory?.toUpperCase() ?? current.required_license_category, input.fuelType ?? current.fuel_type, input.consumptionLPer100Km ?? Number(current.consumption_l_per_100_km), input.active ?? current.active]);
      return dto(row!);
    },
    async quoteRoute(input) {
      const vehicle = dto(await get(input.vehicleId));
      let distanceKm: number;
      let durationMinutes: number | null = null;
      let source: "google" | "manual";
      if (input.distanceKmOverride != null) {
        distanceKm = input.distanceKmOverride;
        source = "manual";
      } else {
        if (!env.googleMapsApiKey) throw BadRequest("Google Maps не настроен — укажите километраж вручную");
        const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": env.googleMapsApiKey,
            "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
          },
          body: JSON.stringify({ origin: { address: input.originAddress }, destination: { address: input.destinationAddress }, travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE" }),
        });
        if (!response.ok) throw BadRequest("Google Routes не смог рассчитать маршрут");
        const data = await response.json() as { routes?: { distanceMeters?: number; duration?: string }[] };
        const route = data.routes?.[0];
        if (!route?.distanceMeters) throw BadRequest("Маршрут не найден");
        distanceKm = route.distanceMeters / 1000;
        durationMinutes = route.duration ? Math.round(Number.parseFloat(route.duration) / 60) : null;
        source = "google";
      }
      const multiplier = input.roundTrip === false ? 1 : 2;
      distanceKm = Math.round(distanceKm * multiplier * 10) / 10;
      if (durationMinutes != null) durationMinutes *= multiplier;
      const fuelLitres = Math.round(distanceKm * vehicle.consumptionLPer100Km) / 100;
      const fuelCostEUR = Math.round(fuelLitres * input.fuelPriceEURPerL * 100) / 100;
      return { vehicleId: vehicle.id, distanceKm, durationMinutes, roundTrip: multiplier === 2, fuelLitres: Math.round(fuelLitres * 100) / 100, fuelCostEUR, source };
    },
  };
}
