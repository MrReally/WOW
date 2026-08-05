import type { FastifyInstance } from "fastify";
import type { Transport } from "@sever/contracts";
import { z } from "zod";
import type { RouteContext } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";
import { env } from "../../env.js";

const fuelType = z.enum(["petrol", "diesel", "electric", "hybrid"]);
const vehicle = z.object({ plateNumber: z.string().trim().min(1), model: z.string().trim().min(1), requiredLicenseCategory: z.string().trim().min(1).max(4), fuelType, consumptionLPer100Km: z.number().nonnegative().max(100) });
const quote = z.object({ originAddress: z.string().trim().min(1), destinationAddress: z.string().trim().min(1), vehicleId: z.string().uuid(), fuelPriceEURPerL: z.number().nonnegative(), roundTrip: z.boolean().optional(), distanceKmOverride: z.number().positive().nullable().optional() });

export function registerTransportRoutes(app: FastifyInstance, ctx: RouteContext, service: Transport.TransportService) {
  app.get("/api/transport/config", async (req) => { await ctx.auth(req); return { googleMapsConfigured: !!env.googleMapsApiKey }; });
  app.get<{ Querystring: { includeInactive?: string } }>("/api/transport/vehicles", async (req) => { await ctx.auth(req); return service.listVehicles(req.query.includeInactive === "true"); });
  app.post("/api/transport/vehicles", async (req) => { const auth = await ctx.auth(req); requirePermission(auth, "finance.manage", "projects.manage"); return service.createVehicle(vehicle.parse(req.body)); });
  app.patch<{ Params: { id: string } }>("/api/transport/vehicles/:id", async (req) => { const auth = await ctx.auth(req); requirePermission(auth, "finance.manage", "projects.manage"); return service.updateVehicle(req.params.id, vehicle.partial().extend({ active: z.boolean().optional() }).parse(req.body)); });
  app.post("/api/transport/route-quote", async (req) => { const auth = await ctx.auth(req); requirePermission(auth, "finance.view", "projects.view"); return service.quoteRoute(quote.parse(req.body)); });
}
