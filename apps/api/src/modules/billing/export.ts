import type { Equipment, Finance, People, Projects, Venues } from "@sever/contracts";
import { amountAfterDiscountEUR, discountAmountEUR } from "@sever/contracts";

interface ExportDeps {
  projects: Projects.ProjectsService;
  equipment: Equipment.EquipmentService;
  finance: Finance.FinanceService;
  people: People.PeopleService;
  venues: Venues.VenuesService;
}

type Cell = string | number | boolean | null | undefined;

interface ExportRow {
  [column: string]: Cell;
}

const PROJECT_STATUS: Record<Projects.ProjectStatus, string> = {
  draft: "Черновик",
  confirmed: "Подтверждён",
  in_progress: "В работе",
  awaiting_payment: "Ждёт оплаты",
  completed: "Завершён",
  cancelled: "Отменён",
};

const PROJECT_STAGE: Record<Projects.ProjectChecklistGroup, string> = {
  prep: "Сбор",
  pickup: "Забор",
  delivery: "Доставка",
  mount: "Монтаж",
  show: "Шоу",
  dismantle: "Демонтаж",
  return: "Возврат",
};

const TRANSACTION_CATEGORY: Record<Finance.TxCategory, string> = {
  rental_revenue: "Начисление аренды",
  prepayment: "Предоплата",
  debt_settlement: "Оплата клиента",
  purchase: "Закупка",
  repair: "Ремонт",
  salary: "Зарплата",
  other: "Прочее",
};

