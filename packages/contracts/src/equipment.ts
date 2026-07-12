import type { ID, ISODateTime, Problem } from "./common.js";

export type TrackingMode = "serial" | "quantity" | "cable";

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
  /** Serial units, generic counted stock, or cable stock with cable attrs. */
  trackingMode: TrackingMode;
  createdAt: ISODateTime;
}

export interface EquipmentModelDTO {
  id: ID;
  typeId: ID;
  /** Inherited from the model's type — serial units vs counted quantity. */
  trackingMode: TrackingMode;
  name: string;
  manufacturer: string | null;
  /** Purchase/replacement cost in EUR — basis for payback. */
  unitCostEUR: number;
  /** Default daily rental price in EUR. */
  dailyPriceEUR: number;
  /** For cable models: structured cable properties. */
  attrs: CableAttrs | Record<string, unknown> | null;
  /** Component model ids required when issuing a unit of this model. */
  requiredComponentModelIds: ID[];
  createdAt: ISODateTime;
}

export interface CableAttrs {
  cableType: string; // e.g. "DMX", "Power", "Audio"
  lengthM: number;
  sideAConnector: string;
  sideAQty: number;
  sideBConnector: string;
  sideBQty: number;
  /** Legacy/import compatibility. */
  connectors?: string | null;
}

export interface CableSettingsDTO {
  connectors: string[];
  nameFormat: string[];
}

export interface EquipmentUnitDTO {
  id: ID;
  modelId: ID;
  /** Asset tag / marking shown on the physical item. */
  assetTag: string;
  serial: string | null;
  status: UnitStatus;
  /** Current storage location for this unit when it is in our warehouse flow. */
  warehouseId: ID | null;
  /** Opaque id of the project the unit is currently on (or reserved for). */
  currentProjectId: ID | null;
  /** Free-form per-unit notes: unique defects, quirks, marks, accessories. */
  notes: string | null;
  createdAt: ISODateTime;
}

/** For quantity-tracked models, current counts derived from the journal. */
export interface ModelStockDTO {
  modelId: ID;
  /** Null means aggregate across all warehouses. */
  warehouseId: ID | null;
  total: number;
  inStock: number;
  onProjects: number;
  inRepair: number;
}

// ── Warehouses ───────────────────────────────────────────────────────────────

