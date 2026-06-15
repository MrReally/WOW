// Rich, diverse demo dataset — used by `pnpm seed` and the admin "reset to demo"
// action. Assumes empty module schemas (the caller drops + migrates first).

import type { Equipment, Finance, People, Projects } from "@sever/contracts";

export interface SeedServices {
  people: People.PeopleService;
  equipment: Equipment.EquipmentService;
  projects: Projects.ProjectsService;
  finance: Finance.FinanceService;
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

  // ── Catalog: types ──
  const tLight = await s.equipment.createType({ name: "Световые приборы", trackingMode: "serial" });
  const tSound = await s.equipment.createType({ name: "Звук", trackingMode: "serial" });
  const tHaze = await s.equipment.createType({ name: "Дым / Хейз", trackingMode: "serial" });
  const tCable = await s.equipment.createType({ name: "Кабели", trackingMode: "quantity" });

  // ── Models ──
  const mMegaPointe = await s.equipment.createModel({ typeId: tLight.id, name: "Robe MegaPointe", manufacturer: "Robe", unitCostEUR: 6000, dailyPriceEUR: 120 });
  const mMacAura = await s.equipment.createModel({ typeId: tLight.id, name: "Martin MAC Aura", manufacturer: "Martin", unitCostEUR: 3500, dailyPriceEUR: 80 });
  const mHexPar = await s.equipment.createModel({ typeId: tLight.id, name: "ADJ Mega Hex Par", manufacturer: "ADJ", unitCostEUR: 300, dailyPriceEUR: 15 });
  const mSourceFour = await s.equipment.createModel({ typeId: tLight.id, name: "ETC Source Four", manufacturer: "ETC", unitCostEUR: 700, dailyPriceEUR: 30 });
  const mStrobe = await s.equipment.createModel({ typeId: tLight.id, name: "Chauvet LED Strobe", manufacturer: "Chauvet", unitCostEUR: 900, dailyPriceEUR: 40 });
  const mSpeaker = await s.equipment.createModel({ typeId: tSound.id, name: "QSC K12.2", manufacturer: "QSC", unitCostEUR: 1200, dailyPriceEUR: 45 });
  const mHazer = await s.equipment.createModel({ typeId: tHaze.id, name: "Antari Z1500", manufacturer: "Antari", unitCostEUR: 900, dailyPriceEUR: 40 });

  const mDmx5 = await s.equipment.createModel({ typeId: tCable.id, name: "DMX 5m XLR5", unitCostEUR: 12, dailyPriceEUR: 1, attrs: { cableType: "DMX", lengthM: 5, connectors: "XLR5 male/female" } });
  const mDmx10 = await s.equipment.createModel({ typeId: tCable.id, name: "DMX 10m XLR5", unitCostEUR: 18, dailyPriceEUR: 1, attrs: { cableType: "DMX", lengthM: 10, connectors: "XLR5 male/female" } });
  const mPower10 = await s.equipment.createModel({ typeId: tCable.id, name: "PowerCON 10m", unitCostEUR: 22, dailyPriceEUR: 1, attrs: { cableType: "Power", lengthM: 10, connectors: "PowerCON in/out" } });
  const mXlr15 = await s.equipment.createModel({ typeId: tCable.id, name: "XLR 15m audio", unitCostEUR: 20, dailyPriceEUR: 1, attrs: { cableType: "Audio", lengthM: 15, connectors: "XLR3" } });

  // ── Cable stock ──
  await s.equipment.setModelStockTotal(mDmx5.id, 60);
  await s.equipment.setModelStockTotal(mDmx10.id, 40);
  await s.equipment.setModelStockTotal(mPower10.id, 50);
  await s.equipment.setModelStockTotal(mXlr15.id, 30);

  // ── Units ──
  const mk = async (modelId: string, prefix: string, n: number, costSerial = 0) => {
    const out: Equipment.EquipmentUnitDTO[] = [];
    for (let i = 1; i <= n; i++) {
      out.push(await s.equipment.createUnit({ modelId, assetTag: `${prefix}-${String(i).padStart(3, "0")}`, serial: `${prefix}${1000 + i}` }));
    }
    void costSerial;
    return out;
  };
  const mp = await mk(mMegaPointe.id, "MP", 8);
  const aura = await mk(mMacAura.id, "AU", 12);
  const hex = await mk(mHexPar.id, "HX", 20);
  const s4 = await mk(mSourceFour.id, "S4", 10);
  const strobe = await mk(mStrobe.id, "ST", 4);
  const spk = await mk(mSpeaker.id, "SP", 8);
  const haze = await mk(mHazer.id, "HZ", 3);

  // Some units in non-stock states for variety.
  await s.equipment.changeStatus(strobe[0]!.id, "in_repair", ware.id, "Не зажигается сегмент");
  await s.equipment.changeStatus(s4[9]!.id, "lost", ware.id, "Не вернулся с прошлого проекта");
  await s.equipment.changeStatus(haze[2]!.id, "at_contractor", ware.id, "Отдан субподрядчику");

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

  // ── Some general expenses ──
  await s.finance.createTransaction({ accountId: accEUR.id, kind: "expense", category: "purchase", amount: 6000, currency: "EUR", note: "Закупка Robe MegaPointe" });
  await s.finance.createTransaction({ accountId: accRSD.id, kind: "expense", category: "repair", amount: 35000, currency: "RSD", note: "Ремонт стробоскопа" });

  return {
    summary: {
      users: 4,
      models: 11,
      units: mp.length + aura.length + hex.length + s4.length + strobe.length + spk.length + haze.length,
      projects: 5,
      accounts: 2,
    },
  };
}
