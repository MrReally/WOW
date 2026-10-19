import type { ID, ISODateTime } from "./common.js";
import type { EquipmentUnitDTO, UnitStatus } from "./equipment.js";

export type OperationDocumentKind = "issue" | "return" | "transfer" | "inventory";
export type OperationDocumentStatus = "draft" | "posted" | "reversed";
export interface InventoryLine { unitId: ID; present: boolean; beforeStatus?: UnitStatus; result?: InventorySerialResult; comment?: string | null }
export interface InventoryQuantityLine { modelId:ID; zoneId:ID|null; expectedQty:number; actualQty:number }
export interface InventoryAddedUnitLine { modelId:ID; unitId:ID; zoneId:ID|null; assetTag:string; serial:string|null }
export interface InventoryCorrectionLine { lineKey:string; serialResult:InventorySerialResult|null; actualQty:number|null; actorId:ID; actorName:string; createdAt:ISODateTime }
export interface QuantityOperationLine { modelId: ID; warehouseId?: ID | null; qty: number }
export type OperationPayload =
  | { kind: "issue"; projectId: ID; unitIds: ID[]; reservationId?: ID | null; quantityLines?: QuantityOperationLine[]; note?: string | null }
  | { kind: "return"; projectId: ID; returnedUnitIds: ID[]; expectedUnitIds: ID[]; warehouseId?: ID | null; venueId?: ID | null; quantityLines?: QuantityOperationLine[]; note?: string | null }
  | { kind: "transfer"; unitId: ID; warehouseId: ID; fromWarehouseId?: ID | null; note?: string | null }
  | { kind: "inventory"; warehouseId?: ID | null; lines: InventoryLine[]; quantityLines?:InventoryQuantityLine[]; addedUnits?:InventoryAddedUnitLine[]; corrections?:InventoryCorrectionLine[]; note?: string | null };
export type OperationDocumentInput = OperationPayload & { documentAt?: ISODateTime };
export interface OperationDocumentDTO { id: ID; number: string; kind: OperationDocumentKind; status: OperationDocumentStatus; payload: OperationPayload; documentAt: ISODateTime; version: number; createdBy: ID; createdAt: ISODateTime; updatedBy: ID; updatedAt: ISODateTime; postedAt: ISODateTime | null; reversedAt: ISODateTime | null }
export type OperationRevisionAction="created"|"edited"|"posted"|"reversed";
export interface OperationRevisionDTO { id:ID; documentId:ID; version:number; action:OperationRevisionAction; payload:OperationPayload; documentAt:ISODateTime; actorId:ID; createdAt:ISODateTime }
export interface OperationsService { list(): Promise<OperationDocumentDTO[]>; get(id: ID): Promise<OperationDocumentDTO | null>; history(id:ID):Promise<OperationRevisionDTO[]>; create(payload: OperationPayload, actorId: ID, documentAt?:ISODateTime): Promise<OperationDocumentDTO>; update(id:ID,payload:OperationPayload,actorId:ID,documentAt?:ISODateTime):Promise<OperationDocumentDTO>; post(id: ID, actorId: ID): Promise<OperationDocumentDTO>; reverse(id: ID, actorId: ID): Promise<OperationDocumentDTO>; relocateReturnedUnit(projectId:ID,unitId:ID,warehouseId:ID,actorId:ID):Promise<void>; reverseReturn(projectId:ID,unitId:ID,actorId:ID):Promise<EquipmentUnitDTO>;
  listInventoryProcesses(activeOnly?:boolean):Promise<InventoryProcessDTO[]>; getInventoryProcess(id:ID):Promise<InventoryProcessDTO|null>;
  createInventoryProcess(input:CreateInventoryProcessInput,actorId:ID):Promise<InventoryProcessDTO>;
  assignInventoryZone(processId:ID,zoneKey:string,userId:ID,userName:string):Promise<InventoryProcessDTO>;
  releaseInventoryZone(processId:ID,zoneKey:string,actorId:ID,isChief:boolean):Promise<InventoryProcessDTO>;
  saveInventoryEntry(processId:ID,input:SaveInventoryEntryInput,actorId:ID,actorName:string):Promise<InventoryEntryDTO>;
  completeInventoryZone(processId:ID,zoneKey:string,actorId:ID):Promise<InventoryProcessDTO>;
  reviewInventoryProcess(id:ID,allowIncomplete:boolean):Promise<InventoryProcessDTO>;
  setInventoryExpectedVisibility(id:ID,hideExpected:boolean):Promise<InventoryProcessDTO>;
  completeInventoryProcess(id:ID,input:CompleteInventoryInput,actorId:ID):Promise<InventoryProcessDTO>;
  cancelInventoryProcess(id:ID,actorId:ID):Promise<InventoryProcessDTO>;
  reverseInventoryProcess(id:ID,input:{keepRepairUnitIds:string[];keepCreatedUnitIds:string[]},actorId:ID):Promise<InventoryProcessDTO>;
  listInventorySchedules():Promise<InventoryScheduleDTO[]>;
  createInventorySchedule(input:Omit<InventoryScheduleDTO,"id"|"createdBy"|"createdAt"|"nextRunAt">,actorId:ID):Promise<InventoryScheduleDTO>;
}

