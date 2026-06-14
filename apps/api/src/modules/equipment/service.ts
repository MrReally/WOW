import type { Equipment, ID, Problem } from "@sever/contracts";
import { one, query, tx, type Sql } from "../../core/db.js";
import { BadRequest, NotFound } from "../../core/errors.js";
import type { EventBus } from "../../core/eventBus.js";

// ── Row types + mappers ──────────────────────────────────────────────────────

interface TypeRow {
  id: string;
  name: string;
  tracking_mode: "serial" | "quantity";
  created_at: Date;
}
interface ModelRow {
  id: string;
  type_id: string;
  tracking_mode: "serial" | "quantity";
  name: string;
  manufacturer: string | null;
  unit_cost_eur: string;
  daily_price_eur: string;
  attrs: unknown;
  required_component_model_ids: string[];
  created_at: Date;
}
interface UnitRow {
  id: string;
  model_id: string;
  asset_tag: string;
  serial: string | null;
  status: Equipment.UnitStatus;
  current_project_id: string | null;
  created_at: Date;
}
interface JournalRow {
  id: string;
  unit_id: string | null;
  model_id: string | null;
  qty: number | null;
  action: Equipment.JournalAction;
  from_status: Equipment.UnitStatus | null;
  to_status: Equipment.UnitStatus | null;
  project_id: string | null;
  actor_id: string | null;
  note: string | null;
  at: Date;
}
interface ProblemRow {
  id: string;
  kind: Problem["kind"];
  severity: Problem["severity"];
  title: string;
  detail: string;
  refs: Record<string, string>;
  resolved: boolean;
  created_at: Date;
  resolved_at: Date | null;
}

const typeDTO = (r: TypeRow): Equipment.EquipmentTypeDTO => ({
  id: r.id,
  name: r.name,
  trackingMode: r.tracking_mode,
  createdAt: r.created_at.toISOString(),
});
const modelDTO = (r: ModelRow): Equipment.EquipmentModelDTO => ({
  id: r.id,
  typeId: r.type_id,
  trackingMode: r.tracking_mode,
  name: r.name,
  manufacturer: r.manufacturer,
  unitCostEUR: Number(r.unit_cost_eur),
  dailyPriceEUR: Number(r.daily_price_eur),
  attrs: (r.attrs as Equipment.CableAttrs | null) ?? null,
  requiredComponentModelIds: r.required_component_model_ids,
  createdAt: r.created_at.toISOString(),
});
const unitDTO = (r: UnitRow): Equipment.EquipmentUnitDTO => ({
  id: r.id,
  modelId: r.model_id,
  assetTag: r.asset_tag,
  serial: r.serial,
  status: r.status,
  currentProjectId: r.current_project_id,
  createdAt: r.created_at.toISOString(),
});
const journalDTO = (r: JournalRow): Equipment.JournalEntryDTO => ({
  id: r.id,
  unitId: r.unit_id,
  modelId: r.model_id,
  qty: r.qty,
  action: r.action,
  fromStatus: r.from_status,
  toStatus: r.to_status,
  projectId: r.project_id,
  actorId: r.actor_id,
  note: r.note,
  at: r.at.toISOString(),
});
const problemDTO = (r: ProblemRow): Problem => ({
  id: r.id,
  kind: r.kind,
  severity: r.severity,
  title: r.title,
  detail: r.detail,
  refs: r.refs,
  resolved: r.resolved,
  createdAt: r.created_at.toISOString(),
  resolvedAt: r.resolved_at ? r.resolved_at.toISOString() : null,
});

// ── Service ──────────────────────────────────────────────────────────────────

