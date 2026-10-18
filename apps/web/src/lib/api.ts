const BASE = import.meta.env.VITE_API_URL ?? "";
const DEMO = import.meta.env.VITE_DEMO_MODE === "true" || new URLSearchParams(window.location.search).has("demo");

type DemoStore = Record<string, unknown>;
const DEMO_KEY = "sever.demo.store.v2";
const demoSeed: DemoStore = {
  "/api/people/me": { user: { id: "demo-owner", email: "demo@sever.local", displayName: "Алексей Воронцов", firstName: "Алексей", lastName: "Воронцов", mustChangePassword: false, active: true, hourlyRateEUR: 22, usePhotoAsAvatar: false, photoUrl: null }, permissions: ["apex.view","operations.view","warehouse.view","supplies.view","supplies.move","supplies.catalog.manage","supplies.purchase.manage","venues.view","venues.manage","venues.archive","venues.delete","projects.view","projects.manage","projects.reservation.manage","plans.view","plans.manage","people.view","people.manage","roles.manage","finance.view","finance.manage","backoffice.access","people.applications.review","telegram.inbox.manage"], isOwner: true },
  "/api/projects": [
    { id:"p-aurora", name:"Aurora Festival 2026", code:"PRJ-26041", status:"active", clientId:"c-acme", clientName:"Acme Events", venueId:"v-fort", venueName:"Белградская крепость", startAt:"2026-10-12T09:00:00Z", endAt:"2026-10-15T23:00:00Z", budgetEUR:42000, financeTracked:true },
    { id:"p-theatre", name:"Городской театр — премьера", code:"PRJ-26038", status:"confirmed", clientId:"c-theatre", clientName:"Городской театр", venueId:"v-theatre", venueName:"Главная сцена", startAt:"2026-10-20T12:00:00Z", endAt:"2026-10-22T23:00:00Z", budgetEUR:18500, financeTracked:true },
    { id:"p-nordic", name:"Nordic Fest — main stage", code:"PRJ-26044", status:"draft", clientId:"c-nordic", clientName:"Nordic Fest", venueId:"v-lake", venueName:"Lake Ada", startAt:"2026-11-05T10:00:00Z", endAt:"2026-11-08T22:00:00Z", budgetEUR:27500, financeTracked:false }
  ],
  "/api/equipment/models": [
    { id:"m-mega", name:"Robe MegaPointe", manufacturer:"Robe", typeId:"t-light", typeName:"Световые приборы", unitCostEUR:6000, dailyPriceEUR:120, trackingMode:"serial", stockTotal:8, stockAvailable:6 },
    { id:"m-aura", name:"Martin MAC Aura", manufacturer:"Martin", typeId:"t-light", typeName:"Световые приборы", unitCostEUR:3500, dailyPriceEUR:80, trackingMode:"serial", stockTotal:12, stockAvailable:10 },
    { id:"m-qsc", name:"QSC K12.2", manufacturer:"QSC", typeId:"t-sound", typeName:"Звук", unitCostEUR:1200, dailyPriceEUR:45, trackingMode:"serial", stockTotal:8, stockAvailable:8 },
    { id:"m-dmx", name:"XLR5 → XLR5 10m", manufacturer:"SEVER Cable", typeId:"t-cable", typeName:"Кабели", unitCostEUR:18, dailyPriceEUR:1, trackingMode:"quantity", stockTotal:40, stockAvailable:32 }
  ],
  "/api/equipment/types": [{id:"t-light",name:"Световые приборы",trackingMode:"serial"},{id:"t-sound",name:"Звук",trackingMode:"serial"},{id:"t-cable",name:"Кабели",trackingMode:"quantity"}],
  "/api/equipment/warehouses": [{id:"wh-main",name:"Основной склад",address:"Нови-Београд, блок 24",active:true}],
  "/api/equipment/units": [{id:"u-mp-001",assetTag:"MP-001",serial:"MP1001",modelId:"m-mega",modelName:"Robe MegaPointe",status:"available",warehouseId:"wh-main"},{id:"u-mp-002",assetTag:"MP-002",serial:"MP1002",modelId:"m-mega",modelName:"Robe MegaPointe",status:"reserved",warehouseId:"wh-main"},{id:"u-au-001",assetTag:"AU-001",serial:"AU1001",modelId:"m-aura",modelName:"Martin MAC Aura",status:"available",warehouseId:"wh-main"},{id:"u-qsc-001",assetTag:"SP-001",serial:"SP1001",modelId:"m-qsc",modelName:"QSC K12.2",status:"repair",warehouseId:"wh-main"}],
  "/api/catalog/categories": [{id:"cat-effects",name:"Жидкости и эффекты",active:true,sortOrder:10,createdAt:"2026-10-01T10:00:00Z"},{id:"cat-power",name:"Питание",active:true,sortOrder:20,createdAt:"2026-10-01T10:00:00Z"},{id:"cat-rigging",name:"Крепёж и риггинг",active:true,sortOrder:30,createdAt:"2026-10-01T10:00:00Z"},{id:"cat-service",name:"Монтажные материалы",active:true,sortOrder:40,createdAt:"2026-10-01T10:00:00Z"}],
  "/api/catalog/items": [{id:"sup-fog",sku:"FOG-FLUID",name:"Жидкость для дым-машины",kind:"product",categoryId:"cat-effects",groupName:null,measurementKind:"liquid",baseUnit:"l",active:true,createdAt:"2026-10-01T10:00:00Z"},{id:"sup-bat",sku:"BAT-AA",name:"Батарейки AA",kind:"product",categoryId:"cat-power",groupName:null,measurementKind:"count",baseUnit:"шт.",active:true,createdAt:"2026-10-01T10:00:00Z"},{id:"sup-clamp",sku:"CLAMP-50",name:"Струбцина 50 мм",kind:"product",categoryId:"cat-rigging",groupName:null,measurementKind:"count",baseUnit:"шт.",active:true,createdAt:"2026-10-01T10:00:00Z"},{id:"sup-bolt",sku:"BOLT-M10",name:"Болт M10 × 40",kind:"product",categoryId:"cat-rigging",groupName:null,measurementKind:"count",baseUnit:"шт.",active:true,createdAt:"2026-10-01T10:00:00Z"},{id:"sup-tape",sku:"TAPE-BLK",name:"Гаффер чёрный",kind:"product",categoryId:"cat-service",groupName:null,measurementKind:"count",baseUnit:"рул.",active:true,createdAt:"2026-10-01T10:00:00Z"}],
  "/api/supplies/stock": [{itemId:"sup-fog",warehouseId:"wh-main",minimumQty:5,maximumQty:20,incomingQty:0,currentQty:3.7,needsReorder:true,recommendedOrderQty:16.3,createdAt:"2026-10-01T10:00:00Z",updatedAt:"2026-10-11T10:00:00Z"},{itemId:"sup-bat",warehouseId:"wh-main",minimumQty:40,maximumQty:200,incomingQty:0,currentQty:86,needsReorder:false,recommendedOrderQty:0,createdAt:"2026-10-01T10:00:00Z",updatedAt:"2026-10-11T10:00:00Z"},{itemId:"sup-clamp",warehouseId:"wh-main",minimumQty:12,maximumQty:40,incomingQty:0,currentQty:8,needsReorder:true,recommendedOrderQty:32,createdAt:"2026-10-01T10:00:00Z",updatedAt:"2026-10-11T10:00:00Z"},{itemId:"sup-bolt",warehouseId:"wh-main",minimumQty:100,maximumQty:500,incomingQty:120,currentQty:78,needsReorder:true,recommendedOrderQty:302,createdAt:"2026-10-01T10:00:00Z",updatedAt:"2026-10-11T10:00:00Z"},{itemId:"sup-tape",warehouseId:"wh-main",minimumQty:10,maximumQty:50,incomingQty:0,currentQty:27,needsReorder:false,recommendedOrderQty:0,createdAt:"2026-10-01T10:00:00Z",updatedAt:"2026-10-11T10:00:00Z"}],
  "/api/supplies/containers": [{id:"can-fog-1",itemId:"sup-fog",warehouseId:"wh-main",label:"Канистра 1",capacityLiters:5,currentLiters:1.9,fillPercent:38,active:true,createdAt:"2026-10-01T10:00:00Z"},{id:"can-fog-2",itemId:"sup-fog",warehouseId:"wh-main",label:"Канистра 2",capacityLiters:5,currentLiters:1.8,fillPercent:36,active:true,createdAt:"2026-10-02T10:00:00Z"}],
  "/api/supplies/movements": [{id:"sm-1",itemId:"sup-fog",containerId:"can-fog-1",warehouseId:"wh-main",action:"adjust",quantity:-0.4,projectId:null,receiptId:null,note:"Проверка уровня",actorId:"demo-owner",createdAt:"2026-10-11T10:00:00Z"}],
  "/api/supplies/receipts": [{id:"sr-1",itemId:"sup-fog",warehouseId:"wh-main",containerId:"can-fog-1",quantity:5,packageCount:1,packageLabel:"Канистра 5 л",supplierName:"Stage Fluids",currency:"EUR",totalPrice:28,fxRateToEUR:1,totalEUR:28,unitPrice:5.6,unitPriceEUR:5.6,note:null,receivedAt:"2026-10-02T10:00:00Z",actorId:"demo-owner",createdAt:"2026-10-02T10:00:00Z"},{id:"sr-2",itemId:"sup-fog",warehouseId:"wh-main",containerId:"can-fog-2",quantity:5,packageCount:1,packageLabel:"Канистра 5 л",supplierName:"FX Shop",currency:"RSD",totalPrice:3900,fxRateToEUR:0.0085,totalEUR:33.15,unitPrice:780,unitPriceEUR:6.63,note:null,receivedAt:"2026-10-10T10:00:00Z",actorId:"demo-owner",createdAt:"2026-10-10T10:00:00Z"}],
  "/api/venues": [{id:"v-fort",name:"Белградская крепость",address:"Kalemegdan, Beograd",city:"Belgrade",capacity:5000,active:true},{id:"v-theatre",name:"Главная сцена",address:"Francuska 3, Beograd",city:"Belgrade",capacity:850,active:true},{id:"v-lake",name:"Lake Ada",address:"Ada Ciganlija, Beograd",city:"Belgrade",capacity:12000,active:true}],
  "/api/clients": [{id:"c-acme",name:"Acme Events",contacts:"+381 60 000 0000"},{id:"c-theatre",name:"Городской театр",contacts:"theatre@city.gov"},{id:"c-nordic",name:"Nordic Fest",contacts:"hello@nordicfest.eu"}],
  "/api/people": [{id:"demo-owner",displayName:"Алексей Воронцов",email:"demo@sever.local",active:true,roleName:"Владелец"},{id:"u-02",displayName:"Мария Котова",email:"maria@sever.local",active:true,roleName:"Монтажник"},{id:"u-03",displayName:"Дмитрий Ларин",email:"dmitry@sever.local",active:true,roleName:"Склад"}],
  "/api/finance/accounts": [{id:"a-eur",name:"Основной EUR",currency:"EUR",balance:68420.5},{id:"a-rsd",name:"Касса RSD",currency:"RSD",balance:125000}],
  "/api/finance/fx": [{currency:"EUR",rateToEUR:1},{currency:"RSD",rateToEUR:0.0085},{currency:"USD",rateToEUR:0.92}],
  "/api/finance/transactions": [{id:"tx-1",description:"Оплата Acme Events — Aurora",amount:12000,amountEUR:12000,currency:"EUR",kind:"income",occurredAt:"2026-10-03T12:00:00Z"},{id:"tx-2",description:"Аренда склада",amount:2400,amountEUR:2400,currency:"EUR",kind:"expense",occurredAt:"2026-10-01T12:00:00Z"}],
  "/api/apex/dashboard": {activeProjects:3,upcomingProjects:5,openReservations:12,openProblems:2,unpaidEUR:18400,revenueEUR:68420,expensesEUR:24200},
  "/api/notifications": [{id:"n-1",title:"Нужна проверка комплектации",message:"Aurora Festival — выдача через 2 дня",read:false,createdAt:"2026-10-07T08:30:00Z"}],
  "/api/notifications/unread-count": {count:1},
  "/api/crew-applications": [{id:"app-1",displayName:"Никола Петрович",email:"nikola@example.com",status:"pending",createdAt:"2026-10-06T14:20:00Z"}],
  "/api/transport/vehicles": [{id:"van-1",name:"Mercedes Sprinter",plate:"BG-1234-AB",status:"available",capacityM3:14},{id:"van-2",name:"Ford Transit",plate:"BG-5678-CD",status:"service",capacityM3:9}],
  "/api/roles": [{id:"r-owner",name:"Владелец",permissions:["*"]},{id:"r-tech",name:"Монтажник",permissions:["operations.view"]},{id:"r-wh",name:"Склад",permissions:["warehouse.view"]}],
  "/api/app-settings/date-time": {timezone:"Europe/Belgrade",dateFormat:"dd.MM.yyyy",timeFormat:"24h"},
};

