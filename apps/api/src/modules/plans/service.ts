import type { Plans } from "@sever/contracts";
import { one, query, tx, type Sql } from "../../core/db.js";
import { NotFound } from "../../core/errors.js";

interface PlanRow {
  id: string;
  project_id: string;
  venue_id: string | null;
  name: string;
  version: number;
  is_current: boolean;
  stage_w: number;
  stage_h: number;
  created_at: Date;
}
interface ElementRow {
  id: string;
  plan_id: string;
  layer: Plans.PlanLayer;
  kind: Plans.PlanElementKind;
  label: string;
  x: string;
  y: string;
  rotation: string;
  w: string | null;
  h: string | null;
  model_id: string | null;
  unit_id: string | null;
  attrs: Record<string, unknown> | null;
  created_at: Date;
}

const elementDTO = (r: ElementRow): Plans.PlanElementDTO => ({
  id: r.id,
  planId: r.plan_id,
  layer: r.layer,
  kind: r.kind,
  label: r.label,
  x: Number(r.x),
  y: Number(r.y),
  rotation: Number(r.rotation),
  w: r.w === null ? null : Number(r.w),
  h: r.h === null ? null : Number(r.h),
  modelId: r.model_id,
  unitId: r.unit_id,
  attrs: r.attrs,
  createdAt: r.created_at.toISOString(),
});

const planBase = (r: PlanRow) => ({
  id: r.id,
  projectId: r.project_id,
  venueId: r.venue_id,
  name: r.name,
  version: r.version,
  isCurrent: r.is_current,
  stageW: r.stage_w,
  stageH: r.stage_h,
  createdAt: r.created_at.toISOString(),
});

