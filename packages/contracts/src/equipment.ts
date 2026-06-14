import type { ID, ISODateTime, Problem } from "./common.js";

// ── Status model (no "written off" status, by design) ────────────────────────

export type UnitStatus =
  | "in_stock" // на складе
  | "reserved" // зарезервировано
  | "on_project" // на проекте
  | "in_repair" // в ремонте
  | "at_contractor" // у подрядчика
  | "lost"; // утеряно

export const UNIT_STATUSES: UnitStatus[] = [
  "in_stock",
  "reserved",
  "on_project",
  "in_repair",
  "at_contractor",
  "lost",
];

/** Human labels (ru) live in the UI; contract keeps stable machine codes. */

// ── DTOs: Type → Model → Unit hierarchy ──────────────────────────────────────

export interface EquipmentTypeDTO {
  id: ID;
  name: string;
  /** Cables are counted quantitatively per model, not by serial unit. */
  trackingMode: "serial" | "quantity";
  createdAt: ISODateTime;
}

export interface EquipmentModelDTO {
  id: ID;
  typeId: ID;
  name: string;
  manufacturer: string | null;
  /** Purchase/replacement cost in EUR — basis for payback. */
  unitCostEUR: number;
  /** Default daily rental price in EUR. */
  dailyPriceEUR: number;
  /** For quantity-tracked models (cables): properties of the model. */
  attrs: CableAttrs | Record<string, unknown> | null;
  /** Component model ids required when issuing a unit of this model. */
  requiredComponentModelIds: ID[];
  createdAt: ISODateTime;
}

export interface CableAttrs {
  cableType: string; // e.g. "DMX", "PowerCON", "XLR"
  lengthM: number;
  connectors: string; // e.g. "XLR3 male/female"
}

export interface EquipmentUnitDTO {
  id: ID;
  modelId: ID;
  /** Asset tag / marking shown on the physical item. */
  assetTag: string;
  serial: string | null;
  status: UnitStatus;
  /** Opaque id of the project the unit is currently on (or reserved for). */
  currentProjectId: ID | null;
  /** Earned revenue in EUR attributed to this unit (kept by finance, mirrored). */
  createdAt: ISODateTime;
}

/** For quantity-tracked models, current counts derived from the journal. */
export interface ModelStockDTO {
  modelId: ID;
  total: number;
  inStock: number;
  onProjects: number;
  inRepair: number;
}

// ── Journal: append-only event log per unit ─────────────────────────────────

export type JournalAction =
  | "created"
  | "reserved"
  | "issued" // выдано на проект
  | "returned" // возвращено полностью
  | "return_incomplete" // возврат с некомплектом
  | "sent_to_repair"
  | "back_from_repair"
  | "sent_to_contractor"
  | "marked_lost"
  | "status_changed";

export interface JournalEntryDTO {
  id: ID;
  unitId: ID;
  action: JournalAction;
  fromStatus: UnitStatus | null;
  toStatus: UnitStatus | null;
  projectId: ID | null;
  /** Who performed it (people.userId). */
  actorId: ID | null;
  note: string | null;
  at: ISODateTime;
}

// ── Issue / return flow inputs ───────────────────────────────────────────────

export interface IssueUnitsInput {
  projectId: ID;
  unitIds: ID[];
  actorId: ID;
  note?: string;
}

export interface ReturnUnitsInput {
  projectId: ID;
  /** Units actually returned. Missing ones from the issued set => некомплект. */
  returnedUnitIds: ID[];
  /** The full set that was expected back (issued for this project). */
  expectedUnitIds: ID[];
  actorId: ID;
  note?: string;
}

export interface ReturnResult {
  returned: ID[];
  missing: ID[];
  /** Set when missing.length > 0; problem id surfaced to Apex. */
  problemId: ID | null;
}

// ── Public service contract ──────────────────────────────────────────────────

export interface EquipmentService {
  // Catalog
  listTypes(): Promise<EquipmentTypeDTO[]>;
  createType(input: { name: string; trackingMode: "serial" | "quantity" }): Promise<EquipmentTypeDTO>;
  listModels(typeId?: ID): Promise<EquipmentModelDTO[]>;
  getModel(id: ID): Promise<EquipmentModelDTO | null>;
  createModel(input: CreateModelInput): Promise<EquipmentModelDTO>;

  // Units
  listUnits(filter?: { modelId?: ID; status?: UnitStatus; projectId?: ID }): Promise<EquipmentUnitDTO[]>;
  getUnit(id: ID): Promise<EquipmentUnitDTO | null>;
  createUnit(input: { modelId: ID; assetTag: string; serial?: string | null }): Promise<EquipmentUnitDTO>;
  getUnitJournal(unitId: ID): Promise<JournalEntryDTO[]>;
  modelStock(modelId: ID): Promise<ModelStockDTO>;

  // Operations (Tech phone flow + warehouse)
  issueUnits(input: IssueUnitsInput): Promise<EquipmentUnitDTO[]>;
  returnUnits(input: ReturnUnitsInput): Promise<ReturnResult>;
  changeStatus(unitId: ID, toStatus: UnitStatus, actorId: ID, note?: string): Promise<EquipmentUnitDTO>;

  /** Count of units currently on a given project (for finance/apex). */
  countUnitsOnProject(projectId: ID): Promise<number>;

  // Problems detected by this module (некомплект, lost units).
  listProblems(opts?: { includeResolved?: boolean }): Promise<Problem[]>;
  resolveProblem(id: ID): Promise<void>;
}

export interface CreateModelInput {
  typeId: ID;
  name: string;
  manufacturer?: string | null;
  unitCostEUR: number;
  dailyPriceEUR: number;
  attrs?: CableAttrs | Record<string, unknown> | null;
  requiredComponentModelIds?: ID[];
}

// ── Domain events (in-process bus now, broker later) ─────────────────────────

export interface UnitIssuedEvent {
  type: "equipment.unit.issued";
  unitId: ID;
  modelId: ID;
  projectId: ID;
  actorId: ID;
  at: ISODateTime;
}

export interface UnitReturnedEvent {
  type: "equipment.unit.returned";
  unitId: ID;
  projectId: ID;
  complete: boolean;
  at: ISODateTime;
}

export interface IncompleteReturnEvent {
  type: "equipment.return.incomplete";
  projectId: ID;
  missingUnitIds: ID[];
  at: ISODateTime;
}

export type EquipmentEvent = UnitIssuedEvent | UnitReturnedEvent | IncompleteReturnEvent;
