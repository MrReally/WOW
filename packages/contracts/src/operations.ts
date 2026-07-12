import type { ID, ISODateTime } from "./common.js";
import type { UnitStatus } from "./equipment.js";

export type OperationDocumentKind = "issue" | "return" | "transfer" | "inventory";
export type OperationDocumentStatus = "draft" | "posted" | "reversed";
export interface InventoryLine { unitId: ID; present: boolean; beforeStatus?: UnitStatus }
export type OperationPayload =
  | { kind: "issue"; projectId: ID; unitIds: ID[]; note?: string | null }
  | { kind: "return"; projectId: ID; returnedUnitIds: ID[]; expectedUnitIds: ID[]; note?: string | null }
  | { kind: "transfer"; unitId: ID; warehouseId: ID; fromWarehouseId?: ID | null; note?: string | null }
  | { kind: "inventory"; warehouseId?: ID | null; lines: InventoryLine[]; note?: string | null };
export interface OperationDocumentDTO { id: ID; number: string; kind: OperationDocumentKind; status: OperationDocumentStatus; payload: OperationPayload; createdBy: ID; createdAt: ISODateTime; postedAt: ISODateTime | null; reversedAt: ISODateTime | null }
export interface OperationsService { list(): Promise<OperationDocumentDTO[]>; get(id: ID): Promise<OperationDocumentDTO | null>; create(payload: OperationPayload, actorId: ID): Promise<OperationDocumentDTO>; post(id: ID, actorId: ID): Promise<OperationDocumentDTO>; reverse(id: ID, actorId: ID): Promise<OperationDocumentDTO> }
