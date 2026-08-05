import type { Venues } from "@sever/contracts";
import { one, query, type Sql } from "../../core/db.js";
import { BadRequest, NotFound } from "../../core/errors.js";
import type { SeverModule } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../env.js";

const migration = `
CREATE SCHEMA IF NOT EXISTS venues;
CREATE TABLE IF NOT EXISTS venues.venues (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  address    text,
  notes      text,
  width_m    numeric(8,2),
  depth_m    numeric(8,2),
  is_venue boolean NOT NULL DEFAULT true,
  is_warehouse boolean NOT NULL DEFAULT false,
  contacts text,
  working_hours text,
  google_place_id text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  address_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE venues.venues ADD COLUMN IF NOT EXISTS is_venue boolean NOT NULL DEFAULT true;
ALTER TABLE venues.venues ADD COLUMN IF NOT EXISTS is_warehouse boolean NOT NULL DEFAULT false;
ALTER TABLE venues.venues ADD COLUMN IF NOT EXISTS contacts text;
ALTER TABLE venues.venues ADD COLUMN IF NOT EXISTS working_hours text;
ALTER TABLE venues.venues ADD COLUMN IF NOT EXISTS google_place_id text;
ALTER TABLE venues.venues ADD COLUMN IF NOT EXISTS latitude numeric(10,7);
ALTER TABLE venues.venues ADD COLUMN IF NOT EXISTS longitude numeric(10,7);
ALTER TABLE venues.venues ADD COLUMN IF NOT EXISTS address_verified boolean NOT NULL DEFAULT false;
`;

interface Row {
  id: string;
  name: string;
  address: string | null;
  notes: string | null;
  width_m: string | null;
  depth_m: string | null;
  is_venue: boolean;
  is_warehouse: boolean;
  contacts: string | null;
  working_hours: string | null;
  google_place_id: string | null;
  latitude: string | null;
  longitude: string | null;
  address_verified: boolean;
  created_at: Date;
}
const toDTO = (r: Row): Venues.VenueDTO => ({
  id: r.id,
  name: r.name,
  address: r.address,
  notes: r.notes,
  widthM: r.width_m === null ? null : Number(r.width_m),
  depthM: r.depth_m === null ? null : Number(r.depth_m),
  isVenue: r.is_venue,
  isWarehouse: r.is_warehouse,
  contacts: r.contacts,
  workingHours: r.working_hours,
  googlePlaceId: r.google_place_id,
  latitude: r.latitude === null ? null : Number(r.latitude),
  longitude: r.longitude === null ? null : Number(r.longitude),
  addressVerified: r.address_verified,
  createdAt: r.created_at.toISOString(),
});

function createService(db: Sql): Venues.VenuesService {
  return {
    async list() {
      const rows = await query<Row>(db, `SELECT * FROM venues.venues ORDER BY name`);
      return rows.map(toDTO);
    },
    async get(id) {
      const row = await one<Row>(db, `SELECT * FROM venues.venues WHERE id=$1`, [id]);
      return row ? toDTO(row) : null;
    },
    async create(input) {
      const row = await one<Row>(
        db,
        `INSERT INTO venues.venues
          (name,address,notes,width_m,depth_m,is_venue,is_warehouse,contacts,working_hours,google_place_id,latitude,longitude,address_verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [input.name,input.address??null,input.notes??null,input.widthM??null,input.depthM??null,input.isVenue??true,input.isWarehouse??false,input.contacts??null,input.workingHours??null,input.googlePlaceId??null,input.latitude??null,input.longitude??null,input.addressVerified??false]
      );
      return toDTO(row!);
    },
    async update(id, input) {
      const existing = await this.get(id);
      if (!existing) throw NotFound("venue", id);
      const row = await one<Row>(
        db,
        `UPDATE venues.venues SET
           name=COALESCE($2,name), address=$3, notes=$4, width_m=$5, depth_m=$6,
           is_venue=$7,is_warehouse=$8,contacts=$9,working_hours=$10,google_place_id=$11,
           latitude=$12,longitude=$13,address_verified=$14
         WHERE id=$1 RETURNING *`,
        [
          id,
          input.name ?? null,
          input.address === undefined ? existing.address : input.address,
          input.notes === undefined ? existing.notes : input.notes,
          input.widthM === undefined ? existing.widthM : input.widthM,
          input.depthM === undefined ? existing.depthM : input.depthM,
          input.isVenue === undefined ? existing.isVenue : input.isVenue,
          input.isWarehouse === undefined ? existing.isWarehouse : input.isWarehouse,
          input.contacts === undefined ? existing.contacts : input.contacts,
          input.workingHours === undefined ? existing.workingHours : input.workingHours,
          input.googlePlaceId === undefined ? existing.googlePlaceId : input.googlePlaceId,
          input.latitude === undefined ? existing.latitude : input.latitude,
          input.longitude === undefined ? existing.longitude : input.longitude,
          input.addressVerified === undefined ? existing.addressVerified : input.addressVerified,
        ]
      );
      return toDTO(row!);
    },
  };
}

const createSchema = z.object({
  name: z.string().min(1),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  widthM: z.number().nullable().optional(),
  depthM: z.number().nullable().optional(),
  isVenue: z.boolean().optional(),
  isWarehouse: z.boolean().optional(),
  contacts: z.string().nullable().optional(),
  workingHours: z.string().nullable().optional(),
  googlePlaceId: z.string().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  addressVerified: z.boolean().optional(),
});

export function createVenuesModule(db: Sql): SeverModule<Venues.VenuesService> {
  const service = createService(db);
  return {
    name: "venues",
    migration,
    service,
    registerRoutes: (app: FastifyInstance, ctx) => {
      app.get("/api/venues", async (req) => {
        await ctx.auth(req);
        return service.list();
      });
      app.get<{ Querystring: { q?: string } }>("/api/places/address-suggestions", async (req) => {
        await ctx.auth(req);
        const input = (req.query.q ?? "").trim();
        if (!env.googleMapsApiKey || input.length < 3) return [];
        const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": env.googleMapsApiKey },
          body: JSON.stringify({ input, languageCode: "ru" }),
        });
        if (!response.ok) throw BadRequest("Google Places не вернул подсказки адреса");
        const data = await response.json() as { suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string } } }[] };
        return (data.suggestions ?? []).flatMap((item) => item.placePrediction?.placeId && item.placePrediction.text?.text
          ? [{ placeId: item.placePrediction.placeId, label: item.placePrediction.text.text }]
          : []);
      });
      app.get<{ Params: { placeId: string } }>("/api/places/address/:placeId", async (req) => {
        await ctx.auth(req);
        if (!env.googleMapsApiKey) throw BadRequest("Google Maps не настроен");
        const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(req.params.placeId)}`, {
          headers: { "X-Goog-Api-Key": env.googleMapsApiKey, "X-Goog-FieldMask": "id,formattedAddress,location" },
        });
        if (!response.ok) throw BadRequest("Google Places не подтвердил адрес");
        const data = await response.json() as { id: string; formattedAddress: string; location: { latitude: number; longitude: number } };
        return { placeId: data.id, address: data.formattedAddress, latitude: data.location.latitude, longitude: data.location.longitude };
      });
      app.post("/api/venues", async (req) => {
        const auth = await ctx.auth(req);
        requirePermission(auth, "venues.manage");
        return service.create(createSchema.parse(req.body));
      });
      app.patch<{ Params: { id: string } }>("/api/venues/:id", async (req) => {
        const auth = await ctx.auth(req);
        requirePermission(auth, "venues.manage");
        return service.update(req.params.id, createSchema.partial().parse(req.body));
      });
    },
  };
}