export function createEquipmentService(
  db: Sql,
  bus: EventBus
): Equipment.EquipmentService {
  async function appendJournal(
    client: Sql,
    entry: {
      unitId?: ID | null;
      modelId?: ID | null;
      qty?: number | null;
      action: Equipment.JournalAction;
      fromStatus?: Equipment.UnitStatus | null;
      toStatus?: Equipment.UnitStatus | null;
      projectId?: ID | null;
      actorId?: ID | null;
      note?: string | null;
    }
  ): Promise<void> {
    await query(
      client,
      `INSERT INTO equipment.journal
         (unit_id, model_id, qty, action, from_status, to_status, project_id, actor_id, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        entry.unitId ?? null,
        entry.modelId ?? null,
        entry.qty ?? null,
        entry.action,
        entry.fromStatus ?? null,
        entry.toStatus ?? null,
        entry.projectId ?? null,
        entry.actorId ?? null,
        entry.note ?? null,
      ]
    );
  }

  // Models always carry their type's tracking mode (same-schema join is fine).
  const MODEL_SELECT = `
    SELECT m.*, t.tracking_mode
    FROM equipment.models m
    JOIN equipment.types t ON t.id = m.type_id`;

  return {
    // ── Catalog: types ──
    async listTypes() {
      const rows = await query<TypeRow>(db, `SELECT * FROM equipment.types ORDER BY name`);
      return rows.map(typeDTO);
    },
    async createType(input) {
      const row = await one<TypeRow>(
        db,
        `INSERT INTO equipment.types (name, tracking_mode) VALUES ($1,$2) RETURNING *`,
        [input.name, input.trackingMode]
      );
      return typeDTO(row!);
    },

    // ── Catalog: models ──
    async listModels(typeId) {
      const rows = typeId
        ? await query<ModelRow>(db, `${MODEL_SELECT} WHERE m.type_id=$1 ORDER BY m.name`, [typeId])
        : await query<ModelRow>(db, `${MODEL_SELECT} ORDER BY m.name`);
      return rows.map(modelDTO);
    },
    async getModel(id) {
      const row = await one<ModelRow>(db, `${MODEL_SELECT} WHERE m.id=$1`, [id]);
      return row ? modelDTO(row) : null;
    },
    async createModel(input) {
      await query(
        db,
        `INSERT INTO equipment.models
           (type_id, name, manufacturer, unit_cost_eur, daily_price_eur, attrs, required_component_model_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          input.typeId,
          input.name,
          input.manufacturer ?? null,
          input.unitCostEUR,
          input.dailyPriceEUR,
          input.attrs ? JSON.stringify(input.attrs) : null,
          input.requiredComponentModelIds ?? [],
        ]
      );
      const row = await one<ModelRow>(
        db,
        `${MODEL_SELECT} WHERE m.type_id=$1 AND m.name=$2 ORDER BY m.created_at DESC LIMIT 1`,
        [input.typeId, input.name]
      );
      return modelDTO(row!);
    },

    // ── Units ──
    async listUnits(filter) {
      const conds: string[] = [];
      const params: unknown[] = [];
      if (filter?.modelId) {
        params.push(filter.modelId);
        conds.push(`model_id = $${params.length}`);
      }
      if (filter?.status) {
        params.push(filter.status);
        conds.push(`status = $${params.length}`);
      }
      if (filter?.projectId) {
        params.push(filter.projectId);
        conds.push(`current_project_id = $${params.length}`);
      }
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
      const rows = await query<UnitRow>(
        db,
        `SELECT * FROM equipment.units ${where} ORDER BY asset_tag`,
        params
      );
      return rows.map(unitDTO);
    },
    async getUnit(id) {
      const row = await one<UnitRow>(db, `SELECT * FROM equipment.units WHERE id=$1`, [id]);
      return row ? unitDTO(row) : null;
    },
    async createUnit(input) {
      const model = await this.getModel(input.modelId);
      if (!model) throw NotFound("model", input.modelId);
      return tx(async (client) => {
        const row = await one<UnitRow>(
          client,
          `INSERT INTO equipment.units (model_id, asset_tag, serial) VALUES ($1,$2,$3) RETURNING *`,
          [input.modelId, input.assetTag, input.serial ?? null]
        );
        await appendJournal(client, {
          unitId: row!.id,
          action: "created",
          toStatus: "in_stock",
        });
        return unitDTO(row!);
      });
    },
    async getUnitJournal(unitId) {
      const rows = await query<JournalRow>(
        db,
        `SELECT * FROM equipment.journal WHERE unit_id=$1 ORDER BY at`,
        [unitId]
      );
      return rows.map(journalDTO);
    },
    async modelStock(modelId) {
      const model = await this.getModel(modelId);
      if (!model) throw NotFound("model", modelId);

      if (model.trackingMode === "quantity") {
        const stock = await one<{ total_qty: number }>(
          db,
          `SELECT total_qty FROM equipment.model_stock WHERE model_id=$1`,
          [modelId]
        );
        const total = stock?.total_qty ?? 0;
        const moved = await one<{ out: string }>(
          db,
          `SELECT COALESCE(SUM(CASE WHEN action='issued' THEN qty
                                    WHEN action IN ('returned','return_incomplete') THEN -qty
                                    ELSE 0 END),0)::text AS out
           FROM equipment.journal WHERE model_id=$1 AND qty IS NOT NULL`,
          [modelId]
        );
        const onProjects = Math.max(0, Number(moved?.out ?? 0));
        return { modelId, total, inStock: total - onProjects, onProjects, inRepair: 0 };
      }

      const rows = await query<{ status: Equipment.UnitStatus; count: string }>(
        db,
        `SELECT status, count(*)::text AS count FROM equipment.units WHERE model_id=$1 GROUP BY status`,
        [modelId]
      );
      const by = (s: Equipment.UnitStatus) => Number(rows.find((r) => r.status === s)?.count ?? 0);
      const total = rows.reduce((a, r) => a + Number(r.count), 0);
      return {
        modelId,
        total,
        inStock: by("in_stock"),
        onProjects: by("on_project"),
        inRepair: by("in_repair"),
      };
    },

    // ── Quantity (cable) stock + moves ──
    async setModelStockTotal(modelId, total) {
      const model = await this.getModel(modelId);
      if (!model) throw NotFound("model", modelId);
      if (model.trackingMode !== "quantity") throw BadRequest("model is not quantity-tracked");
      await query(
        db,
        `INSERT INTO equipment.model_stock (model_id, total_qty) VALUES ($1,$2)
         ON CONFLICT (model_id) DO UPDATE SET total_qty=$2`,
        [modelId, Math.max(0, Math.trunc(total))]
      );
      return this.modelStock(modelId);
    },

    async issueQuantity(input) {
      if (input.qty <= 0) throw BadRequest("qty must be positive");
      const stock = await this.modelStock(input.modelId);
      if (input.qty > stock.inStock) {
        throw BadRequest(`only ${stock.inStock} available on stock`);
      }
      await tx(async (client) => {
        await appendJournal(client, {
          modelId: input.modelId,
          qty: input.qty,
          action: "issued",
          projectId: input.projectId,
          actorId: input.actorId,
          note: input.note ?? null,
        });
      });
      return this.modelStock(input.modelId);
    },

    async returnQuantity(input) {
      if (input.qty <= 0) throw BadRequest("qty must be positive");
      await tx(async (client) => {
        await appendJournal(client, {
          modelId: input.modelId,
          qty: input.qty,
          action: "returned",
          projectId: input.projectId,
          actorId: input.actorId,
          note: input.note ?? null,
        });
      });
      return this.modelStock(input.modelId);
    },

    // ── CSV import ──
    async importCatalog(rows) {
      const result: Equipment.ImportResult = {
        typesCreated: 0,
        modelsCreated: 0,
        unitsCreated: 0,
        stockUpdated: 0,
        skipped: 0,
        errors: [],
      };
      const typeCache = new Map<string, { id: string; trackingMode: "serial" | "quantity" }>();
      const modelCache = new Map<string, string>(); // `${typeId}::${name}` -> modelId

      const findOrCreateType = async (name: string, mode: "serial" | "quantity") => {
        const key = name.toLowerCase();
        const cached = typeCache.get(key);
        if (cached) return cached;
        let row = await one<TypeRow>(db, `SELECT * FROM equipment.types WHERE lower(name)=lower($1)`, [name]);
        if (!row) {
          row = await one<TypeRow>(
            db,
            `INSERT INTO equipment.types (name, tracking_mode) VALUES ($1,$2) RETURNING *`,
            [name, mode]
          );
          result.typesCreated++;
        }
        const val = { id: row!.id, trackingMode: row!.tracking_mode };
        typeCache.set(key, val);
        return val;
      };

      const findOrCreateModel = async (row: Equipment.ImportRow, typeId: string) => {
        const key = `${typeId}::${row.model.toLowerCase()}`;
        const cached = modelCache.get(key);
        if (cached) return cached;
        let m = await one<ModelRow>(
          db,
          `${MODEL_SELECT} WHERE m.type_id=$1 AND lower(m.name)=lower($2) LIMIT 1`,
          [typeId, row.model]
        );
        if (!m) {
          const attrs =
            row.cableType || row.lengthM != null || row.connectors
              ? { cableType: row.cableType ?? "", lengthM: row.lengthM ?? 0, connectors: row.connectors ?? "" }
              : null;
          await query(
            db,
            `INSERT INTO equipment.models
               (type_id, name, manufacturer, unit_cost_eur, daily_price_eur, attrs)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [typeId, row.model, row.manufacturer ?? null, row.unitCostEUR ?? 0, row.dailyPriceEUR ?? 0, attrs ? JSON.stringify(attrs) : null]
          );
          m = await one<ModelRow>(
            db,
            `${MODEL_SELECT} WHERE m.type_id=$1 AND m.name=$2 ORDER BY m.created_at DESC LIMIT 1`,
            [typeId, row.model]
          );
          result.modelsCreated++;
        }
        modelCache.set(key, m!.id);
        return m!.id;
      };

      for (const [i, row] of rows.entries()) {
        try {
          if (!row.type || !row.model) {
            result.errors.push(`row ${i + 1}: type and model are required`);
            continue;
          }
          const type = await findOrCreateType(row.type, row.trackingMode);
          const modelId = await findOrCreateModel(row, type.id);

          if (type.trackingMode === "quantity") {
            const qty = row.qty ?? 0;
            if (qty > 0) {
              const cur = await one<{ total_qty: number }>(
                db,
                `SELECT total_qty FROM equipment.model_stock WHERE model_id=$1`,
                [modelId]
              );
              await query(
                db,
                `INSERT INTO equipment.model_stock (model_id, total_qty) VALUES ($1,$2)
                 ON CONFLICT (model_id) DO UPDATE SET total_qty = equipment.model_stock.total_qty + $2`,
                [modelId, Math.trunc(qty)]
              );
              result.stockUpdated++;
              void cur;
            } else {
              result.skipped++;
            }
          } else {
            if (!row.assetTag) {
              result.skipped++;
              continue;
            }
            const exists = await one<{ id: string }>(
              db,
              `SELECT id FROM equipment.units WHERE asset_tag=$1`,
              [row.assetTag]
            );
            if (exists) {
              result.skipped++;
              continue;
            }
            await tx(async (client) => {
              const u = await one<UnitRow>(
                client,
                `INSERT INTO equipment.units (model_id, asset_tag, serial) VALUES ($1,$2,$3) RETURNING *`,
                [modelId, row.assetTag, row.serial ?? null]
              );
              await appendJournal(client, { unitId: u!.id, action: "created", toStatus: "in_stock" });
            });
            result.unitsCreated++;
          }
        } catch (err) {
          result.errors.push(`row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return result;
    },

    // ── Operations ──
    async issueUnits(input) {
      if (input.unitIds.length === 0) throw BadRequest("no units to issue");
      const issued = await tx(async (client) => {
        const results: Equipment.EquipmentUnitDTO[] = [];
        for (const unitId of input.unitIds) {
          const unit = await one<UnitRow>(
            client,
            `SELECT * FROM equipment.units WHERE id=$1 FOR UPDATE`,
            [unitId]
          );
          if (!unit) throw NotFound("unit", unitId);
          const updated = await one<UnitRow>(
            client,
            `UPDATE equipment.units SET status='on_project', current_project_id=$2 WHERE id=$1 RETURNING *`,
            [unitId, input.projectId]
          );
          await appendJournal(client, {
            unitId,
            action: "issued",
            fromStatus: unit.status,
            toStatus: "on_project",
            projectId: input.projectId,
            actorId: input.actorId,
            note: input.note ?? null,
          });
          results.push(unitDTO(updated!));
        }
        return results;
      });

      for (const u of issued) {
        await bus.publish({
          type: "equipment.unit.issued",
          unitId: u.id,
          modelId: u.modelId,
          projectId: input.projectId,
          actorId: input.actorId,
          at: new Date().toISOString(),
        });
      }
      return issued;
    },

    async returnUnits(input) {
      const returnedSet = new Set(input.returnedUnitIds);
      const missing = input.expectedUnitIds.filter((id) => !returnedSet.has(id));

      const problemId = await tx(async (client) => {
        for (const unitId of input.returnedUnitIds) {
          const unit = await one<UnitRow>(
            client,
            `SELECT * FROM equipment.units WHERE id=$1 FOR UPDATE`,
            [unitId]
          );
          if (!unit) throw NotFound("unit", unitId);
          await query(
            client,
            `UPDATE equipment.units SET status='in_stock', current_project_id=NULL WHERE id=$1`,
            [unitId]
          );
          await appendJournal(client, {
            unitId,
            action: missing.length > 0 ? "return_incomplete" : "returned",
            fromStatus: unit.status,
            toStatus: "in_stock",
            projectId: input.projectId,
            actorId: input.actorId,
            note: input.note ?? null,
          });
        }

        // Missing units stay on_project; a Problem is raised but nothing blocks.
        if (missing.length === 0) return null;
        const problem = await one<ProblemRow>(
          client,
          `INSERT INTO equipment.problems (kind, severity, title, detail, refs)
           VALUES ('incomplete_return','warning',$1,$2,$3) RETURNING *`,
          [
            `Некомплект при возврате`,
            `${missing.length} ед. не вернулись с проекта`,
            JSON.stringify({ projectId: input.projectId, missingUnitIds: missing.join(",") }),
          ]
        );
        for (const unitId of missing) {
          await appendJournal(client, {
            unitId,
            action: "return_incomplete",
            projectId: input.projectId,
            actorId: input.actorId,
            note: "не возвращено (некомплект)",
          });
        }
        return problem!.id;
      });

      for (const unitId of input.returnedUnitIds) {
        await bus.publish({
          type: "equipment.unit.returned",
          unitId,
          projectId: input.projectId,
          complete: missing.length === 0,
          at: new Date().toISOString(),
        });
      }
      if (missing.length > 0) {
        await bus.publish({
          type: "equipment.return.incomplete",
          projectId: input.projectId,
          missingUnitIds: missing,
          at: new Date().toISOString(),
        });
      }

      return { returned: input.returnedUnitIds, missing, problemId };
    },

    async changeStatus(unitId, toStatus, actorId, note) {
      return tx(async (client) => {
        const unit = await one<UnitRow>(
          client,
          `SELECT * FROM equipment.units WHERE id=$1 FOR UPDATE`,
          [unitId]
        );
        if (!unit) throw NotFound("unit", unitId);
        const updated = await one<UnitRow>(
          client,
          `UPDATE equipment.units SET status=$2 WHERE id=$1 RETURNING *`,
          [unitId, toStatus]
        );
        const action: Equipment.JournalAction =
          toStatus === "in_repair"
            ? "sent_to_repair"
            : toStatus === "at_contractor"
            ? "sent_to_contractor"
            : toStatus === "lost"
            ? "marked_lost"
            : toStatus === "in_stock" && unit.status === "in_repair"
            ? "back_from_repair"
            : "status_changed";
        await appendJournal(client, {
          unitId,
          action,
          fromStatus: unit.status,
          toStatus,
          actorId,
          note: note ?? null,
        });
        if (toStatus === "lost") {
          await query(
            client,
            `INSERT INTO equipment.problems (kind, severity, title, detail, refs)
             VALUES ('unit_lost','critical',$1,$2,$3)`,
            [`Утеря единицы`, `Единица отмечена как утерянная`, JSON.stringify({ unitId })]
          );
        }
        return unitDTO(updated!);
      });
    },

    async countUnitsOnProject(projectId) {
      const row = await one<{ count: string }>(
        db,
        `SELECT count(*)::text AS count FROM equipment.units WHERE current_project_id=$1`,
        [projectId]
      );
      return Number(row?.count ?? 0);
    },

    // ── Problems ──
    async listProblems(opts) {
      const rows = await query<ProblemRow>(
        db,
        opts?.includeResolved
          ? `SELECT * FROM equipment.problems ORDER BY created_at DESC`
          : `SELECT * FROM equipment.problems WHERE resolved=false ORDER BY created_at DESC`
      );
      return rows.map(problemDTO);
    },
    async resolveProblem(id) {
      await query(
        db,
        `UPDATE equipment.problems SET resolved=true, resolved_at=now() WHERE id=$1`,
        [id]
      );
    },
  };
}
