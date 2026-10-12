import type { Currency, ID, ISODateTime } from "./common.js";

export type SupplyMovementAction = "receipt" | "consume" | "adjust" | "write_off" | "transfer_in" | "transfer_out";

export interface SupplySettingsDTO {
  itemId: ID;
  warehouseId: ID;
  minimumQty: number;
  maximumQty: number;
  /** Quantity already ordered but not yet received. */
  incomingQty: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface SupplyStockDTO extends SupplySettingsDTO {
  currentQty: number;
  needsReorder: boolean;
  recommendedOrderQty: number;
}

export interface SupplyContainerDTO {
  id: ID;
  itemId: ID;
  warehouseId: ID;
  label: string;
  capacityLiters: number;
  currentLiters: number;
  fillPercent: number;
  active: boolean;
  createdAt: ISODateTime;
}

export interface SupplyMovementDTO {
  id: ID;
  itemId: ID;
  containerId: ID | null;
  warehouseId: ID;
  action: SupplyMovementAction;
  /** Signed quantity in the catalog item's base unit. Liquids use liters. */
  quantity: number;
  projectId: ID | null;
  receiptId: ID | null;
  note: string | null;
  actorId: ID;
  createdAt: ISODateTime;
}

export interface SupplyReceiptDTO {
  id: ID;
  itemId: ID;
  warehouseId: ID;
  containerId: ID | null;
  quantity: number;
  packageCount: number | null;
  packageLabel: string | null;
  supplierName: string | null;
  currency: Currency;
  totalPrice: number;
  fxRateToEUR: number;
  totalEUR: number;
  unitPrice: number;
  unitPriceEUR: number;
  note: string | null;
  receivedAt: ISODateTime;
  actorId: ID;
  createdAt: ISODateTime;
}

export interface SetSupplySettingsInput {
  itemId: ID;
  warehouseId: ID;
  minimumQty: number;
  maximumQty: number;
  incomingQty?: number;
}

export interface CreateSupplyContainerInput {
  itemId: ID;
  warehouseId: ID;
  label: string;
  capacityLiters: number;
  initialLiters?: number;
  note?: string | null;
}

export interface CreateSupplyMovementInput {
  itemId: ID;
  warehouseId: ID;
  containerId?: ID | null;
  action: Exclude<SupplyMovementAction, "receipt" | "transfer_in" | "transfer_out">;
  /** Positive magnitude. The service applies the sign required by action. */
  quantity: number;
  projectId?: ID | null;
  note?: string | null;
}

export interface CreateSupplyReceiptInput {
  itemId: ID;
  warehouseId: ID;
  containerId?: ID | null;
  quantity: number;
  packageCount?: number | null;
  packageLabel?: string | null;
  supplierName?: string | null;
  currency: Currency;
  totalPrice: number;
  fxRateToEUR: number;
  note?: string | null;
  receivedAt?: ISODateTime;
}

export interface SuppliesService {
  listStock(warehouseId?: ID): Promise<SupplyStockDTO[]>;
  setSettings(input: SetSupplySettingsInput): Promise<SupplySettingsDTO>;
  listContainers(itemId?: ID, warehouseId?: ID): Promise<SupplyContainerDTO[]>;
  createContainer(input: CreateSupplyContainerInput, actorId: ID): Promise<SupplyContainerDTO>;
  setContainerLevel(containerId: ID, fillPercent: number, actorId: ID, note?: string | null): Promise<SupplyContainerDTO>;
  createMovement(input: CreateSupplyMovementInput, actorId: ID): Promise<SupplyMovementDTO>;
  listMovements(filter?: { itemId?: ID; warehouseId?: ID; limit?: number }): Promise<SupplyMovementDTO[]>;
  createReceipt(input: CreateSupplyReceiptInput, actorId: ID): Promise<SupplyReceiptDTO>;
  listReceipts(itemId?: ID): Promise<SupplyReceiptDTO[]>;
}