export interface WarehouseDTO {
  id: ID;
  name: string;
  address: string | null;
  isDefault: boolean;
  createdAt: ISODateTime;
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
  | "back_from_contractor"
  | "marked_lost"
  | "transferred"
  | "status_changed";

export interface JournalEntryDTO {
  id: ID;
  /** Set for serial units; null for quantity (cable) moves which are model-level. */
  unitId: ID | null;
  /** Set for quantity (cable) moves; null for serial-unit entries. */
  modelId: ID | null;
  /** Quantity moved, for quantity (cable) entries. */
  qty: number | null;
  action: JournalAction;
  fromStatus: UnitStatus | null;
  toStatus: UnitStatus | null;
  projectId: ID | null;
  warehouseId: ID | null;
  fromWarehouseId: ID | null;
  toWarehouseId: ID | null;
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

// ── Quantity (cable) operations — no serials, counted per model ──────────────

export interface QuantityMoveInput {
  projectId: ID;
  modelId: ID;
  warehouseId?: ID | null;
  qty: number;
  actorId: ID;
  note?: string;
}

export interface QuantityServiceInput {
  modelId: ID;
  warehouseId?: ID | null;
  qty: number;
  actorId: ID;
  note?: string | null;
  costEUR?: number | null;
}

export interface TransferQuantityInput {
  modelId: ID;
  fromWarehouseId: ID;
  toWarehouseId: ID;
  qty: number;
  actorId: ID;
  note?: string;
}

// ── CSV import ───────────────────────────────────────────────────────────────

export interface ImportRow {
  type: string;
  trackingMode: TrackingMode;
  model: string;
  manufacturer?: string | null;
  unitCostEUR?: number;
  dailyPriceEUR?: number;
  /** Serial rows: one unit per row. */
  assetTag?: string | null;
  serial?: string | null;
  /** Quantity rows: stock count to set/add for the model. */
  qty?: number | null;
  /** Cable attributes (quantity rows). */
  cableType?: string | null;
  lengthM?: number | null;
  sideAConnector?: string | null;
  sideAQty?: number | null;
  sideBConnector?: string | null;
  sideBQty?: number | null;
  connectors?: string | null;
}

export interface ImportResult {
  typesCreated: number;
  modelsCreated: number;
  unitsCreated: number;
  stockUpdated: number;
  skipped: number;
  errors: string[];
}

// ── Repairs & contractors (full cycle: send out → take back, with history) ───

export interface ContractorDTO {
  id: ID;
  name: string;
  contacts: string | null;
  createdAt: ISODateTime;
}

export type RepairOutcome = "repaired" | "written_off";

export interface RepairDTO {
  id: ID;
  unitId: ID;
  status: "open" | "closed";
  problem: string;
  vendor: string | null;
  estCostEUR: number | null;
  costEUR: number | null;
  resolution: string | null;
  outcome: RepairOutcome | null;
  openedBy: ID | null;
  openedAt: ISODateTime;
  closedBy: ID | null;
  closedAt: ISODateTime | null;
}

export interface OpenRepairInput {
  unitId: ID;
  problem: string;
  vendor?: string | null;
  estCostEUR?: number | null;
  actorId: ID;
}

export interface CloseRepairInput {
  costEUR?: number | null;
  resolution?: string | null;
  outcome: RepairOutcome;
  actorId: ID;
}

export interface HandoverDTO {
  id: ID;
  unitId: ID;
  contractorId: ID;
  contractorName: string;
  status: "out" | "returned";
  reason: string | null;
  note: string | null;
  costEUR: number | null;
  expectedReturn: ISODateTime | null;
  sentBy: ID | null;
  sentAt: ISODateTime;
  returnedBy: ID | null;
  returnedAt: ISODateTime | null;
}

export interface SendToContractorInput {
  unitId: ID;
  contractorId: ID;
  reason?: string | null;
  note?: string | null;
  costEUR?: number | null;
  expectedReturn?: ISODateTime | null;
  actorId: ID;
}

// ── Public service contract ──────────────────────────────────────────────────

export interface EquipmentService {
  // Warehouses
  listWarehouses(): Promise<WarehouseDTO[]>;
  createWarehouse(input: { name: string; address?: string | null }): Promise<WarehouseDTO>;
  updateWarehouse(id: ID, input: { name?: string; address?: string | null; isDefault?: boolean }): Promise<WarehouseDTO>;

  // Catalog
  listTypes(): Promise<EquipmentTypeDTO[]>;
  getCableSettings(): Promise<CableSettingsDTO>;
  updateCableSettings(input: CableSettingsDTO): Promise<CableSettingsDTO>;
  createType(input: { name: string; trackingMode: TrackingMode }): Promise<EquipmentTypeDTO>;
  updateType(id: ID, input: { name?: string }): Promise<EquipmentTypeDTO>;
  listModels(typeId?: ID): Promise<EquipmentModelDTO[]>;
  getModel(id: ID): Promise<EquipmentModelDTO | null>;
  createModel(input: CreateModelInput): Promise<EquipmentModelDTO>;
  updateModel(id: ID, input: UpdateModelInput): Promise<EquipmentModelDTO>;
  setModelTrackingMode(id: ID, trackingMode: TrackingMode): Promise<EquipmentModelDTO>;
  deleteModel(id: ID): Promise<void>;

  // Units
  listUnits(filter?: { modelId?: ID; status?: UnitStatus; projectId?: ID; warehouseId?: ID }): Promise<EquipmentUnitDTO[]>;
  getUnit(id: ID): Promise<EquipmentUnitDTO | null>;
  createUnit(input: { modelId: ID; assetTag: string; serial?: string | null; notes?: string | null; warehouseId?: ID | null }): Promise<EquipmentUnitDTO>;
  /** Edit per-unit particulars (visible name/tag, serial, defects/notes). */
  updateUnit(id: ID, input: { modelId?: ID; assetTag?: string; serial?: string | null; notes?: string | null }): Promise<EquipmentUnitDTO>;
  getUnitJournal(unitId: ID): Promise<JournalEntryDTO[]>;
  getJournalByActor(actorId: ID): Promise<JournalEntryDTO[]>;
  /** Cross-unit append-only movement projection for Backoffice reports. */
  listJournal(filter?: { limit?: number; projectId?: ID; warehouseId?: ID }): Promise<JournalEntryDTO[]>;
  modelStock(modelId: ID, warehouseId?: ID | null): Promise<ModelStockDTO>;
  transferUnit(unitId: ID, warehouseId: ID, actorId: ID, note?: string | null): Promise<EquipmentUnitDTO>;