function demoStore(): DemoStore { try { return JSON.parse(localStorage.getItem(DEMO_KEY) || "null") || structuredClone(demoSeed); } catch { return structuredClone(demoSeed); } }
const round3=(value:number)=>Math.round((value+Number.EPSILON)*1000)/1000;
const demoId=(prefix:string)=>`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
const demoArray=<T>(store:DemoStore,key:string)=>store[key] as T[];
function saveDemoStore(store:DemoStore){localStorage.setItem(DEMO_KEY,JSON.stringify(store));}
function refreshDemoStock(store:DemoStore,itemId:string,warehouseId:string,delta=0){
  const rows=demoArray<Record<string,unknown>>(store,"/api/supplies/stock");
  const row=rows.find(entry=>entry.itemId===itemId&&entry.warehouseId===warehouseId);
  if(!row)return;
  const currentQty=round3(Number(row.currentQty)+delta),minimumQty=Number(row.minimumQty),maximumQty=Number(row.maximumQty),incomingQty=Number(row.incomingQty??0);
  Object.assign(row,{currentQty,needsReorder:currentQty<=minimumQty,recommendedOrderQty:currentQty<=minimumQty?Math.max(0,round3(maximumQty-currentQty-incomingQty)):0,updatedAt:new Date().toISOString()});
}
function demoResponse<T>(method: string, path: string, body?: unknown): T {
  const store=demoStore(),url=new URL(path,"https://demo.sever.local"),key=url.pathname,input=(body??{}) as Record<string,unknown>,now=new Date().toISOString();
  if(key==="/api/auth/login"||key==="/api/auth/bootstrap")return{token:"demo-token"}as T;
  if(method==="GET"){
    const value=store[key];
    if(Array.isArray(value)){
      let rows=[...value] as Record<string,unknown>[];
      for(const field of ["warehouseId","itemId"]){const filter=url.searchParams.get(field);if(filter)rows=rows.filter(row=>row[field]===filter);}
      return rows as T;
    }
    if(key.includes("/reservations")||key.includes("/assignments")||key.includes("/timings")||key.includes("/journal")||key.includes("/plans"))return[]as T;
    return(value??[])as T;
  }
  if(method==="POST"&&key==="/api/catalog/categories"){
    const category={id:demoId("cat"),name:String(input.name??"Новая категория"),active:true,sortOrder:demoArray<unknown>(store,key).length*10+10,createdAt:now};
    demoArray<Record<string,unknown>>(store,key).push(category);saveDemoStore(store);return category as T;
  }
  if(method==="POST"&&key==="/api/catalog/items"){
    const item={...input,id:demoId("sup"),groupName:null,active:true,createdAt:now};
    demoArray<Record<string,unknown>>(store,key).push(item);saveDemoStore(store);return item as T;
  }
  if(method==="PUT"&&key==="/api/supplies/settings"){
    const rows=demoArray<Record<string,unknown>>(store,"/api/supplies/stock"),existing=rows.find(row=>row.itemId===input.itemId&&row.warehouseId===input.warehouseId);
    const settings={itemId:input.itemId,warehouseId:input.warehouseId,minimumQty:Number(input.minimumQty),maximumQty:Number(input.maximumQty),incomingQty:Number(input.incomingQty??0),createdAt:existing?.createdAt??now,updatedAt:now};
    if(existing)Object.assign(existing,settings);else rows.push({...settings,currentQty:0,needsReorder:true,recommendedOrderQty:Number(input.maximumQty)});
    refreshDemoStock(store,String(input.itemId),String(input.warehouseId));saveDemoStore(store);return settings as T;
  }
  if(method==="POST"&&key==="/api/supplies/containers"){
    const capacity=Number(input.capacityLiters),current=Number(input.initialLiters??0),container={id:demoId("can"),itemId:input.itemId,warehouseId:input.warehouseId,label:input.label,capacityLiters:capacity,currentLiters:current,fillPercent:capacity?round3(current/capacity*100):0,active:true,createdAt:now};
    demoArray<Record<string,unknown>>(store,key).push(container);if(current)refreshDemoStock(store,String(input.itemId),String(input.warehouseId),current);saveDemoStore(store);return container as T;
  }
  const levelMatch=key.match(/^\/api\/supplies\/containers\/([^/]+)\/level$/);
  if(method==="PATCH"&&levelMatch){
    const containers=demoArray<Record<string,unknown>>(store,"/api/supplies/containers"),container=containers.find(entry=>entry.id===levelMatch[1]);
    if(container){const previous=Number(container.currentLiters),fillPercent=Math.max(0,Math.min(100,Number(input.fillPercent))),currentLiters=round3(Number(container.capacityLiters)*fillPercent/100),delta=round3(currentLiters-previous);Object.assign(container,{currentLiters,fillPercent});refreshDemoStock(store,String(container.itemId),String(container.warehouseId),delta);demoArray<Record<string,unknown>>(store,"/api/supplies/movements").unshift({id:demoId("sm"),itemId:container.itemId,containerId:container.id,warehouseId:container.warehouseId,action:"adjust",quantity:delta,projectId:null,receiptId:null,note:`Визуальная оценка: ${Math.round(fillPercent)}%`,actorId:"demo-owner",createdAt:now});saveDemoStore(store);return container as T;}
  }
  if(method==="POST"&&key==="/api/supplies/movements"){
    const magnitude=Number(input.quantity),quantity=input.action==="consume"||input.action==="write_off"?-Math.abs(magnitude):magnitude,movement={id:demoId("sm"),...input,containerId:input.containerId??null,quantity,projectId:input.projectId??null,receiptId:null,note:input.note??null,actorId:"demo-owner",createdAt:now};
    demoArray<Record<string,unknown>>(store,key).unshift(movement);refreshDemoStock(store,String(input.itemId),String(input.warehouseId),quantity);
    if(input.containerId){const container=demoArray<Record<string,unknown>>(store,"/api/supplies/containers").find(entry=>entry.id===input.containerId);if(container){const currentLiters=round3(Math.max(0,Number(container.currentLiters)+quantity));Object.assign(container,{currentLiters,fillPercent:round3(currentLiters/Number(container.capacityLiters)*100)});}}
    saveDemoStore(store);return movement as T;
  }
  if(method==="POST"&&key==="/api/supplies/receipts"){
    const quantity=Number(input.quantity),totalPrice=Number(input.totalPrice),fxRateToEUR=Number(input.fxRateToEUR),totalEUR=Math.round(totalPrice*fxRateToEUR*100)/100,id=demoId("sr"),receipt={id,...input,containerId:input.containerId??null,packageCount:input.packageCount??null,packageLabel:input.packageLabel??null,supplierName:input.supplierName??null,totalEUR,unitPrice:Math.round(totalPrice/quantity*100)/100,unitPriceEUR:Math.round(totalEUR/quantity*100)/100,note:input.note??null,receivedAt:input.receivedAt??now,actorId:"demo-owner",createdAt:now};
    demoArray<Record<string,unknown>>(store,key).unshift(receipt);demoArray<Record<string,unknown>>(store,"/api/supplies/movements").unshift({id:demoId("sm"),itemId:input.itemId,containerId:input.containerId??null,warehouseId:input.warehouseId,action:"receipt",quantity,projectId:null,receiptId:id,note:input.note??null,actorId:"demo-owner",createdAt:now});refreshDemoStock(store,String(input.itemId),String(input.warehouseId),quantity);
    if(input.containerId){const container=demoArray<Record<string,unknown>>(store,"/api/supplies/containers").find(entry=>entry.id===input.containerId);if(container){const currentLiters=round3(Math.min(Number(container.capacityLiters),Number(container.currentLiters)+quantity));Object.assign(container,{currentLiters,fillPercent:round3(currentLiters/Number(container.capacityLiters)*100)});}}
    saveDemoStore(store);return receipt as T;
  }
  if(method==="DELETE")delete store[key];else if(Array.isArray(store[key])){const item={...input,id:demoId("demo")};demoArray<Record<string,unknown>>(store,key).push(item);saveDemoStore(store);return item as T;}
  saveDemoStore(store);return{ok:true}as T;
}

// Session token from email/password (or Telegram) login.
const TOKEN_KEY = "sever.token";
export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (DEMO) return Promise.resolve(demoResponse<T>(method, path, body));
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    let code = "error";
    let message = res.statusText;
    try {
      const json = await res.json();
      code = json?.error?.code ?? code;
      message = json?.error?.message ?? message;
    } catch {
      /* non-JSON error */
    }
    // A stale token: drop it so the app falls back to the login screen.
    if (res.status === 401 && token) clearToken();
    throw new ApiError(code, message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (DEMO) return new Response(JSON.stringify(demoResponse(init.method ?? "GET", path)), { status: 200, headers: { "Content-Type": "application/json" } });
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let code = "error";
    let message = res.statusText;
    try {
      const json = await res.json();
      code = json?.error?.code ?? code;
      message = json?.error?.message ?? message;
    } catch { /* non-JSON error */ }
    if (res.status === 401 && token) clearToken();
    throw new ApiError(code, message, res.status);
  }
  return res;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};
