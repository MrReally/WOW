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
  warehouse_id: string | null;
  current_project_id: string | null;
  notes: string | null;
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
  warehouse_id: string | null;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  actor_id: string | null;
  note: string | null;
  at: Date;
}
interface WarehouseRow {
  id: string;
  name: string;
  address: string | null;
  is_default: boolean;
  created_at: Date;
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
  warehouseId: r.warehouse_id,
  currentProjectId: r.current_project_id,
  notes: r.notes,
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
  warehouseId: r.warehouse_id,
  fromWarehouseId: r.from_warehouse_id,
  toWarehouseId: r.to_warehouse_id,
  actorId: r.actor_id,
  note: r.note,
  at: r.at.toISOString(),
});
const warehouseDTO = (r: WarehouseRow): Equipment.WarehouseDTO => ({
  id: r.id,
  name: r.name,
  address: r.address,
  isDefault: r.is_default,
  createdAt: r.created_at.toISOString(),
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

interface ContractorRow { id: string; name: string; contacts: string | null; created_at: Date }
interface RepairRow {
  id: string;
  unit_id: string;
  status: "open" | "closed";
  problem: string;
  vendor: string | null;
  est_cost_eur: string | null;
  cost_eur: string | null;
  resolution: string | null;
  outcome: Equipment.RepairOutcome | null;
  opened_by: string | null;
  opened_at: Date;
  closed_by: string | null;
  closed_at: Date | null;
}
interface HandoverRow {
  id: string;
  unit_id: string;
  contractor_id: string;
  contractor_name: string;
  status: "out" | "returned";
  reason: string | null;
  note: string | null;
  expected_return: Date | null;
  sent_by: string | null;
  sent_at: Date;
  returned_by: string | null;
  returned_at: Date | null;
}
const contractorDTO = (r: ContractorRow): Equipment.ContractorDTO => ({
  id: r.id, name: r.name, contacts: r.contacts, createdAt: r.created_at.toISOString(),
});
const repairDTO = (r: RepairRow): Equipment.RepairDTO => ({
  id: r.id,
  unitId: r.unit_id,
  status: r.status,
  problem: r.problem,
  vendor: r.vendor,
  estCostEUR: r.est_cost_eur === null ? null : Number(r.est_cost_eur),
  costEUR: r.cost_eur === null ? null : Number(r.cost_eur),
  resolution: r.resolution,
  outcome: r.outcome,
  openedBy: r.opened_by,
  openedAt: r.opened_at.toISOString(),
  closedBy: r.closed_by,
  closedAt: r.closed_at ? r.closed_at.toISOString() : null,
});
const handoverDTO = (r: HandoverRow): Equipment.HandoverDTO => ({
  id: r.id,
  unitId: r.unit_id,
  contractorId: r.contractor_id,
  contractorName: r.contractor_name,
  status: r.status,
  reason: r.reason,
  note: r.note,
  expectedReturn: r.expected_return ? r.expected_return.toISOString() : null,
  sentBy: r.sent_by,
  sentAt: r.sent_at.toISOString(),
  returnedBy: r.returned_by,
  returnedAt: r.returned_at ? r.returned_at.toISOString() : null,
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
      warehouseId?: ID | null;
      fromWarehouseId?: ID | null;
      toWarehouseId?: ID | null;
      actorId?: ID | null;
      note?: string | null;
    }
  ): Promise<void> {
    await query(
      client,
      `INSERT INTO equipment.journal
         (unit_id, model_id, qty, action, from_status, to_status, project_id, warehouse_id, from_warehouse_id, to_warehouse_id, actor_id, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        entry.unitId ?? null,
        entry.modelId ?? null,
        entry.qty ?? null,
        entry.action,
        entry.fromStatus ?? null,
        entry.toStatus ?? null,
        entry.projectId ?? null,
        entry.warehouseId ?? null,
        entry.fromWarehouseId ?? null,
        entry.toWarehouseId ?? null,
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

  async function defaultWarehouseId(client: Sql = db): Promise<string> {
    let row = await one<{ id: string }>(
      client,
      `SELECT id FROM equipment.warehouses ORDER BY is_default DESC, created_at LIMIT 1`
    );
    if (!row) {
      row = await one<{ id: string }>(
        client,
        `INSERT INTO equipment.warehouses (name, is_default) VALUES ('Main warehouse', true) RETURNING id`
      );
    }
    return row!.id;
  }

  async function assertWarehouse(id: string, client: Sql = db): Promise<void> {
    const row = await one<{ id: string }>(client, `SELECT id FROM equipment.warehouses WHERE id=$1`, [id]);
    if (!row) throw NotFound("warehouse", id);
  }

  return {
    // ── Warehouses ──
    async listWarehouses() {
      const rows = await query<WarehouseRow>(db, `SELECT * FROM equipment.warehouses ORDER BY is_default DESC, name`);
      return rows.map(warehouseDTO);
    },
    async createWarehouse(input) {
      const row = await one<WarehouseRow>(
        db,
        `INSERT INTO equipment.warehouses (name, address) VALUES ($1,$2) RETURNING *`,
        [input.name, input.address ?? null]
      );
      return warehouseDTO(row!);
    },
    async updateWarehouse(id, input) {
      return tx(async (client) => {
        const existing = await one<WarehouseRow>(client, `SELECT * FROM equipment.warehouses WHERE id=$1`, [id]);
        if (!existing) throw NotFound("warehouse", id);
        if (input.isDefault) {
          await query(client, `UPDATE equipment.warehouses SET is_default=false`);
        }
        const row = await one<WarehouseRow>(
          client,
          `UPDATE equipment.warehouses SET
             name=$2,
             address=$3,
             is_default=$4
           WHERE id=$1 RETURNING *`,
          [
            id,
            input.name ?? existing.name,
            input.address === undefined ? existing.address : input.address,
            input.isDefault === undefined ? existing.is_default : input.isDefault,
          ]
        );
        return warehouseDTO(row!);
      });
    },

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
    async updateModel(id, input) {
      const existing = await one<ModelRow>(db, `SELECT * FROM equipment.models WHERE id=$1`, [id]);
      if (!existing) throw NotFound("model", id);
      await query(
        db,
        `UPDATE equipment.models SET
           name             = COALESCE($2, name),
           manufacturer     = $3,
           unit_cost_eur    = COALESCE($4, unit_cost_eur),
           daily_price_eur  = COALESCE($5, daily_price_eur),
           attrs            = $6
         WHERE id=$1`,
        [
          id,
          input.name ?? null,
          input.manufacturer === undefined ? existing.manufacturer : input.manufacturer,
          input.unitCostEUR ?? null,
          input.dailyPriceEUR ?? null,
          input.attrs === undefined ? existing.attrs : input.attrs ? JSON.stringify(input.attrs) : null,
        ]
      );
      const row = await one<ModelRow>(db, `${MODEL_SELECT} WHERE m.id=$1`, [id]);
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
      if (filter?.warehouseId) {
        params.push(filter.warehouseId);
        conds.push(`warehouse_id = $${params.length}`);
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
        const warehouseId = input.warehouseId ?? await defaultWarehouseId(client);
        await assertWarehouse(warehouseId, client);
        const row = await one<UnitRow>(
          client,
          `INSERT INTO equipment.units (model_id, asset_tag, serial, notes, warehouse_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [input.modelId, input.assetTag, input.serial ?? null, input.notes ?? null, warehouseId]
        );
        await appendJournal(client, {
          unitId: row!.id,
          action: "created",
          toStatus: "in_stock",
          warehouseId,
        });
        return unitDTO(row!);
      });
    },
    async updateUnit(id, input) {
      const existing = await one<UnitRow>(db, `SELECT * FROM equipment.units WHERE id=$1`, [id]);
      if (!existing) throw NotFound("unit", id);
      const row = await one<UnitRow>(
        db,
        `UPDATE equipment.units SET
           serial = $2,
           notes  = $3
         WHERE id=$1 RETURNING *`,
        [
          id,
          input.serial === undefined ? existing.serial : input.serial,
          input.notes === undefined ? existing.notes : input.notes,
        ]
      );
      return unitDTO(row!);
    },
    async getUnitJournal(unitId) {
      const rows = await query<JournalRow>(
        db,
        `SELECT * FROM equipment.journal WHERE unit_id=$1 ORDER BY at`,
        [unitId]
      );
      return rows.map(journalDTO);
    },
    async modelStock(modelId, warehouseId) {
      const model = await this.getModel(modelId);
      if (!model) throw NotFound("model", modelId);
      if (warehouseId) await assertWarehouse(warehouseId);

      if (model.trackingMode === "quantity") {
        const stock = warehouseId
          ? await one<{ total_qty: number }>(
              db,
              `SELECT total_qty FROM equipment.model_stock WHERE model_id=$1 AND warehouse_id=$2`,
              [modelId, warehouseId]
            )
          : await one<{ total_qty: string }>(
              db,
              `SELECT COALESCE(SUM(total_qty),0)::text AS total_qty FROM equipment.model_stock WHERE model_id=$1`,
              [modelId]
            );
        const total = Number(stock?.total_qty ?? 0);
        const moved = await one<{ out: string }>(
          db,
          `SELECT COALESCE(SUM(CASE WHEN action='issued' THEN qty
                                    WHEN action IN ('returned','return_incomplete') THEN -qty
                                    ELSE 0 END),0)::text AS out
           FROM equipment.journal WHERE model_id=$1 AND qty IS NOT NULL ${warehouseId ? "AND warehouse_id=$2" : ""}`,
          warehouseId ? [modelId, warehouseId] : [modelId]
        );
        const onProjects = Math.max(0, Number(moved?.out ?? 0));
        return { modelId, warehouseId: warehouseId ?? null, total, inStock: total - onProjects, onProjects, inRepair: 0 };
      }

      const rows = await query<{ status: Equipment.UnitStatus; count: string }>(
        db,
        `SELECT status, count(*)::text AS count FROM equipment.units WHERE model_id=$1 ${warehouseId ? "AND warehouse_id=$2" : ""} GROUP BY status`,
        warehouseId ? [modelId, warehouseId] : [modelId]
      );
      const by = (s: Equipment.UnitStatus) => Number(rows.find((r) => r.status === s)?.count ?? 0);
      const total = rows.reduce((a, r) => a + Number(r.count), 0);
      return {
        modelId,
        warehouseId: warehouseId ?? null,
        total,
        inStock: by("in_stock"),
        onProjects: by("on_project"),
        inRepair: by("in_repair"),
      };
    },

    // ── Quantity (cable) stock + moves ──
    async transferUnit(unitId, warehouseId, actorId, note) {
      await assertWarehouse(warehouseId);
      return tx(async (client) => {
        const unit = await one<UnitRow>(client, `SELECT * FROM equipment.units WHERE id=$1 FOR UPDATE`, [unitId]);
        if (!unit) throw NotFound("unit", unitId);
        if (unit.status !== "in_stock") throw BadRequest("перемещать между складами можно только единицы на складе");
        if (unit.warehouse_id === warehouseId) throw BadRequest("выберите другой склад");
        const updated = await one<UnitRow>(
          client,
          `UPDATE equipment.units SET warehouse_id=$2 WHERE id=$1 RETURNING *`,
          [unitId, warehouseId]
        );
        await appendJournal(client, {
          unitId,
          action: "transferred",
          fromStatus: unit.status,
          toStatus: unit.status,
          warehouseId,
          fromWarehouseId: unit.warehouse_id,
          toWarehouseId: warehouseId,
          actorId,
          note: note ?? `перемещение между складами`,
        });
        return unitDTO(updated!);
      });
    },

    async setModelStockTotal(modelId, total, warehouseIdInput) {
      const model = await this.getModel(modelId);
      if (!model) throw NotFound("model", modelId);
      if (model.trackingMode !== "quantity") throw BadRequest("model is not quantity-tracked");
      const warehouseId = warehouseIdInput ?? await defaultWarehouseId();
      await assertWarehouse(warehouseId);
      await query(
        db,
        `INSERT INTO equipment.model_stock (model_id, warehouse_id, total_qty) VALUES ($1,$2,$3)
         ON CONFLICT (model_id, warehouse_id) DO UPDATE SET total_qty=$3`,
        [modelId, warehouseId, Math.max(0, Math.trunc(total))]
      );
      return this.modelStock(modelId, warehouseId);
    },

    async issueQuantity(input) {
      if (input.qty <= 0) throw BadRequest("qty must be positive");
      const warehouseId = input.warehouseId ?? await defaultWarehouseId();
      const stock = await this.modelStock(input.modelId, warehouseId);
      if (input.qty > stock.inStock) {
        throw BadRequest(`only ${stock.inStock} available on stock`);
      }
      await tx(async (client) => {
        await appendJournal(client, {
          modelId: input.modelId,
          qty: input.qty,
          action: "issued",
          projectId: input.projectId,
          warehouseId,
          actorId: input.actorId,
          note: input.note ?? null,
        });
      });
      return this.modelStock(input.modelId, warehouseId);
    },

    async returnQuantity(input) {
      if (input.qty <= 0) throw BadRequest("qty must be positive");
      const warehouseId = input.warehouseId ?? await defaultWarehouseId();
      const issuedOnProject = await one<{ out: string }>(
        db,
        `SELECT COALESCE(SUM(CASE WHEN action='issued' THEN qty
                                  WHEN action IN ('returned','return_incomplete') THEN -qty
                                  ELSE 0 END),0)::text AS out
         FROM equipment.journal
         WHERE model_id=$1 AND project_id=$2 AND qty IS NOT NULL`,
        [input.modelId, input.projectId]
      );
      const outstanding = Math.max(0, Number(issuedOnProject?.out ?? 0));
      if (input.qty > outstanding) {
        throw BadRequest(`only ${outstanding} issued to this project`);
      }
      await tx(async (client) => {
        await appendJournal(client, {
           modelId: input.modelId,
          qty: input.qty,
          action: "returned",
          projectId: input.projectId,
          warehouseId,
          actorId: input.actorId,
          note: input.note ?? null,
        });
      });
      return this.modelStock(input.modelId, warehouseId);
    },

    async transferQuantity(input) {
      if (input.qty <= 0) throw BadRequest("qty must be positive");
      if (input.fromWarehouseId === input.toWarehouseId) throw BadRequest("выберите разные склады");
      await assertWarehouse(input.fromWarehouseId);
      await assertWarehouse(input.toWarehouseId);
      const stock = await this.modelStock(input.modelId, input.fromWarehouseId);
      if (input.qty > stock.inStock) throw BadRequest(`only ${stock.inStock} available on stock`);
      await tx(async (client) => {
        await query(
          client,
          `INSERT INTO equipment.model_stock (model_id, warehouse_id, total_qty) VALUES ($1,$2,0)
           ON CONFLICT (model_id, warehouse_id) DO NOTHING`,
          [input.modelId, input.fromWarehouseId]
        );
        await query(
          client,
          `INSERT INTO equipment.model_stock (model_id, warehouse_id, total_qty) VALUES ($1,$2,0)
           ON CONFLICT (model_id, warehouse_id) DO NOTHING`,
          [input.modelId, input.toWarehouseId]
        );
        await query(
          client,
          `UPDATE equipment.model_stock SET total_qty=total_qty-$3 WHERE model_id=$1 AND warehouse_id=$2`,
          [input.modelId, input.fromWarehouseId, input.qty]
        );
        await query(
          client,
          `UPDATE equipment.model_stock SET total_qty=total_qty+$3 WHERE model_id=$1 AND warehouse_id=$2`,
          [input.modelId, input.toWarehouseId, input.qty]
        );
        await appendJournal(client, {
          modelId: input.modelId,
          qty: input.qty,
          action: "transferred",
          warehouseId: input.toWarehouseId,
          fromWarehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          actorId: input.actorId,
          note: input.note ?? `перемещение между складами`,
        });
      });
      return this.modelStock(input.modelId, input.toWarehouseId);
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
      const warehouseId = await defaultWarehouseId();

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
              await query(
                db,
                `INSERT INTO equipment.model_stock (model_id, warehouse_id, total_qty) VALUES ($1,$2,$3)
                 ON CONFLICT (model_id, warehouse_id) DO UPDATE SET total_qty = equipment.model_stock.total_qty + $3`,
                [modelId, warehouseId, Math.trunc(qty)]
              );
              result.stockUpdated++;
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
                `INSERT INTO equipment.units (model_id, asset_tag, serial, warehouse_id) VALUES ($1,$2,$3,$4) RETURNING *`,
                [modelId, row.assetTag, row.serial ?? null, warehouseId]
              );
              await appendJournal(client, { unitId: u!.id, action: "created", toStatus: "in_stock", warehouseId });
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
          // Already on this project → idempotent no-op (don't double-journal).
          if (unit.status === "on_project" && unit.current_project_id === input.projectId) {
            results.push(unitDTO(unit));
            continue;
          }
          // On a different project → block with a clear message, not silently.
          if (unit.status === "on_project" && unit.current_project_id !== input.projectId) {
            throw BadRequest(`${unit.asset_tag} уже выдан на другой проект`);
          }
          if (unit.status === "lost" || unit.status === "in_repair" || unit.status === "at_contractor") {
            throw BadRequest(`${unit.asset_tag}: статус «${unit.status}», нельзя выдать`);
          }
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
      // One batch event for notifications (avoids per-unit spam). Only count
      // units that actually changed (idempotent re-issues stay quiet enough).
      if (issued.length > 0) {
        await bus.publish({
          type: "equipment.units.issued",
          projectId: input.projectId,
          count: issued.length,
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
      const problem = await one<ProblemRow>(db, `SELECT * FROM equipment.problems WHERE id=$1`, [id]);
      if (!problem) throw NotFound("problem", id);
      if (problem.kind !== "unit_lost") {
        throw BadRequest("only loss problems can be hidden manually");
      }
      await query(
        db,
        `UPDATE equipment.problems SET resolved=true, resolved_at=now() WHERE id=$1`,
        [id]
      );
    },

    // ── Contractors ──
    async listContractors() {
      const rows = await query<ContractorRow>(db, `SELECT * FROM equipment.contractors ORDER BY name`);
      return rows.map(contractorDTO);
    },
    async createContractor(input) {
      const row = await one<ContractorRow>(
        db,
        `INSERT INTO equipment.contractors (name, contacts) VALUES ($1,$2) RETURNING *`,
        [input.name, input.contacts ?? null]
      );
      return contractorDTO(row!);
    },
    async updateContractor(id, input) {
      const row = await one<ContractorRow>(
        db,
        `UPDATE equipment.contractors
         SET name=COALESCE($2, name),
             contacts=CASE WHEN $3 THEN $4 ELSE contacts END
         WHERE id=$1
         RETURNING *`,
        [id, input.name, Object.prototype.hasOwnProperty.call(input, "contacts"), input.contacts ?? null]
      );
      if (!row) throw NotFound("contractor", id);
      return contractorDTO(row);
    },

    // ── Repairs ──
    async openRepair(input) {
      return tx(async (client) => {
        const unit = await one<UnitRow>(client, `SELECT * FROM equipment.units WHERE id=$1 FOR UPDATE`, [input.unitId]);
        if (!unit) throw NotFound("unit", input.unitId);
        await query(client, `UPDATE equipment.units SET status='in_repair' WHERE id=$1`, [input.unitId]);
        const row = await one<RepairRow>(
          client,
          `INSERT INTO equipment.repairs (unit_id, problem, vendor, est_cost_eur, opened_by)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [input.unitId, input.problem, input.vendor ?? null, input.estCostEUR ?? null, input.actorId]
        );
        await appendJournal(client, {
          unitId: input.unitId,
          action: "sent_to_repair",
          fromStatus: unit.status,
          toStatus: "in_repair",
          actorId: input.actorId,
          note: input.problem,
        });
        return repairDTO(row!);
      });
    },
    async closeRepair(id, input) {
      return tx(async (client) => {
        const repair = await one<RepairRow>(client, `SELECT * FROM equipment.repairs WHERE id=$1 FOR UPDATE`, [id]);
        if (!repair) throw NotFound("repair", id);
        if (repair.status === "closed") throw BadRequest("ремонт уже закрыт");
        const toStatus: Equipment.UnitStatus = input.outcome === "written_off" ? "lost" : "in_stock";
        const unit = await one<UnitRow>(client, `SELECT * FROM equipment.units WHERE id=$1 FOR UPDATE`, [repair.unit_id]);
        await query(client, `UPDATE equipment.units SET status=$2 WHERE id=$1`, [repair.unit_id, toStatus]);
        const row = await one<RepairRow>(
          client,
          `UPDATE equipment.repairs SET status='closed', cost_eur=$2, resolution=$3, outcome=$4, closed_by=$5, closed_at=now()
           WHERE id=$1 RETURNING *`,
          [id, input.costEUR ?? null, input.resolution ?? null, input.outcome, input.actorId]
        );
        await appendJournal(client, {
          unitId: repair.unit_id,
          action: input.outcome === "written_off" ? "marked_lost" : "back_from_repair",
          fromStatus: unit?.status ?? "in_repair",
          toStatus,
          actorId: input.actorId,
          note: input.resolution ?? (input.outcome === "written_off" ? "списано после ремонта" : "из ремонта"),
        });
        if (input.outcome === "written_off") {
          await query(
            client,
            `INSERT INTO equipment.problems (kind, severity, title, detail, refs)
             VALUES ('unit_lost','critical',$1,$2,$3)`,
            ["Списание после ремонта", "Единица не подлежит восстановлению", JSON.stringify({ unitId: repair.unit_id })]
          );
        }
        return repairDTO(row!);
      });
    },
    async listRepairs(unitId) {
      const rows = await query<RepairRow>(db, `SELECT * FROM equipment.repairs WHERE unit_id=$1 ORDER BY opened_at DESC`, [unitId]);
      return rows.map(repairDTO);
    },
    async listOpenRepairs() {
      const rows = await query<RepairRow>(db, `SELECT * FROM equipment.repairs WHERE status='open' ORDER BY opened_at DESC`);
      return rows.map(repairDTO);
    },
    async unitRepairCostEUR(unitId) {
      const row = await one<{ s: string }>(
        db,
        `SELECT COALESCE(SUM(cost_eur),0)::text AS s FROM equipment.repairs WHERE unit_id=$1 AND status='closed'`,
        [unitId]
      );
      return Number(row?.s ?? 0);
    },

    // ── Contractor handovers ──
    async sendToContractor(input) {
      return tx(async (client) => {
        const unit = await one<UnitRow>(client, `SELECT * FROM equipment.units WHERE id=$1 FOR UPDATE`, [input.unitId]);
        if (!unit) throw NotFound("unit", input.unitId);
        const contractor = await one<ContractorRow>(client, `SELECT * FROM equipment.contractors WHERE id=$1`, [input.contractorId]);
        if (!contractor) throw NotFound("contractor", input.contractorId);
        await query(client, `UPDATE equipment.units SET status='at_contractor' WHERE id=$1`, [input.unitId]);
        await query(
          client,
          `INSERT INTO equipment.handovers (unit_id, contractor_id, reason, note, expected_return, sent_by)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [input.unitId, input.contractorId, input.reason ?? null, input.note ?? null, input.expectedReturn ?? null, input.actorId]
        );
        await appendJournal(client, {
          unitId: input.unitId,
          action: "sent_to_contractor",
          fromStatus: unit.status,
          toStatus: "at_contractor",
          actorId: input.actorId,
          note: input.reason ?? contractor.name,
        });
        const row = await one<HandoverRow>(
          client,
          `SELECT h.*, c.name AS contractor_name FROM equipment.handovers h
           JOIN equipment.contractors c ON c.id=h.contractor_id
           WHERE h.unit_id=$1 ORDER BY h.sent_at DESC LIMIT 1`,
          [input.unitId]
        );
        return handoverDTO(row!);
      });
    },
    async returnFromContractor(id, input) {
      return tx(async (client) => {
        const ho = await one<HandoverRow>(
          client,
          `SELECT h.*, c.name AS contractor_name FROM equipment.handovers h
           JOIN equipment.contractors c ON c.id=h.contractor_id WHERE h.id=$1 FOR UPDATE OF h`,
          [id]
        );
        if (!ho) throw NotFound("handover", id);
        if (ho.status === "returned") throw BadRequest("уже возвращено");
        const unit = await one<UnitRow>(client, `SELECT * FROM equipment.units WHERE id=$1 FOR UPDATE`, [ho.unit_id]);
        await query(client, `UPDATE equipment.units SET status='in_stock' WHERE id=$1`, [ho.unit_id]);
        const row = await one<HandoverRow>(
          client,
          `UPDATE equipment.handovers SET status='returned', returned_by=$2, returned_at=now(), note=COALESCE($3,note)
           WHERE id=$1 RETURNING *, (SELECT name FROM equipment.contractors WHERE id=contractor_id) AS contractor_name`,
          [id, input.actorId, input.note ?? null]
        );
        await appendJournal(client, {
          unitId: ho.unit_id,
          action: "back_from_contractor",
          fromStatus: unit?.status ?? "at_contractor",
          toStatus: "in_stock",
          actorId: input.actorId,
          note: input.note ?? "возврат от подрядчика",
        });
        return handoverDTO(row!);
      });
    },
    async listHandovers(unitId) {
      const rows = await query<HandoverRow>(
        db,
        `SELECT h.*, c.name AS contractor_name FROM equipment.handovers h
         JOIN equipment.contractors c ON c.id=h.contractor_id
         WHERE h.unit_id=$1 ORDER BY h.sent_at DESC`,
        [unitId]
      );
      return rows.map(handoverDTO);
    },
    async listOpenHandovers() {
      const rows = await query<HandoverRow>(
        db,
        `SELECT h.*, c.name AS contractor_name FROM equipment.handovers h
         JOIN equipment.contractors c ON c.id=h.contractor_id
         WHERE h.status='out' ORDER BY h.sent_at DESC`
      );
      return rows.map(handoverDTO);
    },
  };
}