  // Quantity (cable) stock — models whose type is tracked by quantity.
  setModelStockTotal(modelId: ID, total: number, warehouseId?: ID | null): Promise<ModelStockDTO>;
  issueQuantity(input: QuantityMoveInput): Promise<ModelStockDTO>;
  returnQuantity(input: QuantityMoveInput): Promise<ModelStockDTO>;
  transferQuantity(input: TransferQuantityInput): Promise<ModelStockDTO>;
  sendQuantityToRepair(input: QuantityServiceInput): Promise<ModelStockDTO>;
  sendQuantityToContractor(input: QuantityServiceInput): Promise<ModelStockDTO>;

  // Bulk catalog import (CSV parsed upstream into rows).
  importCatalog(rows: ImportRow[]): Promise<ImportResult>;

  // Operations (Tech phone flow + warehouse)
  issueUnits(input: IssueUnitsInput): Promise<EquipmentUnitDTO[]>;
  returnUnits(input: ReturnUnitsInput): Promise<ReturnResult>;
  changeStatus(unitId: ID, toStatus: UnitStatus, actorId: ID, note?: string): Promise<EquipmentUnitDTO>;

  /** Count of units currently on a given project (for finance/apex). */
  countUnitsOnProject(projectId: ID): Promise<number>;

  // Problems detected by this module (некомплект, lost units).
  listProblems(opts?: { includeResolved?: boolean }): Promise<Problem[]>;
  resolveProblem(id: ID): Promise<void>;

  // Contractors directory
  listContractors(): Promise<ContractorDTO[]>;
  createContractor(input: { name: string; contacts?: string | null }): Promise<ContractorDTO>;
  updateContractor(id: ID, input: { name?: string; contacts?: string | null }): Promise<ContractorDTO>;

  // Repairs
  openRepair(input: OpenRepairInput): Promise<RepairDTO>;
  closeRepair(id: ID, input: CloseRepairInput): Promise<RepairDTO>;
  listRepairs(unitId: ID): Promise<RepairDTO[]>;
  listOpenRepairs(): Promise<RepairDTO[]>;
  /** Total spent on closed repairs of a unit (EUR). */
  unitRepairCostEUR(unitId: ID): Promise<number>;

  // Contractor handovers
  sendToContractor(input: SendToContractorInput): Promise<HandoverDTO>;
  returnFromContractor(id: ID, input: { note?: string | null; actorId: ID }): Promise<HandoverDTO>;
  listHandovers(unitId: ID): Promise<HandoverDTO[]>;
  listOpenHandovers(): Promise<HandoverDTO[]>;
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

export interface UpdateModelInput {
  typeId?: ID;
  name?: string;
  manufacturer?: string | null;
  unitCostEUR?: number;
  dailyPriceEUR?: number;
  attrs?: CableAttrs | Record<string, unknown> | null;
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
  actorId?: ID | null;
  at: ISODateTime;
}

export interface UnitTransferredEvent {
  type: "equipment.unit.transferred";
  unitId: ID;
  fromWarehouseId: ID | null;
  toWarehouseId: ID;
  actorId: ID;
  at: ISODateTime;
}

export interface IncompleteReturnEvent {
  type: "equipment.return.incomplete";
  projectId: ID;
  missingUnitIds: ID[];
  at: ISODateTime;
}

/** One event per issue action (batch), to drive notifications without spam. */
export interface UnitsIssuedBatchEvent {
  type: "equipment.units.issued";
  projectId: ID;
  count: number;
  actorId: ID;
  at: ISODateTime;
}

export type EquipmentEvent = UnitIssuedEvent | UnitReturnedEvent | UnitTransferredEvent | IncompleteReturnEvent | UnitsIssuedBatchEvent;