export type InventoryFrequency = "daily" | "weekly" | "monthly" | "interval";
export type InventoryProcessStatus = "active" | "review" | "completed" | "cancelled";
export type InventoryCompleteness = "partial" | "full";
export type InventorySerialResult = "ok" | "repair" | "lost";
export const INVENTORY_UNASSIGNED_ZONE = "__unassigned__";

export interface InventoryScheduleDTO {
  id: ID; warehouseId: ID; frequency: InventoryFrequency; intervalDays: number | null;
  launchTime: string; timeZone: string; hideExpected: boolean; active: boolean;
  nextRunAt: ISODateTime; createdBy: ID; createdAt: ISODateTime;
}
export interface InventorySnapshotLineDTO {
  key: string; kind: "serial" | "quantity"; categoryId: ID | null; categoryName: string;
  modelId: ID; modelName: string; trackingMode: "serial" | "quantity" | "cable";
  zoneId: ID | null; unitId?: ID; assetTag?: string; serial?: string | null;
  expectedStatus?: UnitStatus; expectedQty?: number; countable: boolean;
}
export interface InventoryEntryDTO {
  id: ID; processId: ID; lineKey: string; zoneKey: string;
  kind: "serial" | "quantity" | "add_serial";
  serialResult: InventorySerialResult | null; actualQty: number | null; comment: string | null;
  addedModelId: ID | null; addedAssetTag: string | null; addedSerial: string | null; createdUnitId: ID | null;
  actorId: ID; actorName: string; correctionOf: ID | null; createdAt: ISODateTime;
}
export interface InventoryZoneWorkDTO {
  zoneKey: string; zoneId: ID | null; parentId: ID | null; zoneName: string; assignedTo: ID | null;
  assignedToName: string | null; status: "open" | "in_progress" | "completed";
}
export interface InventoryProcessDTO {
  id: ID; warehouseId: ID; warehouseName: string; scheduleId: ID | null;
  parentProcessId: ID | null; status: InventoryProcessStatus; completeness: InventoryCompleteness;
  hideExpected: boolean; snapshotAt: ISODateTime; documentId: ID | null;
  createdBy: ID; completedBy: ID | null; completedAt: ISODateTime | null; createdAt: ISODateTime;
  appliedLineKeys: string[];
  snapshot: InventorySnapshotLineDTO[]; zones: InventoryZoneWorkDTO[]; entries: InventoryEntryDTO[];
}
export interface CreateInventoryProcessInput { warehouseId: ID; hideExpected?: boolean; parentProcessId?: ID | null }
export interface SaveInventoryEntryInput {
  lineKey: string; zoneKey: string; kind: "serial" | "quantity" | "add_serial";
  serialResult?: InventorySerialResult | null; actualQty?: number | null; comment?: string | null;
  addedModelId?: ID | null; addedAssetTag?: string | null; addedSerial?: string | null;
}
export interface CompleteInventoryInput { applyLineKeys?: string[] }
