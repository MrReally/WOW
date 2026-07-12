import type { Catalog } from "@sever/contracts";
import { one, query, tx, type Sql } from "../../core/db.js";
import { NotFound } from "../../core/errors.js";

type ItemRow = { id:string; sku:string; name:string; kind:Catalog.CatalogItemKind; group_name:string|null; base_unit:string; active:boolean; created_at:Date };
type PackRow = { id:string; item_id:string; name:string; coefficient:string; barcode:string|null; supplier_code:string|null; active:boolean };
type RecipeRow = { id:string; item_id:string; version:number; valid_from:Date; valid_to:Date|null; output_qty:string; output_unit:string; technology:string|null };
type LineRow = { id:string; ingredient_item_id:string; unit:string; gross_qty:string; net_qty:string; base_qty:string };
const itemDTO=(r:ItemRow):Catalog.CatalogItemDTO=>({id:r.id,sku:r.sku,name:r.name,kind:r.kind,groupName:r.group_name,baseUnit:r.base_unit,active:r.active,createdAt:r.created_at.toISOString()});
const packDTO=(r:PackRow):Catalog.PackagingUnitDTO=>({id:r.id,itemId:r.item_id,name:r.name,coefficient:Number(r.coefficient),barcode:r.barcode,supplierCode:r.supplier_code,active:r.active});

export function createCatalogService(db: Sql): Catalog.CatalogService {
 return {
  async listItems(){ return (await query<ItemRow>(db,`SELECT * FROM catalog.items ORDER BY group_name NULLS FIRST,name`)).map(itemDTO); },
  async createItem(input){ const r=await one<ItemRow>(db,`INSERT INTO catalog.items(sku,name,kind,group_name,base_unit) VALUES($1,$2,$3,$4,$5) RETURNING *`,[input.sku,input.name,input.kind,input.groupName??null,input.baseUnit]); return itemDTO(r!); },
  async listPackaging(itemId){ return (await query<PackRow>(db,`SELECT * FROM catalog.packaging_units WHERE item_id=$1 ORDER BY name`,[itemId])).map(packDTO); },
  async addPackaging(itemId,input){ if(!await one(db,`SELECT id FROM catalog.items WHERE id=$1`,[itemId])) throw NotFound("catalog item",itemId); const r=await one<PackRow>(db,`INSERT INTO catalog.packaging_units(item_id,name,coefficient,barcode,supplier_code,active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[itemId,input.name,input.coefficient,input.barcode,input.supplierCode,input.active]); return packDTO(r!); },
  async listRecipes(itemId){
    const recipes=await query<RecipeRow>(db,`SELECT * FROM catalog.recipe_versions WHERE item_id=$1 ORDER BY version DESC`,[itemId]);
    return Promise.all(recipes.map(async r=>({
      id:r.id,itemId:r.item_id,version:r.version,validFrom:r.valid_from.toISOString(),validTo:r.valid_to?.toISOString()??null,
      outputQty:Number(r.output_qty),outputUnit:r.output_unit,technology:r.technology,
      lines:(await query<LineRow>(db,`SELECT id,ingredient_item_id,unit,gross_qty,net_qty,base_qty FROM catalog.recipe_lines WHERE recipe_id=$1 ORDER BY id`,[r.id]))
        .map(l=>({id:l.id,ingredientItemId:l.ingredient_item_id,unit:l.unit,grossQty:Number(l.gross_qty),netQty:Number(l.net_qty),baseQty:Number(l.base_qty)}))
    })));
  },
  async createRecipe(itemId,input){ return tx(async client=>{ if(!await one(client,`SELECT id FROM catalog.items WHERE id=$1`,[itemId])) throw NotFound("catalog item",itemId); const r=await one<RecipeRow>(client,`INSERT INTO catalog.recipe_versions(item_id,version,valid_from,valid_to,output_qty,output_unit,technology) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[itemId,input.version,input.validFrom,input.validTo,input.outputQty,input.outputUnit,input.technology]); const lines=[]; for(const l of input.lines){ const row=await one<LineRow>(client,`INSERT INTO catalog.recipe_lines(recipe_id,ingredient_item_id,unit,gross_qty,net_qty,base_qty) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,ingredient_item_id,unit,gross_qty,net_qty,base_qty`,[r!.id,l.ingredientItemId,l.unit,l.grossQty,l.netQty,l.baseQty]); lines.push({id:row!.id,ingredientItemId:row!.ingredient_item_id,unit:row!.unit,grossQty:Number(row!.gross_qty),netQty:Number(row!.net_qty),baseQty:Number(row!.base_qty)}); } return {id:r!.id,itemId,version:r!.version,validFrom:r!.valid_from.toISOString(),validTo:r!.valid_to?.toISOString()??null,outputQty:Number(r!.output_qty),outputUnit:r!.output_unit,technology:r!.technology,lines}; }); }
 };
}