const DISCOUNT_TYPE: Record<Finance.DiscountType, string> = {
  percent: "%",
  fixed_rsd: "RSD",
  fixed_eur: "EUR",
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const daysBetween = (start: string | null, end: string | null) =>
  start && end ? Math.max(1, Math.ceil((Date.parse(end) - Date.parse(start)) / 86_400_000)) : 1;
const publicName = (user: People.UserDTO | undefined) => user?.nickname?.trim() || user?.displayName?.trim() || "";

const COLUMNS = [
  "Проект ID", "Проект", "Базовое название проекта", "Дата время начало", "Дата время конец", "Статус", "Код статуса",
  "Этап проекта", "Код этапа проекта", "Проект создан", "Складской оборот завершён", "Дресс-код", "Единый дресс-код (да/нет)",
  "Заказчик ID", "Заказчик", "Контакты заказчика", "Заметка проекта", "Площадка ID", "Площадка", "Адрес площадки",
  "Последнее КП ID", "Номер последнего КП", "Дата последнего КП", "Последнее КП создано", "Валюта последнего КП", "Сумма последнего КП, EUR",
  "Тип записи", "Подтип записи", "Запись ID", "Раздел", "Позиция", "Комментарий позиции", "Состояние позиции",
  "Источник позиции сметы", "Исходная запись ID", "Строка сметы ID", "Скрыта в смете (да/нет)", "Порядок в смете",
  "Количество", "Периодов", "Цена за единицу, EUR", "Прибыль записи, EUR", "Траты записи, EUR", "Сальдо записи, EUR",
  "Сколько оплачено реально, EUR", "Денежный поток, EUR", "Остаток к оплате, EUR",
  "Модель ID", "Модель оборудования", "Тип оборудования ID", "Тип оборудования", "Производитель", "Режим учёта", "Себестоимость единицы, EUR",
  "Единица ID", "Единица", "Серийный номер", "Статус единицы", "Текущее место хранения",
  "Роль ID", "Ставка роли, EUR", "Назначение ID", "Участник ID", "Участник", "Ставки участников, EUR", "Статус участия", "Причина отмены участия",
  "Подрядчик ID", "Подрядчик", "Подтверждено у подрядчика (да/нет)", "Дата оплаты подрядчику", "Дата возврата подрядчику", "Резерв (да/нет)",
  "Скидка", "Тип скидки", "Размер скидки", "Скидка позиции, EUR", "Доля общей скидки, EUR",
  "Откуда взято", "Куда возвращено", "Начало позиции", "Конец позиции",
  "Счёт ID", "Счёт", "Категория транзакции", "Исходная сумма", "Исходная валюта", "Курс к EUR", "Исправляет операцию ID",
  "Автор операции ID", "Автор операции", "Изменил операцию ID", "Изменил операцию", "Аннулировал операцию ID", "Аннулировал операцию",
  "Создано", "Обновлено", "Аннулировано", "Финансы проекта учитываются (да/нет)", "Серия проекта ID",
] as const;

function csvCell(value: Cell): string {
  if (value == null) return "";
  const text = typeof value === "boolean" ? (value ? "да" : "нет") : String(value);
  // Formula-looking values are prefixed to keep spreadsheet software from
  // executing user-entered text as a formula.
  const safe = typeof value === "string" && /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCsv(rows: ExportRow[]): string {
  const lines = [COLUMNS.join(";"), ...rows.map((row) => COLUMNS.map((column) => csvCell(row[column])).join(";"))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function baseRow(
  project: Projects.ProjectDTO,
  client: Projects.ClientDTO | undefined,
  venue: Venues.VenueDTO | undefined,
  latestInvoice: Finance.InvoiceVersionDTO | undefined,
  canViewProjectNotes: boolean,
): ExportRow {
  return {
    "Проект ID": project.id,
    "Проект": project.name,
    "Базовое название проекта": project.baseName,
    "Дата время начало": project.startsAt,
    "Дата время конец": project.endsAt,
    "Статус": PROJECT_STATUS[project.status],
    "Код статуса": project.status,
    "Этап проекта": PROJECT_STAGE[project.operationStage],
    "Код этапа проекта": project.operationStage,
    "Проект создан": project.createdAt,
    "Складской оборот завершён": project.warehouseTurnoverCompletedAt,
    "Дресс-код": project.dressCodeLabel,
    "Единый дресс-код (да/нет)": project.dressCodeUniform,
    "Заказчик ID": project.clientId,
    "Заказчик": client?.name,
    "Контакты заказчика": client?.contacts,
    "Заметка проекта": canViewProjectNotes ? project.note : null,
    "Площадка ID": project.venueId,
    "Площадка": venue?.name,
    "Адрес площадки": venue?.address,
    "Последнее КП ID": latestInvoice?.id,
    "Номер последнего КП": latestInvoice?.number,
    "Дата последнего КП": latestInvoice?.date,
    "Последнее КП создано": latestInvoice?.createdAt,
    "Валюта последнего КП": latestInvoice?.currency,
    "Сумма последнего КП, EUR": latestInvoice?.totalEUR,
    "Финансы проекта учитываются (да/нет)": project.financeTracked,
    "Серия проекта ID": project.seriesId,
  };
}

interface PositionDraft {
  row: ExportRow;
  revenueBeforeProjectDiscount: number;
  eligibleForProjectDiscount: boolean;
}

function estimateEconomics(
  fallbackRevenue: number,
  fallbackCost: number,
  saved: Finance.ProjectEstimateLineDTO | undefined,
  rsdRateToEUR: number,
) {
  if (!saved) return { revenue: round2(fallbackRevenue), cost: round2(fallbackCost), lineDiscount: 0 };
  const lineDiscount = discountAmountEUR(saved.priceEUR, saved.discountType, saved.discountValue, rsdRateToEUR);
  return {
    revenue: amountAfterDiscountEUR(saved.priceEUR, saved.discountType, saved.discountValue, rsdRateToEUR),
    cost: round2(saved.costEUR),
    lineDiscount,
  };
}

function movementWarehouses(
  journal: Equipment.JournalEntryDTO[],
  warehouses: Map<string, Equipment.WarehouseDTO>,
  unitIds: string[],
  modelId: string,
) {
  const applies = (entry: Equipment.JournalEntryDTO) =>
    (entry.unitId != null && unitIds.includes(entry.unitId)) || (entry.modelId === modelId && entry.unitId == null);
  const sourceIds = new Set(journal.filter((entry) => applies(entry) && entry.action === "issued")
    .map((entry) => entry.fromWarehouseId ?? entry.warehouseId).filter((id): id is string => Boolean(id)));
  const returnIds = new Set(journal.filter((entry) => applies(entry) && (entry.action === "returned" || entry.action === "return_incomplete"))
    .map((entry) => entry.toWarehouseId ?? entry.warehouseId).filter((id): id is string => Boolean(id)));
  const names = (ids: Set<string>) => [...ids].map((id) => warehouses.get(id)?.name ?? id).join(", ");
  return { source: names(sourceIds), returnedTo: names(returnIds) };
}

/**
 * Produces an audit-friendly, position-level export. Planned economics stay on
 * position rows; cash movements stay on transaction rows so neither is hidden
 * and linked payouts are not counted twice as project costs.
 */
export async function createFullExportCsv(deps: ExportDeps, canViewProjectNotes: boolean): Promise<string> {
  const [projects, clients, venues, models, types, units, warehouses, contractors, people, accounts, fxRates] = await Promise.all([
    deps.projects.listProjects(),
    deps.projects.listClients(),
    deps.venues.list(true),
    deps.equipment.listModels(undefined, true),
    deps.equipment.listTypes(),
    deps.equipment.listUnits({ includeArchived: true }),
    deps.equipment.listWarehouses(),
    deps.equipment.listContractors(),
    deps.people.list("all"),
    deps.finance.listAccounts(),
    deps.finance.listFxRates(),
  ]);
  const clientById = new Map(clients.map((item) => [item.id, item]));
  const venueById = new Map(venues.map((item) => [item.id, item]));
  const modelById = new Map(models.map((item) => [item.id, item]));
  const typeById = new Map(types.map((item) => [item.id, item]));
  const unitById = new Map(units.map((item) => [item.id, item]));
  const warehouseById = new Map(warehouses.map((item) => [item.id, item]));
  const contractorById = new Map(contractors.map((item) => [item.id, item]));
  const personById = new Map(people.map((item) => [item.id, item]));
  const accountById = new Map(accounts.map((item) => [item.id, item]));
  const rsdRateToEUR = fxRates.find((rate) => rate.currency === "RSD")?.rateToEUR ?? 0;
  const rows: ExportRow[] = [];

  for (const project of projects) {
    const [reservations, assignments, roles, contractorItems, estimateLines, estimateSettings, transactions, journal, invoiceVersions] = await Promise.all([
      deps.projects.listReservations(project.id),
      deps.projects.listAssignments(project.id),
      deps.projects.listProjectRoles(project.id),
      deps.projects.listContractorItems(project.id),
      deps.finance.listProjectEstimateLines(project.id),
      deps.finance.getProjectEstimateSettings(project.id),
      deps.finance.listTransactions({ projectId: project.id, includeVoided: true }),
      deps.equipment.listJournal({ projectId: project.id, limit: 2000 }),
      deps.finance.listInvoiceVersions(project.id),
    ]);
    const common = baseRow(
      project,
      clientById.get(project.clientId),
      project.venueId ? venueById.get(project.venueId) : undefined,
      invoiceVersions[0],
      canViewProjectNotes,
    );
    const estimatesBySource = new Map(estimateLines.filter((line) => line.sourceRefId).map((line) => [line.sourceRefId!, line]));
    const liveTransactions = transactions.filter((transaction) => !transaction.voidedAt);
    const projectDays = daysBetween(project.startsAt, project.endsAt);
    const positions: PositionDraft[] = [];
    const contractorEconomics = new Map(contractorItems.map((item) => {
      const saved = estimatesBySource.get(item.id);
      const economics = estimateEconomics(item.priceEUR * item.qty, item.costEUR * item.qty, saved, rsdRateToEUR);
      return [item.id, saved?.hidden ? { ...economics, revenue: 0, cost: 0 } : economics] as const;
    }));
    const contractorItemsByContractor = new Map<string, Projects.ContractorItemDTO[]>();
    for (const item of contractorItems) contractorItemsByContractor.set(item.contractorId, [...(contractorItemsByContractor.get(item.contractorId) ?? []), item]);
    const allocatedContractorPayments = new Map<string, number>();
    for (const [contractorId, items] of contractorItemsByContractor) {
      const ledgerPaid = round2(liveTransactions.filter((transaction) => transaction.kind === "expense" && transaction.contractorId === contractorId)
        .reduce((sum, transaction) => sum + transaction.amountEUR, 0));
      const totalCost = items.reduce((sum, item) => sum + (contractorEconomics.get(item.id)?.cost ?? 0), 0);
      let allocated = 0;
      items.forEach((item, index) => {
        const cost = contractorEconomics.get(item.id)?.cost ?? 0;
        const share = index === items.length - 1 ? round2(ledgerPaid - allocated) : totalCost > 0 ? round2(ledgerPaid * cost / totalCost) : 0;
        allocatedContractorPayments.set(item.id, Math.max(0, share));
        allocated = round2(allocated + share);
      });
    }

    for (const reservation of reservations) {
      const model = modelById.get(reservation.modelId);
      const saved = estimatesBySource.get(reservation.id);
      const fallbackRevenue = reservation.isReserve ? 0 : (model?.dailyPriceEUR ?? 0) * reservation.qty * projectDays;
      const economics = reservation.isReserve ? { revenue: 0, cost: 0, lineDiscount: 0 } : estimateEconomics(fallbackRevenue, 0, saved, rsdRateToEUR);
      const reservationUnits = reservation.resolvedUnitIds.map((id) => unitById.get(id)).filter((unit): unit is Equipment.EquipmentUnitDTO => Boolean(unit));
      const movement = movementWarehouses(journal, warehouseById, reservation.resolvedUnitIds, reservation.modelId);
      const actual = round2(liveTransactions.filter((transaction) => transaction.unitId && reservation.resolvedUnitIds.includes(transaction.unitId))
        .reduce((sum, transaction) => sum + (transaction.kind === "income" ? transaction.amountEUR : -transaction.amountEUR), 0));
      positions.push({
        revenueBeforeProjectDiscount: saved?.hidden ? 0 : economics.revenue,
        eligibleForProjectDiscount: !reservation.isReserve && !saved?.hidden,
        row: {
          ...common,
          "Тип записи": "оборудование",
          "Подтип записи": "собственное",
          "Запись ID": reservation.id,
          "Раздел": saved?.section ?? (model ? typeById.get(model.typeId)?.name : null),
          "Позиция": saved?.name ?? model?.name ?? reservation.modelId,
          "Комментарий позиции": saved?.comment,
          "Состояние позиции": saved?.hidden ? "Скрыта в смете" : "Активна",
          "Источник позиции сметы": saved?.source ?? "equipment",
          "Исходная запись ID": saved?.sourceRefId ?? reservation.id,
          "Строка сметы ID": saved?.id,
          "Скрыта в смете (да/нет)": saved?.hidden ?? false,
          "Порядок в смете": saved?.sortOrder,
          "Количество": saved?.qty ?? reservation.qty,
          "Периодов": saved ? 1 : projectDays,
          "Цена за единицу, EUR": saved ? (saved.qty ? round2(saved.priceEUR / saved.qty) : saved.priceEUR) : model?.dailyPriceEUR,
          "Траты записи, EUR": saved?.hidden ? 0 : economics.cost,
          "Сколько оплачено реально, EUR": actual,
          "Остаток к оплате, EUR": round2(economics.cost - Math.max(0, -actual)),
          "Модель ID": model?.id ?? reservation.modelId,
          "Модель оборудования": model?.name,
          "Тип оборудования ID": model?.typeId,
          "Тип оборудования": model ? typeById.get(model.typeId)?.name : null,
          "Производитель": model?.manufacturer,
          "Режим учёта": model?.trackingMode,
          "Себестоимость единицы, EUR": model?.unitCostEUR,
          "Единица ID": reservationUnits.map((unit) => unit.id).join(", "),
          "Единица": reservationUnits.map((unit) => unit.assetTag).join(", "),
          "Серийный номер": reservationUnits.map((unit) => unit.serial).filter(Boolean).join(", "),
          "Статус единицы": reservationUnits.map((unit) => unit.status).join(", "),
          "Текущее место хранения": reservationUnits.map((unit) => unit.warehouseId
            ? warehouseById.get(unit.warehouseId)?.name ?? unit.warehouseId
            : unit.installedVenueId ? venueById.get(unit.installedVenueId)?.name ?? unit.installedVenueId : "").filter(Boolean).join(", "),
          "Резерв (да/нет)": reservation.isReserve,
          "Скидка": saved && saved.discountValue > 0 ? `${saved.discountValue} ${DISCOUNT_TYPE[saved.discountType]}` : "",
          "Тип скидки": saved ? DISCOUNT_TYPE[saved.discountType] : null,
          "Размер скидки": saved?.discountValue,
          "Скидка позиции, EUR": economics.lineDiscount,
          "Откуда взято": movement.source,
          "Куда возвращено": movement.returnedTo,
          "Начало позиции": reservation.startsAt ?? project.startsAt,
          "Конец позиции": reservation.endsAt ?? project.endsAt,
          "Создано": reservation.createdAt,
        },
      });
    }

    for (const item of contractorItems) {
      const saved = estimatesBySource.get(item.id);
      const economics = contractorEconomics.get(item.id)!;
      const paid = allocatedContractorPayments.get(item.id) ?? 0;
      const legacyPaid = !liveTransactions.some((transaction) => transaction.kind === "expense" && transaction.contractorId === item.contractorId) && item.paidAt ? economics.cost : 0;
      positions.push({
        revenueBeforeProjectDiscount: saved?.hidden ? 0 : economics.revenue,
        eligibleForProjectDiscount: !saved?.hidden,
        row: {
          ...common,
          "Тип записи": item.kind === "equipment" ? "оборудование" : "трата",
          "Подтип записи": item.kind === "equipment" ? "подрядчик" : item.kind,
          "Запись ID": item.id,
          "Раздел": saved?.section ?? (item.kind === "delivery" ? "Доставка" : item.kind === "setup" ? "Монтаж" : "Оборудование"),
          "Позиция": saved?.name ?? item.name,
          "Комментарий позиции": saved?.comment || item.note,
          "Состояние позиции": [item.booked ? "Подтверждена" : "Не подтверждена", item.returnedAt ? "Возвращена" : item.kind === "equipment" ? "Не возвращена" : null].filter(Boolean).join("; "),
          "Источник позиции сметы": saved?.source ?? "contractor",
          "Исходная запись ID": saved?.sourceRefId ?? item.id,
          "Строка сметы ID": saved?.id,
          "Скрыта в смете (да/нет)": saved?.hidden ?? false,
          "Порядок в смете": saved?.sortOrder,
          "Количество": saved?.qty ?? item.qty,
          "Периодов": 1,
          "Цена за единицу, EUR": saved ? (saved.qty ? round2(saved.priceEUR / saved.qty) : saved.priceEUR) : item.priceEUR,
          "Траты записи, EUR": economics.cost,
          "Сколько оплачено реально, EUR": round2(paid + legacyPaid),
          "Остаток к оплате, EUR": Math.max(0, round2(economics.cost - paid - legacyPaid)),
          "Подрядчик ID": item.contractorId,
          "Подрядчик": contractorById.get(item.contractorId)?.name ?? item.contractorId,
          "Подтверждено у подрядчика (да/нет)": item.booked,
          "Дата оплаты подрядчику": item.paidAt,
          "Дата возврата подрядчику": item.returnedAt,
          "Резерв (да/нет)": false,
          "Скидка": saved && saved.discountValue > 0 ? `${saved.discountValue} ${DISCOUNT_TYPE[saved.discountType]}` : "",
          "Тип скидки": saved ? DISCOUNT_TYPE[saved.discountType] : null,
          "Размер скидки": saved?.discountValue,
          "Скидка позиции, EUR": economics.lineDiscount,
          "Куда возвращено": item.returnedAt ? contractorById.get(item.contractorId)?.name : null,
          "Создано": item.createdAt,
        },
      });
    }

    const isActiveAssignment = (assignment: Projects.AssignmentDTO) => assignment.status === "added" || assignment.status === "accepted";
    const laborSources: Array<{ id: string; roleId: string | null; title: string; comment: string | null; qty: number; rate: number; startsAt: string | null; endsAt: string | null; assignments: Projects.AssignmentDTO[]; billable: boolean; createdAt: string }> = roles.length
      ? roles.map((role) => ({ id: role.id, roleId: role.id, title: role.title, comment: role.comment, qty: role.requiredCount, rate: role.rateEUR ?? 0, startsAt: role.effectiveStartsAt, endsAt: role.effectiveEndsAt, assignments: assignments.filter((assignment) => assignment.roleId === role.id), billable: true, createdAt: role.createdAt }))
      : assignments.map((assignment) => ({ id: assignment.id, roleId: assignment.roleId, title: assignment.roleNote || "Участник", comment: null, qty: 1, rate: assignment.rateEUR ?? 0, startsAt: project.startsAt, endsAt: project.endsAt, assignments: [assignment], billable: isActiveAssignment(assignment), createdAt: assignment.createdAt }));
    for (const labor of laborSources) {
      const saved = estimatesBySource.get(labor.id);
      const rawEconomics = estimateEconomics(labor.rate * labor.qty, labor.rate * labor.qty, saved, rsdRateToEUR);
      const economics = saved?.hidden || !labor.billable ? { ...rawEconomics, revenue: 0, cost: 0 } : rawEconomics;
      const assignmentIds = new Set(labor.assignments.map((assignment) => assignment.id));
      const ledgerPaid = round2(liveTransactions.filter((transaction) => transaction.kind === "expense" && transaction.assignmentId && assignmentIds.has(transaction.assignmentId))
        .reduce((sum, transaction) => sum + transaction.amountEUR, 0));
      const legacyPaid = ledgerPaid === 0 ? round2(labor.assignments.reduce((sum, assignment) => sum + assignment.paidEUR, 0)) : 0;
      positions.push({
        revenueBeforeProjectDiscount: saved?.hidden || !labor.billable ? 0 : economics.revenue,
        eligibleForProjectDiscount: !saved?.hidden && labor.billable,
        row: {
          ...common,
          "Тип записи": "роль",
          "Подтип записи": "команда",
          "Запись ID": labor.id,
          "Раздел": saved?.section ?? "Команда",
          "Позиция": saved?.name ?? labor.title,
          "Комментарий позиции": saved?.comment || labor.comment,
          "Состояние позиции": `${labor.assignments.filter(isActiveAssignment).length}/${labor.qty} активно; всего ${labor.assignments.length}`,
          "Источник позиции сметы": saved?.source ?? "labor",
          "Исходная запись ID": saved?.sourceRefId ?? labor.id,
          "Строка сметы ID": saved?.id,
          "Скрыта в смете (да/нет)": saved?.hidden ?? false,
          "Порядок в смете": saved?.sortOrder,
          "Количество": saved?.qty ?? labor.qty,
          "Периодов": 1,
          "Цена за единицу, EUR": saved ? (saved.qty ? round2(saved.priceEUR / saved.qty) : saved.priceEUR) : labor.rate,
          "Траты записи, EUR": economics.cost,
          "Сколько оплачено реально, EUR": round2(ledgerPaid + legacyPaid),
          "Остаток к оплате, EUR": Math.max(0, round2(economics.cost - ledgerPaid - legacyPaid)),
          "Роль ID": labor.roleId,
          "Ставка роли, EUR": labor.rate,
          "Назначение ID": labor.assignments.map((assignment) => assignment.id).join(", "),
          "Участник ID": labor.assignments.map((assignment) => assignment.userId).join(", "),
          "Участник": labor.assignments.map((assignment) => publicName(personById.get(assignment.userId))).filter(Boolean).join(", "),
          "Ставки участников, EUR": labor.assignments.map((assignment) => assignment.rateEUR ?? "").join(", "),
          "Статус участия": labor.assignments.map((assignment) => assignment.status).join(", "),
          "Причина отмены участия": labor.assignments.map((assignment) => assignment.cancellationReason ?? "").join(", "),
          "Резерв (да/нет)": false,
          "Скидка": saved && saved.discountValue > 0 ? `${saved.discountValue} ${DISCOUNT_TYPE[saved.discountType]}` : "",
          "Тип скидки": saved ? DISCOUNT_TYPE[saved.discountType] : null,
          "Размер скидки": saved?.discountValue,
          "Скидка позиции, EUR": economics.lineDiscount,
          "Начало позиции": labor.startsAt ?? project.startsAt,
          "Конец позиции": labor.endsAt ?? project.endsAt,
          "Создано": labor.createdAt,
        },
      });
    }

    for (const line of estimateLines.filter((item) => item.source === "manual")) {
      const rawEconomics = estimateEconomics(line.priceEUR, line.costEUR, line, rsdRateToEUR);
      const economics = line.hidden ? { ...rawEconomics, revenue: 0, cost: 0 } : rawEconomics;
      positions.push({
        revenueBeforeProjectDiscount: line.hidden ? 0 : economics.revenue,
        eligibleForProjectDiscount: !line.hidden,
        row: {
          ...common,
          "Тип записи": "другая позиция",
          "Подтип записи": "ручная смета",
          "Запись ID": line.id,
          "Раздел": line.section,
          "Позиция": line.name,
          "Комментарий позиции": line.comment,
          "Состояние позиции": line.hidden ? "Скрыта в смете" : "Активна",
          "Источник позиции сметы": line.source,
          "Исходная запись ID": line.sourceRefId,
          "Строка сметы ID": line.id,
          "Скрыта в смете (да/нет)": line.hidden,
          "Порядок в смете": line.sortOrder,
          "Количество": line.qty,
          "Периодов": 1,
          "Цена за единицу, EUR": line.qty ? round2(line.priceEUR / line.qty) : line.priceEUR,
          "Траты записи, EUR": economics.cost,
          "Скидка": line.discountValue > 0 ? `${line.discountValue} ${DISCOUNT_TYPE[line.discountType]}` : "",
          "Тип скидки": DISCOUNT_TYPE[line.discountType],
          "Размер скидки": line.discountValue,
          "Скидка позиции, EUR": economics.lineDiscount,
          "Создано": line.createdAt,
          "Обновлено": line.updatedAt,
        },
      });
    }

    const knownSourceIds = new Set([
      ...reservations.map((item) => item.id),
      ...contractorItems.map((item) => item.id),
      ...laborSources.map((item) => item.id),
    ]);
    for (const line of estimateLines.filter((item) => item.source !== "manual" && (!item.sourceRefId || !knownSourceIds.has(item.sourceRefId)))) {
      positions.push({
        revenueBeforeProjectDiscount: 0,
        eligibleForProjectDiscount: false,
        row: {
          ...common,
          "Тип записи": line.source === "labor" ? "роль" : line.source === "equipment" ? "оборудование" : "трата",
          "Подтип записи": "архивная строка сметы",
          "Запись ID": line.id,
          "Раздел": line.section,
          "Позиция": line.name,
          "Комментарий позиции": line.comment,
          "Состояние позиции": "Источник не найден; в итог сметы не входит",
          "Источник позиции сметы": line.source,
          "Исходная запись ID": line.sourceRefId,
          "Строка сметы ID": line.id,
          "Скрыта в смете (да/нет)": line.hidden,
          "Порядок в смете": line.sortOrder,
          "Количество": line.qty,
          "Периодов": 1,
          "Цена за единицу, EUR": line.qty ? round2(line.priceEUR / line.qty) : line.priceEUR,
          "Траты записи, EUR": 0,
          "Скидка": line.discountValue > 0 ? `${line.discountValue} ${DISCOUNT_TYPE[line.discountType]}` : "",
          "Тип скидки": DISCOUNT_TYPE[line.discountType],
          "Размер скидки": line.discountValue,
          "Скидка позиции, EUR": discountAmountEUR(line.priceEUR, line.discountType, line.discountValue, rsdRateToEUR),
          "Создано": line.createdAt,
          "Обновлено": line.updatedAt,
        },
      });
    }

    const discountBase = positions.filter((position) => position.eligibleForProjectDiscount).reduce((sum, position) => sum + position.revenueBeforeProjectDiscount, 0);
    const projectDiscount = discountAmountEUR(discountBase, estimateSettings.totalDiscountType, estimateSettings.totalDiscountValue, rsdRateToEUR);
    let allocatedDiscount = 0;
    const eligible = positions.filter((position) => position.eligibleForProjectDiscount);
    for (const position of positions) {
      let share = 0;
      if (position.eligibleForProjectDiscount && discountBase > 0) {
        const isLast = position === eligible.at(-1);
        share = isLast ? round2(projectDiscount - allocatedDiscount) : round2(projectDiscount * position.revenueBeforeProjectDiscount / discountBase);
        allocatedDiscount = round2(allocatedDiscount + share);
      }
      const revenue = round2(position.revenueBeforeProjectDiscount - share);
      const cost = Number(position.row["Траты записи, EUR"] ?? 0);
      position.row["Прибыль записи, EUR"] = revenue;
      position.row["Сальдо записи, EUR"] = round2(revenue - cost);
      position.row["Доля общей скидки, EUR"] = share;
      if (share > 0) {
        const projectDiscountLabel = `${estimateSettings.totalDiscountValue} ${DISCOUNT_TYPE[estimateSettings.totalDiscountType]} (общая)`;
        position.row["Скидка"] = [position.row["Скидка"], projectDiscountLabel].filter(Boolean).join("; ");
      }
      rows.push(position.row);
    }

    for (const transaction of transactions) {
      const linkedToPlannedCost = transaction.kind === "expense" && Boolean(transaction.assignmentId || transaction.contractorId);
      const standaloneCost = transaction.kind === "expense" && !linkedToPlannedCost && !transaction.voidedAt ? transaction.amountEUR : 0;
      const actualPaid = !transaction.voidedAt && (transaction.kind === "expense" || transaction.category === "prepayment" || transaction.category === "debt_settlement") ? transaction.amountEUR : 0;
      const transactionUnit = transaction.unitId ? unitById.get(transaction.unitId) : undefined;
      const transactionModel = transactionUnit ? modelById.get(transactionUnit.modelId) : undefined;
      const transactionAssignment = transaction.assignmentId ? assignments.find((assignment) => assignment.id === transaction.assignmentId) : undefined;
      rows.push({
        ...common,
        "Тип записи": transaction.kind === "expense" ? "трата" : "платёж",
        "Подтип записи": "финансовая операция",
        "Запись ID": transaction.id,
        "Раздел": transaction.kind === "expense" ? "Фактические траты" : "Поступления",
        "Позиция": TRANSACTION_CATEGORY[transaction.category],
        "Комментарий позиции": transaction.note,
        "Состояние позиции": transaction.voidedAt ? "Аннулирована" : transaction.replacesTransactionId ? "Корректировка" : "Проведена",
        "Количество": 1,
        "Периодов": 1,
        "Цена за единицу, EUR": transaction.amountEUR,
        "Прибыль записи, EUR": 0,
        "Траты записи, EUR": standaloneCost,
        "Сальдо записи, EUR": round2(-standaloneCost),
        "Сколько оплачено реально, EUR": actualPaid,
        "Денежный поток, EUR": transaction.voidedAt || transaction.category === "rental_revenue" ? 0 : round2(transaction.kind === "income" ? transaction.amountEUR : -transaction.amountEUR),
        "Модель ID": transactionModel?.id,
        "Модель оборудования": transactionModel?.name,
        "Тип оборудования ID": transactionModel?.typeId,
        "Тип оборудования": transactionModel ? typeById.get(transactionModel.typeId)?.name : null,
        "Производитель": transactionModel?.manufacturer,
        "Режим учёта": transactionModel?.trackingMode,
        "Себестоимость единицы, EUR": transactionModel?.unitCostEUR,
        "Единица ID": transaction.unitId,
        "Единица": transactionUnit?.assetTag ?? transaction.unitId,
        "Серийный номер": transactionUnit?.serial,
        "Статус единицы": transactionUnit?.status,
        "Текущее место хранения": transactionUnit?.warehouseId ? warehouseById.get(transactionUnit.warehouseId)?.name ?? transactionUnit.warehouseId : null,
        "Роль ID": transactionAssignment?.roleId,
        "Назначение ID": transaction.assignmentId,
        "Участник ID": transactionAssignment?.userId,
        "Участник": transactionAssignment ? publicName(personById.get(transactionAssignment.userId)) : null,
        "Ставки участников, EUR": transactionAssignment?.rateEUR,
        "Статус участия": transactionAssignment?.status,
        "Подрядчик ID": transaction.contractorId,
        "Подрядчик": transaction.contractorId ? contractorById.get(transaction.contractorId)?.name ?? transaction.contractorId : null,
        "Счёт ID": transaction.accountId,
        "Счёт": accountById.get(transaction.accountId)?.name ?? transaction.accountId,
        "Категория транзакции": TRANSACTION_CATEGORY[transaction.category],
        "Исходная сумма": transaction.amount,
        "Исходная валюта": transaction.currency,
        "Курс к EUR": transaction.fxRateToEUR,
        "Исправляет операцию ID": transaction.replacesTransactionId,
        "Автор операции ID": transaction.createdByUserId,
        "Автор операции": transaction.createdByUserId ? publicName(personById.get(transaction.createdByUserId)) : null,
        "Изменил операцию ID": transaction.updatedByUserId,
        "Изменил операцию": transaction.updatedByUserId ? publicName(personById.get(transaction.updatedByUserId)) : null,
        "Аннулировал операцию ID": transaction.voidedByUserId,
        "Аннулировал операцию": transaction.voidedByUserId ? publicName(personById.get(transaction.voidedByUserId)) : null,
        "Создано": transaction.createdAt,
        "Обновлено": transaction.updatedAt,
        "Аннулировано": transaction.voidedAt,
      });
    }

    if (positions.length === 0 && transactions.length === 0) {
      rows.push({ ...common, "Тип записи": "проект", "Состояние позиции": "Нет позиций" });
    }
  }

  return toCsv(rows);
}