export function createPlansService(db: Sql): Plans.PlansService {
  async function withElements(plan: PlanRow, sql: Sql = db): Promise<Plans.PlanDTO> {
    const els = await query<ElementRow>(sql, `SELECT * FROM plans.elements WHERE plan_id=$1 ORDER BY created_at`, [plan.id]);
    return { ...planBase(plan), elements: els.map(elementDTO) };
  }

  return {
    async listPlans(projectId) {
      const rows = await query<PlanRow & { n: string }>(
        db,
        `SELECT p.*, (SELECT count(*) FROM plans.elements e WHERE e.plan_id=p.id)::text AS n
         FROM plans.plans p WHERE p.project_id=$1 ORDER BY p.version DESC`,
        [projectId]
      );
      return rows.map((r) => ({
        id: r.id,
        projectId: r.project_id,
        name: r.name,
        version: r.version,
        isCurrent: r.is_current,
        elementCount: Number(r.n),
        createdAt: r.created_at.toISOString(),
      }));
    },

    async getPlan(id) {
      const row = await one<PlanRow>(db, `SELECT * FROM plans.plans WHERE id=$1`, [id]);
      return row ? withElements(row) : null;
    },

    async getCurrentPlan(projectId) {
      const row = await one<PlanRow>(
        db,
        `SELECT * FROM plans.plans WHERE project_id=$1 AND is_current=true ORDER BY version DESC LIMIT 1`,
        [projectId]
      );
      return row ? withElements(row) : null;
    },

    async createPlan(input) {
      return tx(async (client) => {
        await query(client, `UPDATE plans.plans SET is_current=false WHERE project_id=$1`, [input.projectId]);
        const max = await one<{ v: number | null }>(
          client,
          `SELECT max(version) AS v FROM plans.plans WHERE project_id=$1`,
          [input.projectId]
        );
        const version = (max?.v ?? 0) + 1;
        const row = await one<PlanRow>(
          client,
          `INSERT INTO plans.plans (project_id, venue_id, name, version, is_current, stage_w, stage_h)
           VALUES ($1,$2,$3,$4,true,$5,$6) RETURNING *`,
          [input.projectId, input.venueId ?? null, input.name, version, input.stageW ?? 400, input.stageH ?? 560]
        );
        return { ...planBase(row!), elements: [] };
      });
    },

    async newVersion(planId) {
      return tx(async (client) => {
        const src = await one<PlanRow>(client, `SELECT * FROM plans.plans WHERE id=$1`, [planId]);
        if (!src) throw NotFound("plan", planId);
        await query(client, `UPDATE plans.plans SET is_current=false WHERE project_id=$1`, [src.project_id]);
        const max = await one<{ v: number }>(client, `SELECT max(version) AS v FROM plans.plans WHERE project_id=$1`, [src.project_id]);
        const version = (max?.v ?? src.version) + 1;
        const dst = await one<PlanRow>(
          client,
          `INSERT INTO plans.plans (project_id, venue_id, name, version, is_current, stage_w, stage_h)
           VALUES ($1,$2,$3,$4,true,$5,$6) RETURNING *`,
          [src.project_id, src.venue_id, src.name, version, src.stage_w, src.stage_h]
        );
        // Clone elements into the new version.
        await query(
          client,
          `INSERT INTO plans.elements (plan_id, layer, kind, label, x, y, rotation, w, h, model_id, unit_id, attrs)
           SELECT $1, layer, kind, label, x, y, rotation, w, h, model_id, unit_id, attrs
           FROM plans.elements WHERE plan_id=$2`,
          [dst!.id, planId]
        );
        return withElements(dst!, client);
      });
    },

    async setCurrent(id) {
      return tx(async (client) => {
        const plan = await one<PlanRow>(client, `SELECT * FROM plans.plans WHERE id=$1`, [id]);
        if (!plan) throw NotFound("plan", id);
        await query(client, `UPDATE plans.plans SET is_current=false WHERE project_id=$1`, [plan.project_id]);
        const row = await one<PlanRow>(client, `UPDATE plans.plans SET is_current=true WHERE id=$1 RETURNING *`, [id]);
        return withElements(row!, client);
      });
    },

    async updatePlan(id, input) {
      const existing = await one<PlanRow>(db, `SELECT * FROM plans.plans WHERE id=$1`, [id]);
      if (!existing) throw NotFound("plan", id);
      const row = await one<PlanRow>(
        db,
        `UPDATE plans.plans SET
           name=COALESCE($2,name),
           venue_id=$3,
           stage_w=COALESCE($4,stage_w),
           stage_h=COALESCE($5,stage_h)
         WHERE id=$1 RETURNING *`,
        [id, input.name ?? null, input.venueId === undefined ? existing.venue_id : input.venueId, input.stageW ?? null, input.stageH ?? null]
      );
      return withElements(row!);
    },

    async deletePlan(id) {
      await query(db, `DELETE FROM plans.plans WHERE id=$1`, [id]);
    },

    async addElement(input) {
      const row = await one<ElementRow>(
        db,
        `INSERT INTO plans.elements (plan_id, layer, kind, label, x, y, rotation, w, h, model_id, unit_id, attrs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [
          input.planId,
          input.layer,
          input.kind,
          input.label,
          input.x,
          input.y,
          input.rotation ?? 0,
          input.w ?? null,
          input.h ?? null,
          input.modelId ?? null,
          input.unitId ?? null,
          input.attrs ? JSON.stringify(input.attrs) : null,
        ]
      );
      return elementDTO(row!);
    },

    async updateElement(id, input) {
      const existing = await one<ElementRow>(db, `SELECT * FROM plans.elements WHERE id=$1`, [id]);
      if (!existing) throw NotFound("element", id);
      const row = await one<ElementRow>(
        db,
        `UPDATE plans.elements SET
           layer=COALESCE($2,layer), label=COALESCE($3,label),
           x=COALESCE($4,x), y=COALESCE($5,y), rotation=COALESCE($6,rotation),
           w=$7, h=$8, model_id=$9, unit_id=$10, attrs=$11
         WHERE id=$1 RETURNING *`,
        [
          id,
          input.layer ?? null,
          input.label ?? null,
          input.x ?? null,
          input.y ?? null,
          input.rotation ?? null,
          input.w === undefined ? existing.w : input.w,
          input.h === undefined ? existing.h : input.h,
          input.modelId === undefined ? existing.model_id : input.modelId,
          input.unitId === undefined ? existing.unit_id : input.unitId,
          input.attrs === undefined ? existing.attrs : input.attrs ? JSON.stringify(input.attrs) : null,
        ]
      );
      return elementDTO(row!);
    },

    async moveElements(planId, items) {
      if (items.length === 0) return;
      await tx(async (client) => {
        for (const it of items) {
          await query(
            client,
            `UPDATE plans.elements SET x=$2, y=$3, rotation=COALESCE($4,rotation) WHERE id=$1 AND plan_id=$5`,
            [it.id, it.x, it.y, it.rotation ?? null, planId]
          );
        }
      });
    },

    async deleteElement(id) {
      await query(db, `DELETE FROM plans.elements WHERE id=$1`, [id]);
    },
  };
}
