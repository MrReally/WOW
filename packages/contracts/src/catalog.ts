import type { ID, ISODateTime } from "./common.js";

export type CatalogItemKind = "product" | "item" | "semi_finished" | "modifier" | "equipment_kit";
export type CatalogMeasurementKind = "count" | "length" | "liquid";
export interface CatalogCategoryDTO { id: ID; name: string; active: boolean; sortOrder: number; createdAt: ISODateTime }
export interface CatalogItemDTO { id: ID; sku: string; name: string; kind: CatalogItemKind; categoryId: ID | null; groupName: string | null; measurementKind: CatalogMeasurementKind; baseUnit: string; active: boolean; createdAt: ISODateTime }
export interface PackagingUnitDTO { id: ID; itemId: ID; name: string; coefficient: number; barcode: string | null; supplierCode: string | null; active: boolean }
export interface RecipeVersionDTO { id: ID; itemId: ID; version: number; validFrom: ISODateTime; validTo: ISODateTime | null; outputQty: number; outputUnit: string; technology: string | null; lines: RecipeLineDTO[] }
export interface RecipeLineDTO { id: ID; ingredientItemId: ID; unit: string; grossQty: number; netQty: number; baseQty: number }
export interface CreateCatalogItemInput { sku: string; name: string; kind: CatalogItemKind; categoryId?: ID | null; groupName?: string | null; measurementKind?: CatalogMeasurementKind; baseUnit: string }
export interface CatalogService { listCategories(includeArchived?: boolean): Promise<CatalogCategoryDTO[]>; createCategory(input: { name: string; sortOrder?: number }): Promise<CatalogCategoryDTO>; updateCategory(id: ID, input: { name?: string; active?: boolean; sortOrder?: number }): Promise<CatalogCategoryDTO>; listItems(): Promise<CatalogItemDTO[]>; getItem(id: ID): Promise<CatalogItemDTO | null>; createItem(input: CreateCatalogItemInput): Promise<CatalogItemDTO>; listPackaging(itemId: ID): Promise<PackagingUnitDTO[]>; addPackaging(itemId: ID, input: Omit<PackagingUnitDTO, "id" | "itemId">): Promise<PackagingUnitDTO>; listRecipes(itemId: ID): Promise<RecipeVersionDTO[]>; createRecipe(itemId: ID, input: Omit<RecipeVersionDTO, "id" | "itemId" | "lines"> & { lines: Omit<RecipeLineDTO, "id">[] }): Promise<RecipeVersionDTO> }
