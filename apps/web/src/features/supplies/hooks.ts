import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Catalog, Equipment, Supplies } from "@sever/contracts";
import { api } from "../../lib/api.ts";

const invalidate=(qc:ReturnType<typeof useQueryClient>)=>{qc.invalidateQueries({queryKey:["supplies"]});qc.invalidateQueries({queryKey:["catalog"]});};
export const useSupplyItems=()=>useQuery({queryKey:["catalog","items"],queryFn:()=>api.get<Catalog.CatalogItemDTO[]>("/api/catalog/items")});
export const useSupplyCategories=()=>useQuery({queryKey:["catalog","categories"],queryFn:()=>api.get<Catalog.CatalogCategoryDTO[]>("/api/catalog/categories")});
export const useSupplyWarehouses=()=>useQuery({queryKey:["equipment","warehouses"],queryFn:()=>api.get<Equipment.WarehouseDTO[]>("/api/equipment/warehouses")});
export const useSupplyStock=(warehouseId?:string)=>useQuery({queryKey:["supplies","stock",warehouseId??"all"],queryFn:()=>api.get<Supplies.SupplyStockDTO[]>(`/api/supplies/stock${warehouseId?`?warehouseId=${warehouseId}`:""}`)});
export const useSupplyContainers=(warehouseId?:string)=>useQuery({queryKey:["supplies","containers",warehouseId??"all"],queryFn:()=>api.get<Supplies.SupplyContainerDTO[]>(`/api/supplies/containers${warehouseId?`?warehouseId=${warehouseId}`:""}`)});
export const useSupplyMovements=(warehouseId?:string)=>useQuery({queryKey:["supplies","movements",warehouseId??"all"],queryFn:()=>api.get<Supplies.SupplyMovementDTO[]>(`/api/supplies/movements?limit=300${warehouseId?`&warehouseId=${warehouseId}`:""}`)});
export const useSupplyReceipts=(itemId?:string)=>useQuery({queryKey:["supplies","receipts",itemId??"all"],queryFn:()=>api.get<Supplies.SupplyReceiptDTO[]>(`/api/supplies/receipts${itemId?`?itemId=${itemId}`:""}`)});

export function useCreateSupplyCategory(){const qc=useQueryClient();return useMutation({mutationFn:(input:{name:string})=>api.post<Catalog.CatalogCategoryDTO>("/api/catalog/categories",input),onSuccess:()=>invalidate(qc),meta:{successMessage:"Категория создана"}});}
export function useCreateSupplyItem(){const qc=useQueryClient();return useMutation({mutationFn:(input:Catalog.CreateCatalogItemInput)=>api.post<Catalog.CatalogItemDTO>("/api/catalog/items",input),onSuccess:()=>invalidate(qc),meta:{successMessage:"Расходник создан"}});}
export function useSetSupplySettings(){const qc=useQueryClient();return useMutation({mutationFn:(input:Supplies.SetSupplySettingsInput)=>api.put<Supplies.SupplySettingsDTO>("/api/supplies/settings",input),onSuccess:()=>invalidate(qc),meta:{successMessage:"Пороги сохранены"}});}
export function useCreateSupplyContainer(){const qc=useQueryClient();return useMutation({mutationFn:(input:Supplies.CreateSupplyContainerInput)=>api.post<Supplies.SupplyContainerDTO>("/api/supplies/containers",input),onSuccess:()=>invalidate(qc),meta:{successMessage:"Ёмкость добавлена"}});}
export function useSetContainerLevel(){const qc=useQueryClient();return useMutation({mutationFn:({id,fillPercent}:{id:string;fillPercent:number})=>api.patch<Supplies.SupplyContainerDTO>(`/api/supplies/containers/${id}/level`,{fillPercent}),onSuccess:()=>invalidate(qc),meta:{successMessage:"Уровень обновлён"}});}
export function useCreateSupplyMovement(){const qc=useQueryClient();return useMutation({mutationFn:(input:Supplies.CreateSupplyMovementInput)=>api.post<Supplies.SupplyMovementDTO>("/api/supplies/movements",input),onSuccess:()=>invalidate(qc),meta:{successMessage:"Движение проведено"}});}
export function useCreateSupplyReceipt(){const qc=useQueryClient();return useMutation({mutationFn:(input:Supplies.CreateSupplyReceiptInput)=>api.post<Supplies.SupplyReceiptDTO>("/api/supplies/receipts",input),onSuccess:()=>invalidate(qc),meta:{successMessage:"Поставка принята"}});}
