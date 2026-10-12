import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool } from "../src/core/db.js";
import { runMigrations } from "../src/core/migrate.js";
import { createModules } from "../src/registry.js";

const wiring=createModules();
let warehouseId="",liquidId="",actorId="";

beforeAll(async()=>{
  await runMigrations();
  actorId=randomUUID();
  warehouseId=(await wiring.equipment.service.listWarehouses())[0]!.id;
  const category=await wiring.catalog.service.createCategory({name:`Жидкости ${randomUUID().slice(0,8)}`});
  liquidId=(await wiring.catalog.service.createItem({sku:`FOG-${randomUUID().slice(0,8)}`,name:"Тестовая дым-жидкость",kind:"product",categoryId:category.id,measurementKind:"liquid",baseUnit:"l"})).id;
});
afterAll(async()=>closePool());

describe("supplies",()=>{
  it("calculates min/max replenishment in liters",async()=>{
    await wiring.supplies.service.setSettings({itemId:liquidId,warehouseId,minimumQty:5,maximumQty:20,incomingQty:2});
    expect(await wiring.supplies.service.listStock(warehouseId)).toContainEqual(expect.objectContaining({itemId:liquidId,currentQty:0,needsReorder:true,recommendedOrderQty:18}));
  });

  it("turns a visual fill percentage into a journaled liter balance",async()=>{
    const container=await wiring.supplies.service.createContainer({itemId:liquidId,warehouseId,label:`Канистра ${randomUUID().slice(0,4)}`,capacityLiters:5},actorId);
    const changed=await wiring.supplies.service.setContainerLevel(container.id,38,actorId);
    expect(changed).toEqual(expect.objectContaining({capacityLiters:5,currentLiters:1.9,fillPercent:38}));
    expect(await wiring.supplies.service.listMovements({itemId:liquidId})).toContainEqual(expect.objectContaining({containerId:container.id,action:"adjust",quantity:1.9}));
  });

  it("keeps a separate immutable price and frozen FX rate for every receipt",async()=>{
    const receipt=await wiring.supplies.service.createReceipt({itemId:liquidId,warehouseId,quantity:5,currency:"RSD",totalPrice:3900,fxRateToEUR:0.0085,supplierName:"Supplier"},actorId);
    expect(receipt).toEqual(expect.objectContaining({quantity:5,totalPrice:3900,totalEUR:33.15,unitPrice:780,unitPriceEUR:6.63}));
    expect(await wiring.supplies.service.listReceipts(liquidId)).toContainEqual(expect.objectContaining({id:receipt.id,fxRateToEUR:0.0085}));
  });
});
