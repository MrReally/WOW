// Rich, diverse demo dataset — used by `pnpm seed` and the admin "reset to demo"
// action. Assumes empty module schemas (the caller drops + migrates first).

import type { Catalog, Equipment, Finance, People, Projects, Venues, Plans } from "@sever/contracts";

export interface SeedServices {
  people: People.PeopleService;
  equipment: Equipment.EquipmentService;
  projects: Projects.ProjectsService;
  finance: Finance.FinanceService;
  venues: Venues.VenuesService;
  plans: Plans.PlansService;
  catalog: Catalog.CatalogService;
}

function iso(daysFromNow: number, hour = 10): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}
function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 3_600_000).toISOString();
}

export async function seedDemo(s: SeedServices): Promise<{ summary: Record<string, number> }> {
  // ── Roles + people (demo logins with known passwords) ──
  await s.people.ensureDefaultRoles();
  const whRole = (await s.people.getRoleByName("Склад"))!;
  const techRole = (await s.people.getRoleByName("Монтажник"))!;

  // Owner — log in as owner@sever.local / owner123
  const admin = (await s.people.bootstrapOwner({ email: "owner@sever.local", password: "owner123", displayName: "Иван Комаров" })).user;

  const mkUser = async (email: string, password: string, displayName: string, roleId: string, telegramId: string, rate: number) => {
    const created = await s.people.create({ email, displayName, roleId, telegramId, hourlyRateEUR: rate });
    await s.people.changePassword(created.user.id, password); // set a known demo password
    return created.user;
  };
  const ware = await mkUser("warehouse@sever.local", "whse123", "Дмитрий Ларин", whRole.id, "ware-001", 18);
  const tech1 = await mkUser("tech@sever.local", "tech123", "Антон Волков", techRole.id, "tech-001", 15);
  const tech2 = await mkUser("tech2@sever.local", "tech123", "Мария Котова", techRole.id, "tech-002", 15);

  // ── Rental consumables and reusable kit composition (shared by mobile and desktop) ──
  const gaffer = await s.catalog.createItem({ sku: "CON-GAFFER-BLK", name: "Скотч Gaffer чёрный", kind: "product", groupName: "Расходные материалы", baseUnit: "roll" });
  const batteries = await s.catalog.createItem({ sku: "CON-BAT-AA", name: "Батарейки AA", kind: "product", groupName: "Расходные материалы", baseUnit: "pcs" });
  const stageKit = await s.catalog.createItem({ sku: "KIT-STAGE-BASIC", name: "Комплект расходников для сцены", kind: "equipment_kit", groupName: "Комплекты", baseUnit: "kit" });
  await s.catalog.addPackaging(gaffer.id, { name: "Коробка 24 рулона", coefficient: 24, barcode: "460000000101", supplierCode: null, active: true });
  await s.catalog.addPackaging(batteries.id, { name: "Упаковка 20 штук", coefficient: 20, barcode: "460000000102", supplierCode: null, active: true });
  await s.catalog.createRecipe(stageKit.id, { version: 1, validFrom: new Date().toISOString(), validTo: null, outputQty: 1, outputUnit: "kit", technology: "Проверить комплект перед выдачей", lines: [
    { ingredientItemId: gaffer.id, unit: "roll", grossQty: 2, netQty: 2, baseQty: 2 },
    { ingredientItemId: batteries.id, unit: "pcs", grossQty: 8, netQty: 8, baseQty: 8 },
  ] });

  // ── Catalog: types ──
  const tLight = await s.equipment.createType({ name: "Световые приборы", trackingMode: "serial" });
  const tSound = await s.equipment.createType({ name: "Звук", trackingMode: "serial" });
  const tHaze = await s.equipment.createType({ name: "Дым / Хейз", trackingMode: "serial" });
  const tCable = await s.equipment.createType({ name: "Кабели", trackingMode: "cable" });
  const tLedPar = await s.equipment.createType({ name: "LED PAR / Wash", trackingMode: "serial" });
  const tMoving = await s.equipment.createType({ name: "Поворотные головы", trackingMode: "serial" });
  const tControl = await s.equipment.createType({ name: "Световое управление", trackingMode: "serial" });
  const tNetwork = await s.equipment.createType({ name: "Сеть / Art-Net / sACN", trackingMode: "serial" });
  const tMixers = await s.equipment.createType({ name: "Цифровые микшеры", trackingMode: "serial" });
  const tWireless = await s.equipment.createType({ name: "Радиосистемы", trackingMode: "serial" });
  const tMics = await s.equipment.createType({ name: "Микрофоны", trackingMode: "serial" });
  const tSpeakers = await s.equipment.createType({ name: "Акустические системы", trackingMode: "serial" });
  const tPower = await s.equipment.createType({ name: "Питание и адаптеры", trackingMode: "quantity" });
  const tRigging = await s.equipment.createType({ name: "Стойки / риггинг", trackingMode: "serial" });
  const tProcessing = await s.equipment.createType({ name: "Усилители / DSP / DI", trackingMode: "serial" });
  const tStageboxes = await s.equipment.createType({ name: "Стейджбоксы и сплиттеры", trackingMode: "serial" });
  const tDj = await s.equipment.createType({ name: "DJ-оборудование", trackingMode: "serial" });
  const tVideo = await s.equipment.createType({ name: "Видео и коммутация", trackingMode: "serial" });
  const tDistribution = await s.equipment.createType({ name: "Силовое распределение", trackingMode: "serial" });

  const mainWarehouse = (await s.equipment.listWarehouses())[0]!;
  const roomMain = await s.equipment.createStorageZone({ warehouseId:mainWarehouse.id,name:"Основной зал хранения",code:"MAIN",kind:"room",sortOrder:10 });
  const rackLight = await s.equipment.createStorageZone({ warehouseId:mainWarehouse.id,parentId:roomMain.id,name:"Свет",code:"L",kind:"rack",sortOrder:20 });
  const shelfPars = await s.equipment.createStorageZone({ warehouseId:mainWarehouse.id,parentId:rackLight.id,name:"PAR и Wash",code:"L-01",kind:"shelf",sortOrder:21 });
  const shelfMoving = await s.equipment.createStorageZone({ warehouseId:mainWarehouse.id,parentId:rackLight.id,name:"Поворотные головы",code:"L-02",kind:"shelf",sortOrder:22 });
  const shelfControl = await s.equipment.createStorageZone({ warehouseId:mainWarehouse.id,parentId:rackLight.id,name:"DMX и управление",code:"L-03",kind:"shelf",sortOrder:23 });
  const rackAudio = await s.equipment.createStorageZone({ warehouseId:mainWarehouse.id,parentId:roomMain.id,name:"Звук",code:"A",kind:"rack",sortOrder:30 });
  const shelfMixers = await s.equipment.createStorageZone({ warehouseId:mainWarehouse.id,parentId:rackAudio.id,name:"Микшеры и роутеры",code:"A-01",kind:"shelf",sortOrder:31 });
  const shelfWireless = await s.equipment.createStorageZone({ warehouseId:mainWarehouse.id,parentId:rackAudio.id,name:"Радиосистемы и микрофоны",code:"A-02",kind:"shelf",sortOrder:32 });
  const rackCable = await s.equipment.createStorageZone({ warehouseId:mainWarehouse.id,parentId:roomMain.id,name:"Кабельный стеллаж",code:"C",kind:"rack",sortOrder:40 });
  const shelfDmx = await s.equipment.createStorageZone({ warehouseId:mainWarehouse.id,parentId:rackCable.id,name:"DMX и сеть",code:"C-01",kind:"shelf",sortOrder:41 });
  const shelfAudioCable = await s.equipment.createStorageZone({ warehouseId:mainWarehouse.id,parentId:rackCable.id,name:"Аудиокабели",code:"C-02",kind:"shelf",sortOrder:42 });
  const shelfPower = await s.equipment.createStorageZone({ warehouseId:mainWarehouse.id,parentId:rackCable.id,name:"Силовые кабели",code:"C-03",kind:"shelf",sortOrder:43 });
  const floorCases = await s.equipment.createStorageZone({ warehouseId:mainWarehouse.id,parentId:roomMain.id,name:"Кейсы и крупное оборудование",code:"FLOOR",kind:"floor",sortOrder:50 });

  // ── Models ──
  const mMegaPointe = await s.equipment.createModel({ typeId: tLight.id, name: "Robe MegaPointe", manufacturer: "Robe", unitCostEUR: 6000, dailyPriceEUR: 120 });
  const mMacAura = await s.equipment.createModel({ typeId: tLight.id, name: "Martin MAC Aura", manufacturer: "Martin", unitCostEUR: 3500, dailyPriceEUR: 80 });
  const mHexPar = await s.equipment.createModel({ typeId: tLight.id, name: "ADJ Mega Hex Par", manufacturer: "ADJ", unitCostEUR: 300, dailyPriceEUR: 15 });
  const mSourceFour = await s.equipment.createModel({ typeId: tLight.id, name: "ETC Source Four", manufacturer: "ETC", unitCostEUR: 700, dailyPriceEUR: 30 });
  const mStrobe = await s.equipment.createModel({ typeId: tLight.id, name: "Chauvet LED Strobe", manufacturer: "Chauvet", unitCostEUR: 900, dailyPriceEUR: 40 });
  const mSpeaker = await s.equipment.createModel({ typeId: tSound.id, name: "QSC K12.2", manufacturer: "QSC", unitCostEUR: 1200, dailyPriceEUR: 45 });
  const mHazer = await s.equipment.createModel({ typeId: tHaze.id, name: "Antari Z1500", manufacturer: "Antari", unitCostEUR: 900, dailyPriceEUR: 40 });

  const mDmx5 = await s.equipment.createModel({ typeId: tCable.id, name: "XLR5 -> XLR5 5m", unitCostEUR: 12, dailyPriceEUR: 1, attrs: { cableType: "DMX", lengthM: 5, sideAConnector: "XLR 5 pin male", sideAQty: 1, sideBConnector: "XLR 5 pin female", sideBQty: 1 } });
  const mDmx10 = await s.equipment.createModel({ typeId: tCable.id, name: "XLR5 -> XLR5 10m", unitCostEUR: 18, dailyPriceEUR: 1, attrs: { cableType: "DMX", lengthM: 10, sideAConnector: "XLR 5 pin male", sideAQty: 1, sideBConnector: "XLR 5 pin female", sideBQty: 1 } });
  const mPower10 = await s.equipment.createModel({ typeId: tCable.id, name: "PowerCON -> PowerCON 10m", unitCostEUR: 22, dailyPriceEUR: 1, attrs: { cableType: "Power", lengthM: 10, sideAConnector: "PowerCON TRUE1 in", sideAQty: 1, sideBConnector: "PowerCON TRUE1 out", sideBQty: 1 } });
  const mXlr15 = await s.equipment.createModel({ typeId: tCable.id, name: "XLR3 -> XLR3 15m", unitCostEUR: 20, dailyPriceEUR: 1, attrs: { cableType: "Audio", lengthM: 15, sideAConnector: "XLR 3 pin male", sideAQty: 1, sideBConnector: "XLR 3 pin female", sideBQty: 1 } });

  const extraCables = [
    ["DMX XLR3 1m","DMX",1,"XLR 3 pin male","XLR 3 pin female",40,shelfDmx.id],
    ["DMX XLR3 5m","DMX",5,"XLR 3 pin male","XLR 3 pin female",60,shelfDmx.id],
    ["DMX XLR3 10m","DMX",10,"XLR 3 pin male","XLR 3 pin female",40,shelfDmx.id],
    ["DMX XLR5 20m","DMX",20,"XLR 5 pin male","XLR 5 pin female",24,shelfDmx.id],
    ["etherCON Cat6 1m","Network",1,"etherCON","etherCON",20,shelfDmx.id],
    ["etherCON Cat6 10m","Network",10,"etherCON","etherCON",24,shelfDmx.id],
    ["RJ45 Cat6 2m","Network",2,"RJ45","RJ45",30,shelfDmx.id],
    ["XLR3 audio 3m","Audio",3,"XLR 3 pin male","XLR 3 pin female",50,shelfAudioCable.id],
    ["XLR3 audio 10m","Audio",10,"XLR 3 pin male","XLR 3 pin female",48,shelfAudioCable.id],
    ["Jack TRS — XLR male 3m","Audio",3,"Jack 6.3 TRS","XLR 3 pin male",16,shelfAudioCable.id],
    ["Speakon NL4 10m","Speaker",10,"Speakon NL4","Speakon NL4",20,shelfAudioCable.id],
    ["Schuko 5m","Power",5,"Schuko plug male","Schuko socket female",50,shelfPower.id],
    ["Schuko 10m","Power",10,"Schuko plug male","Schuko socket female",40,shelfPower.id],
    ["PowerCON TRUE1 10m","Power",10,"PowerCON TRUE1 in","PowerCON TRUE1 out",30,shelfPower.id],
    ["IEC C13 2m","Power",2,"Schuko plug male","IEC C13",35,shelfPower.id],
  ] as const;
  const cableModels: Equipment.EquipmentModelDTO[]=[];
  for(const [name,cableType,lengthM,sideAConnector,sideBConnector,qty,zoneId] of extraCables){
    const cable=await s.equipment.createModel({typeId:tCable.id,name,unitCostEUR:Math.max(8,lengthM*2),dailyPriceEUR:1,attrs:{cableType,lengthM,sideAConnector,sideAQty:1,sideBConnector,sideBQty:1}});
    await s.equipment.setModelStockTotal(cable.id,qty,mainWarehouse.id,zoneId);
    cableModels.push(cable);
  }

  // ── Cable stock ──
  await s.equipment.setModelStockTotal(mDmx5.id, 60, mainWarehouse.id, shelfDmx.id);
  await s.equipment.setModelStockTotal(mDmx10.id, 40, mainWarehouse.id, shelfDmx.id);
  await s.equipment.setModelStockTotal(mPower10.id, 50, mainWarehouse.id, shelfPower.id);
  await s.equipment.setModelStockTotal(mXlr15.id, 30, mainWarehouse.id, shelfAudioCable.id);

  // ── Units ──
  const mk = async (modelId: string, prefix: string, n: number, zoneId?: string) => {
    const out: Equipment.EquipmentUnitDTO[] = [];
    for (let i = 1; i <= n; i++) {
      out.push(await s.equipment.createUnit({ modelId, assetTag: `${prefix}-${String(i).padStart(3, "0")}`, serial: `${prefix}${1000 + i}`, warehouseId:mainWarehouse.id, zoneId }));
    }
    return out;
  };
  const mp = await mk(mMegaPointe.id, "MP", 8, shelfMoving.id);
  const aura = await mk(mMacAura.id, "AU", 12, shelfMoving.id);
  const hex = await mk(mHexPar.id, "HX", 20, shelfPars.id);
  const s4 = await mk(mSourceFour.id, "S4", 10, shelfPars.id);
  const strobe = await mk(mStrobe.id, "ST", 4, shelfPars.id);
  const spk = await mk(mSpeaker.id, "SP", 8, floorCases.id);
  const haze = await mk(mHazer.id, "HZ", 3, floorCases.id);

  const serialSpecs: Array<[Equipment.EquipmentTypeDTO,string,string,number,number,string,number,string,Record<string,unknown>]> = [
    [tLedPar,"ADJ Mega Hex Par","ADJ",320,18,"PAR6",16,shelfPars.id,{colorSystem:"RGBWAUV",leds:"5×6W",dmxChannels:"6/7/8/11/12",beamAngleDeg:25,powerW:30,dmxConnector:"XLR3"}],
    [tLedPar,"Chauvet COLORado 1-Quad Zoom","Chauvet Professional",1150,45,"PAR4",8,shelfPars.id,{colorSystem:"RGBW",leds:"7×15W",zoomDeg:"7–45",ipRating:"IP65",dmxConnector:"XLR5",rdm:true}],
    [tLedPar,"Generic PAR 64 RGB 18×3W","Generic",95,8,"PAR3",24,shelfPars.id,{colorSystem:"RGB",leds:"18×3W",dmxChannels:"3/7",dmxConnector:"XLR3"}],
    [tMoving,"Robe Pointe","Robe",5200,100,"POINTE",6,shelfMoving.id,{fixtureClass:"beam/spot",lamp:"Osram Sirius HRI 280W",dmxConnector:"XLR5"}],
    [tMoving,"Martin MAC Aura XB","Martin",4200,95,"AURAXB",8,shelfMoving.id,{fixtureClass:"wash",colorSystem:"RGBW",zoom:true,dmxConnector:"XLR5"}],
    [tMoving,"Claypaky Sharpy","Claypaky",4900,100,"SHARPY",6,shelfMoving.id,{fixtureClass:"beam",lamp:"189W",dmxConnector:"XLR5"}],
    [tControl,"grandMA3 onPC command wing XT","MA Lighting",7200,160,"MA3",2,shelfControl.id,{protocols:["DMX512","Art-Net","sACN"],dmxOutputs:2}],
    [tControl,"ChamSys MagicQ MQ70","ChamSys",7600,170,"MQ70",2,shelfControl.id,{protocols:["DMX512","Art-Net","sACN"],universes:24}],
    [tControl,"ENTTEC DMX USB Pro","ENTTEC",180,12,"DUSB",6,shelfControl.id,{interface:"USB–DMX",dmxPorts:1,connector:"XLR5"}],
    [tControl,"ENTTEC Open DMX USB","ENTTEC",75,6,"ODMX",4,shelfControl.id,{interface:"USB–DMX",dmxPorts:1,connector:"XLR5"}],
    [tNetwork,"ENTTEC ODE Mk3","ENTTEC",420,22,"ODE",4,shelfControl.id,{protocols:["Art-Net","sACN"],dmxPorts:2,network:"RJ45"}],
    [tNetwork,"Luminex LumiNode 4","Luminex",1200,45,"LUMI",3,shelfControl.id,{protocols:["Art-Net","sACN","RDM"],dmxPorts:4,network:"etherCON"}],
    [tNetwork,"DMXKing eDMX2 PRO","DMXKing",290,18,"EDMX",4,shelfControl.id,{protocols:["Art-Net","sACN"],dmxPorts:2,network:"RJ45"}],
    [tNetwork,"MikroTik hAP ac²","MikroTik",80,8,"RTR",4,shelfMixers.id,{role:"Wi‑Fi router",ethernetPorts:5,wifi:"2.4/5 GHz"}],
    [tMixers,"Behringer X32 Compact","Behringer",1900,80,"X32C",3,shelfMixers.id,{inputs:32,buses:25,remote:"X32-Edit"}],
    [tMixers,"Allen & Heath SQ-5","Allen & Heath",3900,130,"SQ5",2,shelfMixers.id,{inputs:48,buses:36,sampleRateKHz:96}],
    [tWireless,"Shure QLXD24/SM58","Shure",1450,60,"QLXD",6,shelfWireless.id,{band:"G51",capsule:"SM58",diversity:"digital predictive"}],
    [tWireless,"Sennheiser EW 100 G4-835-S","Sennheiser",720,35,"EWG4",8,shelfWireless.id,{band:"A",capsule:"e835"}],
    [tMics,"Shure SM58","Shure",110,8,"SM58",16,shelfWireless.id,{pattern:"cardioid",type:"dynamic"}],
    [tMics,"Shure Beta 52A","Shure",190,12,"B52",4,shelfWireless.id,{pattern:"supercardioid",application:"kick drum"}],
    [tMics,"Rode NT5 matched pair","Rode",390,20,"NT5",4,shelfWireless.id,{pattern:"cardioid",type:"condenser",phantomV:48}],
    [tSpeakers,"d&b audiotechnik Y7P","d&b audiotechnik",4200,110,"Y7P",8,floorCases.id,{type:"passive point source",dispersion:"75×40"}],
    [tSpeakers,"QSC KS118","QSC",2300,75,"KS118",4,floorCases.id,{type:"active subwoofer",driver:"18 inch"}],
    [tRigging,"Manfrotto Wind-Up 087NW","Manfrotto",680,22,"STAND",8,floorCases.id,{maxHeightM:3.7,maxLoadKg:30}],
    [tProcessing,"d&b D20","d&b audiotechnik",6900,130,"D20",4,floorCases.id,{type:"4-channel amplifier",network:"OCA/AES70",outputs:4}],
    [tProcessing,"Lake LM 44","Lab Gruppen",4100,90,"LM44",2,shelfMixers.id,{type:"loudspeaker processor",analogInputs:4,analogOutputs:4,network:"Dante"}],
    [tProcessing,"Radial J48","Radial",260,12,"J48",8,shelfWireless.id,{type:"active DI",phantomV:48}],
    [tStageboxes,"Allen & Heath DX168","Allen & Heath",1900,65,"DX168",3,shelfMixers.id,{inputs:16,outputs:8,protocol:"dSnake/DX",sampleRateKHz:96}],
    [tStageboxes,"Behringer S32","Behringer",1050,48,"S32",3,shelfMixers.id,{inputs:32,outputs:16,protocol:"AES50"}],
    [tStageboxes,"DMX Splitter 8-way XLR5","Showtec",420,18,"DMXS",4,shelfControl.id,{input:"XLR5",outputs:8,isolation:"opto"}],
    [tWireless,"Sennheiser EW IEM G4 Twin","Sennheiser",1350,55,"IEM",4,shelfWireless.id,{type:"in-ear monitor",receivers:2,band:"A"}],
    [tDj,"Pioneer DJ CDJ-3000","Pioneer DJ",2600,95,"CDJ",4,floorCases.id,{type:"media player",network:"Pro DJ Link"}],
    [tDj,"Pioneer DJM-A9","Pioneer DJ",2800,100,"DJM",2,floorCases.id,{type:"4-channel DJ mixer",channels:4,network:"Bluetooth/LAN"}],
    [tVideo,"Blackmagic ATEM Television Studio HD8","Blackmagic Design",3400,120,"ATEM",2,shelfMixers.id,{type:"video switcher",sdiInputs:8,streaming:true}],
    [tVideo,"Decimator MD-HX","Decimator Design",320,18,"MDHX",4,shelfControl.id,{type:"SDI/HDMI cross converter",scaler:true}],
    [tDistribution,"CEE 32A → 6× Schuko distro","PCE",780,30,"DIST",4,floorCases.id,{input:"CEE 32A 5p",outputs:"6× Schuko",rcd:true}],
    [tDistribution,"CEE 63A power distro with metering","PCE",2200,75,"DIST63",2,floorCases.id,{input:"CEE 63A 5p",metering:true,rcd:true}],
  ];
  for(const [type,name,manufacturer,cost,rate,prefix,count,zoneId,attrs] of serialSpecs){const model=await s.equipment.createModel({typeId:type.id,name,manufacturer,unitCostEUR:cost,dailyPriceEUR:rate,attrs});await mk(model.id,prefix,count,zoneId);}

  const routerPower=await s.equipment.createModel({typeId:tPower.id,name:"Блок питания MikroTik 24V",manufacturer:"MikroTik",unitCostEUR:18,dailyPriceEUR:1,attrs:{voltage:"24V",role:"router power"}});
  const mixerPower=await s.equipment.createModel({typeId:tPower.id,name:"Блок питания Mackie DL1608",manufacturer:"Mackie",unitCostEUR:75,dailyPriceEUR:3,attrs:{role:"mixer power",type:"external universal switching PSU"}});
  await s.equipment.setModelStockTotal(routerPower.id,8,mainWarehouse.id,shelfPower.id);
  await s.equipment.setModelStockTotal(mixerPower.id,4,mainWarehouse.id,shelfPower.id);
  const routerModel=(await s.equipment.listModels()).find(m=>m.name==="MikroTik hAP ac²")!;
  const ethernet2m=cableModels.find(m=>m.name==="RJ45 Cat6 2m")!;
  const mackie=await s.equipment.createModel({typeId:tMixers.id,name:"Mackie DL1608",manufacturer:"Mackie",unitCostEUR:950,dailyPriceEUR:55,attrs:{inputs:16,outputs:6,control:"Master Fader",network:"Ethernet to external Wi‑Fi router"},requiredComponentModelIds:[routerModel.id,routerPower.id,mixerPower.id,ethernet2m.id]});
  const mackieUnits=await mk(mackie.id,"DL16",3,shelfMixers.id);

  // Some units in non-stock states for variety, via the real workflows.
  await s.equipment.openRepair({ unitId: strobe[0]!.id, problem: "Не зажигается сегмент", vendor: "СветоСервис", estCostEUR: 80, actorId: ware.id });
  await s.equipment.changeStatus(s4[9]!.id, "lost", ware.id, "Не вернулся с прошлого проекта");
  const subRent = await s.equipment.createContractor({ name: "SubRent LLC", contacts: "+381 64 111 2222" });
  await s.equipment.sendToContractor({ unitId: haze[2]!.id, contractorId: subRent.id, reason: "субаренда на фестиваль", actorId: ware.id });
  // A closed repair for history (with cost).
  const pastRepair = await s.equipment.openRepair({ unitId: hex[0]!.id, problem: "Слетела прошивка", vendor: "СветоСервис", actorId: ware.id });
  await s.equipment.closeRepair(pastRepair.id, { costEUR: 45, resolution: "Перепрошивка", outcome: "repaired", actorId: ware.id });

  // ── Clients ──
  const cAcme = await s.projects.createClient({ name: "Acme Events", contacts: "+381 60 000 0000" });
  const cNordic = await s.projects.createClient({ name: "Nordic Fest", contacts: "+371 2000 1234" });
  const cBeta = await s.projects.createClient({ name: "Beta Club", contacts: "@beta_club" });
  const cTheatre = await s.projects.createClient({ name: "Городской театр", contacts: "theatre@city.gov" });

  // ── Account + FX ──
  await s.finance.setFxRate("RSD", 0.0085);
  await s.finance.setFxRate("USD", 0.92);
  const accEUR = await s.finance.createAccount({ name: "Основной EUR", currency: "EUR" });
  const accRSD = await s.finance.createAccount({ name: "Касса RSD", currency: "RSD" });

  // ── Project 1: LIVE right now (shows in "Идут сейчас") ──
  const pNordic = await s.projects.createProject({ name: "Nordic Fest — главная сцена", clientId: cNordic.id, startsAt: hoursFromNow(-20), endsAt: hoursFromNow(28) });
  await s.projects.setStatus(pNordic.id, "in_progress");
  await s.projects.addAssignment({ projectId: pNordic.id, userId: tech1.id, roleNote: "Свет" });
  await s.projects.addAssignment({ projectId: pNordic.id, userId: tech2.id, roleNote: "Звук" });
  await s.projects.addTiming({ projectId: pNordic.id, title: "Монтаж", startsAt: hoursFromNow(-20), endsAt: hoursFromNow(-8) });
  await s.projects.addTiming({ projectId: pNordic.id, title: "Шоу", startsAt: hoursFromNow(2), endsAt: hoursFromNow(7) });
  // Issue serial units + cables to it.
  await s.equipment.issueUnits({ projectId: pNordic.id, unitIds: [mp[0]!.id, mp[1]!.id, mp[2]!.id, mp[3]!.id], actorId: tech1.id });
  await s.equipment.issueUnits({ projectId: pNordic.id, unitIds: [spk[0]!.id, spk[1]!.id], actorId: tech2.id });
  await s.equipment.issueQuantity({ projectId: pNordic.id, modelId: mDmx10.id, qty: 16, actorId: tech1.id });
  await s.equipment.issueQuantity({ projectId: pNordic.id, modelId: mPower10.id, qty: 12, actorId: tech1.id });
  // Finance: billed + partial prepayment → debt.
  await s.finance.createTransaction({ accountId: accEUR.id, projectId: pNordic.id, kind: "income", category: "rental_revenue", amount: 4800, currency: "EUR", note: "Аренда света и звука" });
  await s.finance.createTransaction({ accountId: accEUR.id, projectId: pNordic.id, kind: "income", category: "prepayment", amount: 2400, currency: "EUR", note: "Предоплата 50%" });
  // Per-unit revenue (payback): MP-001 earned beyond its cost over time.
  await s.finance.createTransaction({ accountId: accEUR.id, projectId: pNordic.id, unitId: mp[0]!.id, kind: "income", category: "rental_revenue", amount: 7000, currency: "EUR", note: "Накопленная выручка MP-001" });
  await s.finance.createTransaction({ accountId: accEUR.id, projectId: pNordic.id, unitId: aura[0]!.id, kind: "income", category: "rental_revenue", amount: 1800, currency: "EUR", note: "Выручка AU-001" });

  // ── Project 2: upcoming, confirmed (Acme) ──
  const pAcme = await s.projects.createProject({ name: "Корпоратив Acme — летняя сцена", clientId: cAcme.id, startsAt: iso(2, 9), endsAt: iso(3, 23) });
  await s.projects.setStatus(pAcme.id, "confirmed");
  await s.projects.addAssignment({ projectId: pAcme.id, userId: tech1.id, roleNote: "Свет" });
  await s.projects.createReservation({ projectId: pAcme.id, modelId: mMacAura.id, qty: 6, startsAt: iso(2, 9), endsAt: iso(3, 23) });
  await s.projects.createReservation({ projectId: pAcme.id, modelId: mHexPar.id, qty: 10, startsAt: iso(2, 9), endsAt: iso(3, 23) });
  await s.finance.createTransaction({ accountId: accEUR.id, projectId: pAcme.id, kind: "income", category: "rental_revenue", amount: 1920, currency: "EUR", note: "Смета" });
  await s.finance.createTransaction({ accountId: accEUR.id, projectId: pAcme.id, kind: "income", category: "prepayment", amount: 1000, currency: "EUR" });

  // ── Project 3: upcoming, confirmed, OVERLAPPING reservation → conflict Problem ──
  const pBeta = await s.projects.createProject({ name: "Презентация Beta — клуб", clientId: cBeta.id, startsAt: iso(2, 18), endsAt: iso(3, 4) });
  await s.projects.setStatus(pBeta.id, "confirmed");
  await s.projects.createReservation({ projectId: pBeta.id, modelId: mMacAura.id, qty: 4, startsAt: iso(2, 18), endsAt: iso(3, 4) });
  const routerUnit=(await s.equipment.listUnits({modelId:routerModel.id}))[0]!;
  await s.equipment.issueUnits({projectId:pBeta.id,unitIds:[mackieUnits[0]!.id,routerUnit.id],actorId:ware.id,note:"Полный цифровой микшерный комплект"});
  await s.equipment.issueQuantity({projectId:pBeta.id,modelId:routerPower.id,qty:1,actorId:ware.id});
  await s.equipment.issueQuantity({projectId:pBeta.id,modelId:mixerPower.id,qty:1,actorId:ware.id});
  await s.equipment.issueQuantity({projectId:pBeta.id,modelId:ethernet2m.id,qty:1,actorId:ware.id});

  // ── Project 4: completed (past) ──
  const pTheatre = await s.projects.createProject({ name: "Спектакль «Чайка» — театр", clientId: cTheatre.id, startsAt: iso(-10, 16), endsAt: iso(-9, 23) });
  await s.projects.setStatus(pTheatre.id, "completed");
  await s.finance.createTransaction({ accountId: accEUR.id, projectId: pTheatre.id, kind: "income", category: "rental_revenue", amount: 2200, currency: "EUR" });
  await s.finance.createTransaction({ accountId: accEUR.id, projectId: pTheatre.id, kind: "income", category: "prepayment", amount: 2200, currency: "EUR", note: "Оплачено полностью" });
  await s.finance.createTransaction({ accountId: accEUR.id, projectId: pTheatre.id, kind: "expense", category: "salary", amount: 400, currency: "EUR", note: "Бригада монтажа" });

  // ── Project 5: draft ──
  const pDraft = await s.projects.createProject({ name: "Свадьба (черновик)", clientId: cAcme.id, startsAt: iso(20, 14), endsAt: iso(21, 2) });
  void pDraft;

  // ── Partial return on the live project → некомплект Problem ──
  await s.equipment.returnUnits({
    projectId: pNordic.id,
    returnedUnitIds: [mp[2]!.id],
    expectedUnitIds: [mp[2]!.id, mp[3]!.id],
    actorId: tech1.id,
    note: "Один прибор остался на сцене на завтра",
  });

  // ── Venue + technical plan for the live operation ──
  const venue = await s.venues.create({ name: "Ice Palace Arena", address: "Москва", widthM: 40, depthM: 30 });
  const plan = await s.plans.createPlan({ projectId: pNordic.id, name: "Главная сцена", venueId: venue.id });
  // Light devices.
  const mh1 = await s.plans.addElement({ planId: plan.id, layer: "light", kind: "fixture", label: "MH1", x: 110, y: 110, unitId: mp[0]!.id });
  const mh2 = await s.plans.addElement({ planId: plan.id, layer: "light", kind: "fixture", label: "MH2", x: 200, y: 110, unitId: mp[1]!.id });
  const mh3 = await s.plans.addElement({ planId: plan.id, layer: "light", kind: "fixture", label: "MH3", x: 290, y: 110, unitId: mp[2]!.id });
  // Sound devices.
  const spkL = await s.plans.addElement({ planId: plan.id, layer: "sound", kind: "fixture", label: "SPK L", x: 70, y: 470 });
  const spkR = await s.plans.addElement({ planId: plan.id, layer: "sound", kind: "fixture", label: "SPK R", x: 330, y: 470 });
  // Cables connecting them.
  await s.plans.addElement({ planId: plan.id, layer: "dmx", kind: "cable", label: "DMX", x: 155, y: 110, fromId: mh1.id, toId: mh2.id });
  await s.plans.addElement({ planId: plan.id, layer: "dmx", kind: "cable", label: "DMX", x: 245, y: 110, fromId: mh2.id, toId: mh3.id });
  await s.plans.addElement({ planId: plan.id, layer: "power", kind: "cable", label: "PWR", x: 90, y: 290, fromId: mh1.id, toId: spkL.id });
  await s.plans.addElement({ planId: plan.id, layer: "audio", kind: "cable", label: "L/R", x: 200, y: 470, fromId: spkL.id, toId: spkR.id });

  // ── Some general expenses ──
  await s.finance.createTransaction({ accountId: accEUR.id, kind: "expense", category: "purchase", amount: 6000, currency: "EUR", note: "Закупка Robe MegaPointe" });
  await s.finance.createTransaction({ accountId: accRSD.id, kind: "expense", category: "repair", amount: 35000, currency: "RSD", note: "Ремонт стробоскопа" });

  const seededModels=await s.equipment.listModels(), seededUnits=await s.equipment.listUnits(), seededZones=await s.equipment.listStorageZones();
  return {
    summary: {
      users: 4,
      models: seededModels.length,
      units: seededUnits.length,
      storageZones: seededZones.length,
      projects: 5,
      accounts: 2,
      catalogItems: 3,
    },
  };
}
