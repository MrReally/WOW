import type { Venues } from "@sever/contracts";
import { one, query, type Sql } from "../../core/db.js";
import { NotFound } from "../../core/errors.js";
import type { SeverModule } from "../../core/module.js";
import { requirePermission } from "../../core/auth.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const migration = `
CREATE SCHEMA IF NOT EXISTS venues;
CREATE TABLE IF NOT EXISTS venues.venues (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  address    text,
  notes      text,
  width_m    numeric(8,2),
  depth_m    numeric(8,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

interface Row {
  id: string;
  name: string;
  address: string | null;
  notes: string | null;
  width_m: string | null;
  depth_m: string | null;
  created_at: Date;
}
const toDTO = (r: Row): Venues.VenueDTO => ({
  id: r.id,
  name: r.name,
  address: r.address,
  notes: r.notes,
  widthM: r.width_m === null ? null : Number(r.width_m),
  depthM: r.depth_m === null ? null : Number(r.depth_m),
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
        `INSERT INTO venues.venues (name, address, notes, width_m, depth_m) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [input.name, input.address ?? null, input.notes ?? null, input.widthM ?? null, input.depthM ?? null]
      );
      return toDTO(row!);
    },
    async update(id, input) {
      const existing = await this.get(id);
      if (!existing) throw NotFound("venue", id);
      const row = await one<Row>(
        db,
        `UPDATE venues.venues SET
           name=COALESCE($2,name), address=$3, notes=$4, width_m=$5, depth_m=$6
         WHERE id=$1 RETURNING *`,
        [
          id,
          input.name ?? null,
          input.address === undefined ? existing.address : input.address,
          input.notes === undefined ? existing.notes : input.notes,
          input.widthM === undefined ? existing.widthM : input.widthM,
          input.depthM === undefined ? existing.depthM : input.depthM,
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
