import type { ID, ISODateTime } from "./common.js";

export type CatalogItemKind = "product" | "item" | "semi_finished" | "modifier" | "equipment_kit";
export interface CatalogItemDTO { id: ID; sku: string; name: string; kind: CatalogItemKind; groupName: string | null; baseUnit: string; active: boolean; createdAt: ISODateTime }
export interface PackagingUnitDTO { id: ID; itemId: ID; name: string; coefficient: number; barcode: string | null; supplierCode: string | null; active: boolean }
export interface RecipeVersionDTO { id: ID; itemId: ID; version: number; validFrom: ISODateTime; validTo: ISODateTime | null; outputQty: number; outputUnit: string; technology: string | null; lines: RecipeLineDTO[] }
export interface RecipeLineDTO { id: ID; ingredientItemId: ID; unit: string; grossQty: number; netQty: number; baseQty: number }
export interface CreateCatalogItemInput { sku: string; name: string; kind: CatalogItemKind; groupName?: string | null; baseUnit: string }
export interface CatalogService { listItems(): Promise<CatalogItemDTO[]>; createItem(input: CreateCatalogItemInput): Promise<CatalogItemDTO>; listPackaging(itemId: ID): Promise<PackagingUnitDTO[]>; addPackaging(itemId: ID, input: Omit<PackagingUnitDTO, "id" | "itemId">): Promise<PackagingUnitDTO>; listRecipes(itemId: ID): Promise<RecipeVersionDTO[]>; createRecipe(itemId: ID, input: Omit<RecipeVersionDTO, "id" | "itemId" | "lines"> & { lines: Omit<RecipeLineDTO, "id">[] }): Promise<RecipeVersionDTO> }
