import type { Plans } from "@sever/contracts";
import { one, query, tx, type Sql } from "../../core/db.js";
import { BadRequest, NotFound } from "../../core/errors.js";
import { validateCableShape, validatePlanAttrs, validatePlanGeometry } from "./validation.js";

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
  from_id: string | null;
  to_id: string | null;
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
  fromId: r.from_id,
  toId: r.to_id,
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
  async function getPlanRow(id: string, sql: Sql = db): Promise<PlanRow> {
    const row = await one<PlanRow>(sql, `SELECT * FROM plans.plans WHERE id=$1`, [id]);
    if (!row) throw NotFound("plan", id);
    return row;
  }

  async function validateCable(
    sql: Sql,
    planId: string,
    layer: Plans.PlanLayer,
    kind: Plans.PlanElementKind,
    fromId: string | null,
    toId: string | null,
  ): Promise<void> {
    validateCableShape(layer, kind, fromId, toId);
    if (kind !== "cable") return;
    const endpoints = await query<{ id: string; kind: Plans.PlanElementKind }>(
      sql,
      `SELECT id,kind FROM plans.elements WHERE plan_id=$1 AND id=ANY($2::uuid[])`,
      [planId, [fromId, toId]],
    );
    if (endpoints.length !== 2) throw BadRequest("точки подключения должны принадлежать этому плану");
    if (endpoints.some((endpoint) => endpoint.kind === "cable")) throw BadRequest("кабель нельзя подключить к другому кабелю");
  }

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
        await query(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [input.projectId]);
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
        await query(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [src.project_id]);
        await query(client, `UPDATE plans.plans SET is_current=false WHERE project_id=$1`, [src.project_id]);
        const max = await one<{ v: number }>(client, `SELECT max(version) AS v FROM plans.plans WHERE project_id=$1`, [src.project_id]);
        const version = (max?.v ?? src.version) + 1;
        const dst = await one<PlanRow>(
          client,
          `INSERT INTO plans.plans (project_id, venue_id, name, version, is_current, stage_w, stage_h)
           VALUES ($1,$2,$3,$4,true,$5,$6) RETURNING *`,
          [src.project_id, src.venue_id, src.name, version, src.stage_w, src.stage_h]
        );
        // Clone elements into the new version. Cables reference other elements
        // by id, so we clone points first (building an old→new id map) and then
        // clone cables with their endpoints remapped to the new element ids.
        const src_els = await query<ElementRow>(client, `SELECT * FROM plans.elements WHERE plan_id=$1 ORDER BY created_at`, [planId]);
        const idMap = new Map<string, string>();
        for (const e of src_els.filter((e) => e.kind !== "cable")) {
          const ins = await one<{ id: string }>(
            client,
            `INSERT INTO plans.elements (plan_id, layer, kind, label, x, y, rotation, w, h, model_id, unit_id, attrs)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
            [dst!.id, e.layer, e.kind, e.label, e.x, e.y, e.rotation, e.w, e.h, e.model_id, e.unit_id, e.attrs ? JSON.stringify(e.attrs) : null]
          );
          idMap.set(e.id, ins!.id);
        }
        for (const e of src_els.filter((e) => e.kind === "cable")) {
          await query(
            client,
            `INSERT INTO plans.elements (plan_id, layer, kind, label, x, y, rotation, w, h, from_id, to_id, model_id, unit_id, attrs)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
              dst!.id, e.layer, e.kind, e.label, e.x, e.y, e.rotation, e.w, e.h,
              e.from_id ? idMap.get(e.from_id) ?? null : null,
              e.to_id ? idMap.get(e.to_id) ?? null : null,
              e.model_id, e.unit_id, e.attrs ? JSON.stringify(e.attrs) : null,
            ]
          );
        }
        return withElements(dst!, client);
      });
    },

    async setCurrent(id) {
      return tx(async (client) => {
        const plan = await one<PlanRow>(client, `SELECT * FROM plans.plans WHERE id=$1`, [id]);
        if (!plan) throw NotFound("plan", id);
        await query(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [plan.project_id]);
        await query(client, `UPDATE plans.plans SET is_current=false WHERE project_id=$1`, [plan.project_id]);
        const row = await one<PlanRow>(client, `UPDATE plans.plans SET is_current=true WHERE id=$1 RETURNING *`, [id]);
        return withElements(row!, client);
      });
    },

    async updatePlan(id, input) {
      const existing = await one<PlanRow>(db, `SELECT * FROM plans.plans WHERE id=$1`, [id]);
      if (!existing) throw NotFound("plan", id);
      const nextW = input.stageW ?? existing.stage_w;
      const nextH = input.stageH ?? existing.stage_h;
      const outside = await one<{ id: string }>(db, `SELECT id FROM plans.elements WHERE plan_id=$1 AND (x>$2 OR y>$3 OR w>$2 OR h>$3) LIMIT 1`, [id, nextW, nextH]);
      if (outside) throw BadRequest("сначала переместите элементы внутрь нового размера сцены");
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
      await tx(async (client) => {
        const plan = await getPlanRow(id, client);
        await query(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [plan.project_id]);
        await query(client, `DELETE FROM plans.plans WHERE id=$1`, [id]);
        if (plan.is_current) await query(client, `UPDATE plans.plans SET is_current=true WHERE id=(SELECT id FROM plans.plans WHERE project_id=$1 ORDER BY version DESC LIMIT 1)`, [plan.project_id]);
      });
    },

    async addElement(input) {
      const plan = await getPlanRow(input.planId);
      validatePlanGeometry(plan, input);
      validatePlanAttrs(input.attrs);
      await validateCable(db, input.planId, input.layer, input.kind, input.fromId ?? null, input.toId ?? null);
      const row = await one<ElementRow>(
        db,
        `INSERT INTO plans.elements (plan_id, layer, kind, label, x, y, rotation, w, h, from_id, to_id, model_id, unit_id, attrs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
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
          input.fromId ?? null,
          input.toId ?? null,
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
      const plan = await getPlanRow(existing.plan_id);
      const next = {
        x: input.x ?? Number(existing.x),
        y: input.y ?? Number(existing.y),
        w: input.w === undefined ? (existing.w === null ? null : Number(existing.w)) : input.w,
        h: input.h === undefined ? (existing.h === null ? null : Number(existing.h)) : input.h,
      };
      validatePlanGeometry(plan, next);
      validatePlanAttrs(input.attrs === undefined ? existing.attrs as Plans.PlanElementAttrs | null : input.attrs);
      await validateCable(
        db,
        existing.plan_id,
        input.layer ?? existing.layer,
        existing.kind,
        input.fromId === undefined ? existing.from_id : input.fromId,
        input.toId === undefined ? existing.to_id : input.toId,
      );
      const row = await one<ElementRow>(
        db,
        `UPDATE plans.elements SET
           layer=COALESCE($2,layer), label=COALESCE($3,label),
           x=COALESCE($4,x), y=COALESCE($5,y), rotation=COALESCE($6,rotation),
           w=$7, h=$8, from_id=$9, to_id=$10, model_id=$11, unit_id=$12, attrs=$13
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
          input.fromId === undefined ? existing.from_id : input.fromId,
          input.toId === undefined ? existing.to_id : input.toId,
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
        const plan = await getPlanRow(planId, client);
        const ids = [...new Set(items.map((item) => item.id))];
        if (ids.length !== items.length) throw BadRequest("элемент указан для перемещения более одного раза");
        const found = await query<{ id: string }>(client, `SELECT id FROM plans.elements WHERE plan_id=$1 AND id=ANY($2::uuid[])`, [planId, ids]);
        if (found.length !== ids.length) throw BadRequest("в запросе есть элементы другого плана");
        for (const it of items) {
          validatePlanGeometry(plan, it);
          await query(
            client,
            `UPDATE plans.elements SET x=$2, y=$3, rotation=COALESCE($4,rotation) WHERE id=$1 AND plan_id=$5`,
            [it.id, it.x, it.y, it.rotation ?? null, planId]
          );
        }
      });
    },

    async deleteElement(id) {
      await tx(async (client) => {
        const existing = await one<ElementRow>(client, `SELECT * FROM plans.elements WHERE id=$1`, [id]);
        if (!existing) throw NotFound("element", id);
        if (existing.kind !== "cable") {
          await query(client, `DELETE FROM plans.elements WHERE plan_id=$1 AND kind='cable' AND (from_id=$2 OR to_id=$2)`, [existing.plan_id, id]);
        }
        await query(client, `DELETE FROM plans.elements WHERE id=$1`, [id]);
      });
    },
  };
}
