import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Equipment } from "@sever/contracts";
import {
  Button,
  Field,
  Input,
  SectionHead,
  Chip,
  Dot,
  Loading,
  ErrorState,
  EmptyState,
  Select,
  Sheet,
  type Tone,
} from "../../ui-kit/index.ts";
import { eur, unitStatusLabel } from "../../lib/labels.ts";
import { useSession } from "../../app/session.ts";
import {
  useModels,
  useUnits,
  useTypes,
  useProjectsForOps,
  useOpenRepairs,
  useOpenHandovers,
  useWarehouses,
  useStorageZones,
  useSaveStorageZones,
  type StorageZoneDraftInput,
  useCreateWarehouse,
  useUpdateWarehouse,
  useUpdateType,
  useCableSettings,
  useCategories,
} from "./hooks.ts";
import { formatCableModel } from "./cables.ts";
import { AddModelSheet } from "./components/AddModelSheet.tsx";
import { EditModelSheet } from "./components/EditModelSheet.tsx";
import { ImportSheet } from "./components/ImportSheet.tsx";
import { CableMoveSheet, CableRow } from "./components/CableMoveSheet.tsx";
import { OpsSheet } from "./components/OpsSheet.tsx";
import { AddressInput } from "../places/AddressInput.tsx";
import { useCreateVenue, useUpdateVenue, useVenues } from "../plans/hooks.ts";

type ZoneDraft = StorageZoneDraftInput;

const ZONE_LEVELS: Record<Equipment.StorageZoneKind, { label: string; child?: "rack" | "shelf"; add?: string }> = {
  room: { label: "Помещение", child: "rack", add: "+ Стеллаж" },
  rack: { label: "Стеллаж", child: "shelf", add: "+ Полка" },
  shelf: { label: "Полка" },
  bin: { label: "Ячейка" },
  floor: { label: "Напольная зона" },
  other: { label: "Зона" },
};

function ZoneEditor({ zones, onChange }: { zones: ZoneDraft[]; onChange: (zones: ZoneDraft[]) => void }) {
  const children = (parentId: string | null) => zones.filter((zone) => zone.parentId === parentId);
  const addZone = (parentId: string | null, kind: "room" | "rack" | "shelf") => {
    const parent = parentId ? zones.find((zone) => zone.id === parentId) : null;
    const siblings = children(parentId);
    const ordinal = siblings.length + 1;
    const code = parent ? `${parent.code}-${kind === "rack" ? String(ordinal).padStart(2, "0") : ordinal}` : String.fromCharCode(64 + ordinal);
    onChange([...zones, { id: `new-${crypto.randomUUID()}`, parentId, name: `${ZONE_LEVELS[kind].label} ${ordinal}`, code, kind, isNew: true }]);
  };
  const updateZone = (id: string, input: Partial<ZoneDraft>) => onChange(zones.map((zone) => zone.id === id ? { ...zone, ...input } : zone));
  const removeZone = (id: string) => {
    const removed = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      zones.forEach((zone) => {
        if (zone.parentId && removed.has(zone.parentId) && !removed.has(zone.id)) {
          removed.add(zone.id);
          changed = true;
        }
      });
    }
    onChange(zones.filter((zone) => !removed.has(zone.id)));
  };
  const renderZone = (zone: ZoneDraft, depth: number): ReactNode => {
    const config = ZONE_LEVELS[zone.kind];
    return (
      <div key={zone.id}>
        <div className="warehouse-zone-row" style={{ paddingLeft: depth * 18 }}>
          <span className={`warehouse-zone-row__icon warehouse-zone-row__icon--${zone.kind}`} aria-hidden="true" />
          <Input aria-label={`${config.label}: название`} value={zone.name} onChange={(event) => updateZone(zone.id, { name: event.target.value })} />
          <Input className="warehouse-zone-row__code" aria-label={`${config.label}: код`} value={zone.code} onChange={(event) => updateZone(zone.id, { code: event.target.value.toUpperCase() })} />
          {config.child && <button className="warehouse-zone-row__add" type="button" onClick={() => addZone(zone.id, config.child!)}>{config.add}</button>}
          <button className="warehouse-zone-row__remove" type="button" aria-label={`Удалить ${zone.name}`} onClick={() => removeZone(zone.id)}>×</button>
        </div>
        {children(zone.id).map((child) => renderZone(child, depth + 1))}
      </div>
    );
  };
  return (
    <div className="warehouse-zone-editor">
      {children(null).map((zone) => renderZone(zone, 0))}
      <button className="warehouse-zone-editor__add-room" type="button" onClick={() => addZone(null, "room")}>+ Помещение</button>
      {zones.length === 0 && <p className="warehouse-zone-editor__empty">Зон пока нет</p>}
    </div>
  );
}

function PrepStat({ tone, value, label }: { tone: Tone; value: number; label: string }) {
  return (
    <div className="row" style={{ gap: 10 }}>
      <Dot tone={tone} size={9} />
      <span style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", minWidth: 34, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      <span className="t-mono" style={{ fontSize: 12.5, color: "var(--text2)" }}>{label}</span>
    </div>
  );
}

function PrepHero({ units, onOps }: { units: Equipment.EquipmentUnitDTO[]; onOps: () => void }) {
  const inStock = units.filter((u) => u.status === "in_stock" || u.status === "reserved").length;
  const onProject = units.filter((u) => u.status === "on_project").length;
  const inRepair = units.filter((u) => u.status === "in_repair" || u.status === "at_contractor").length;
  const lost = units.filter((u) => u.status === "lost").length;
  const total = Math.max(units.length, inStock + onProject + inRepair + lost);
  const ringRadius = 53;
  const ringCircumference = 2 * Math.PI * ringRadius;
  let ringOffset = 0;
  const ringSegments = [
    { value: inStock, color: "var(--green)" },
    { value: onProject, color: "var(--orange)" },
    { value: inRepair, color: "var(--red)" },
    { value: lost, color: "var(--lost)" },
  ].map((segment) => {
    const length = total > 0 ? (segment.value / total) * ringCircumference : 0;
    const result = { ...segment, length, offset: ringOffset };
    ringOffset += length;
    return result;
  });

  return (
    <div className="card warehouse-readiness-card">
      <div className="row warehouse-readiness-card__body">
        <div
          className="warehouse-readiness-ring"
          aria-label={`${inStock} из ${total} на складе`}
        >
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r={ringRadius} fill="none" stroke="var(--fill-gray)" strokeWidth="14" />
            {ringSegments.map((segment, index) => (
              <circle
                key={`${segment.color}-${index}`}
                cx="60"
                cy="60"
                r={ringRadius}
                fill="none"
                stroke={segment.color}
                strokeWidth="14"
                strokeDasharray={`${Math.max(0, segment.length - 2)} ${ringCircumference}`}
                strokeDashoffset={-segment.offset}
              />
            ))}
          </svg>
          <div className="warehouse-readiness-ring__center">
            <strong>{inStock}</strong>
            <span>из {total}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
          <PrepStat tone="ok" value={inStock} label="на складе" />
          <PrepStat tone="warn" value={onProject} label="на проектах" />
          <PrepStat tone="alert" value={inRepair} label="в ремонте" />
          <PrepStat tone="alert" value={lost} label="утеряно" />
        </div>
      </div>

      <div className="warehouse-readiness-card__action">
        <Button block variant="primary" onClick={onOps}>+ Перемещение</Button>
      </div>
    </div>
  );
}

function ModelRow({ model, units, last, onEdit }: { model: Equipment.EquipmentModelDTO; units: Equipment.EquipmentUnitDTO[]; last?: boolean; onEdit?: () => void }) {
  const mine = units.filter((u) => u.modelId === model.id);
  const inStock = mine.filter((u) => u.status === "in_stock").length;
  const onProject = mine.filter((u) => u.status === "on_project").length;
  return (
    <div className={`lrow ${onEdit ? "card--tappable" : ""}`} style={{ borderBottom: last ? "none" : undefined }} onClick={onEdit}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {model.imageUrl&&<img className="equipment-model-thumb" src={model.imageUrl} alt=""/>}<div className="lrow__title">{model.name}</div>
        <div className="lrow__detail">{model.manufacturer ?? "—"} · {eur(model.dailyPriceEUR)}/день</div>
      </div>
      <span className="t-mono" style={{ fontSize: 12, color: "var(--text2)" }}>×{mine.length}</span>
      {onProject > 0 ? <Chip label={`${onProject} в работе`} tone="warn" /> : <Chip label={`${inStock} своб.`} tone="ok" />}
    </div>
  );
}

function TypeSettingsSheet({ type, onClose }: { type: Equipment.EquipmentTypeDTO | null; onClose: () => void }) {
  const updateType = useUpdateType();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Equipment.ReservationAssignmentMode | "">("");
  useEffect(() => {
    setName(type?.name ?? "");
    setMode(type?.reservationAssignmentMode ?? "");
  }, [type]);
  if (!type) return null;
  return <Sheet open={!!type} onClose={onClose} title="Настройки типа">
    <Field label="Название"><Input value={name} onChange={event => setName(event.target.value)} /></Field>
    <Field label="Распределение в аренду">
      <Select value={mode} onChange={event => setMode(event.target.value as Equipment.ReservationAssignmentMode | "")} options={[{ value: "", label: "Выбирать в каждой модели" }, { value: "planning", label: "Распределять заранее в Planning" }, { value: "operations", label: "Отмечать по факту в Operations" }]} />
      {mode && <p className="card__subtitle">Настройка будет унаследована всеми моделями этого типа.</p>}
    </Field>
    <Button block disabled={!name.trim() || updateType.isPending} onClick={() => updateType.mutate({ id: type.id, input: { name: name.trim(), reservationAssignmentMode: mode || null } }, { onSuccess: onClose })}>Сохранить</Button>
  </Sheet>;
}

type WarehouseTab = "dashboard" | "repair" | "stocklist" | "installed" | "cables" | "models";

const WAREHOUSE_TABS: { id: WarehouseTab; label: string; shortLabel: string; tone: "accent" | "warn" | "info" | "ok" }[] = [
  { id: "dashboard", label: "Dashboard", shortLabel: "Dash", tone: "accent" },
  { id: "repair", label: "Ремонт", shortLabel: "Ремонт", tone: "warn" },
  { id: "stocklist", label: "Stocklist", shortLabel: "Stock", tone: "ok" },
  { id: "installed", label: "Инсталляции", shortLabel: "Venue", tone: "info" },
  { id: "cables", label: "Кабели", shortLabel: "Кабели", tone: "warn" },
  { id: "models", label: "Модели", shortLabel: "Модели", tone: "info" },
];

function WarehouseGlyph({ type }: { type: WarehouseTab }) {
  const p = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (type) {
    case "dashboard":
      return <svg viewBox="0 0 24 24"><rect x="4.5" y="5" width="6" height="6" rx="1.4" {...p} /><rect x="13.5" y="5" width="6" height="6" rx="1.4" {...p} /><rect x="4.5" y="14" width="6" height="5" rx="1.4" {...p} /><rect x="13.5" y="14" width="6" height="5" rx="1.4" {...p} /></svg>;
    case "repair":
      return <svg viewBox="0 0 24 24"><path d="M14.7 5.3l4 4-3.4 3.4-4-4z" {...p} /><path d="M11.5 8.5L5 15v4h4l6.5-6.5" {...p} /><path d="M5 19l4-4" {...p} /></svg>;
    case "stocklist":
    case "installed":
      return <svg viewBox="0 0 24 24"><rect x="4.5" y="6" width="15" height="12.5" rx="2" {...p} /><path d="M4.5 10h15M8 14h4M15 14h1" {...p} /></svg>;
    case "cables":
      return <svg viewBox="0 0 24 24"><path d="M6 8c3 0 3 8 6 8s3-8 6-8" {...p} /><circle cx="5" cy="8" r="1.6" {...p} /><circle cx="19" cy="8" r="1.6" {...p} /></svg>;
    case "models":
      return <svg viewBox="0 0 24 24"><path d="M12 4.5l7 3.8-7 3.8-7-3.8z" {...p} /><path d="M5 12l7 3.8 7-3.8M5 15.7l7 3.8 7-3.8" {...p} /></svg>;
    default:
      return null;
  }
}

export function WarehousePage() {
  const { can } = useSession();
  const canCatalog = can("warehouse.catalog.manage");
  const canImport = can("warehouse.import");
  const canIssue = can("warehouse.issue");
  const canEdit = canCatalog || canImport;
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const models = useModels(showArchived);
  const units = useUnits(showArchived ? { includeArchived: true } : undefined);
  const types = useTypes();
  const warehouses = useWarehouses();
  const storageZones = useStorageZones();
  const venues = useVenues(true);
  const saveStorageZones = useSaveStorageZones();
  const createWarehouse = useCreateWarehouse();
  const updateWarehouse = useUpdateWarehouse();
  const createPlace = useCreateVenue();
  const updatePlace = useUpdateVenue();
  const projects = useProjectsForOps();
  const openRepairs = useOpenRepairs();
  const openHandovers = useOpenHandovers();
  const cableSettings = useCableSettings();
  const categories=useCategories();

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);
  const [cableModel, setCableModel] = useState<Equipment.EquipmentModelDTO | null>(null);
  const [editModel, setEditModel] = useState<Equipment.EquipmentModelDTO | null>(null);
  const [editType, setEditType] = useState<Equipment.EquipmentTypeDTO | null>(null);
  const [statusFilter, setStatusFilter] = useState<Equipment.UnitStatus | "all">("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [warehouseForm, setWarehouseForm] = useState<{ mode: "create" | "edit"; id?: string } | null>(null);
  const [warehouseNameDraft, setWarehouseNameDraft] = useState("");
  const [warehouseAddressDraft, setWarehouseAddressDraft] = useState("");
  const [warehouseZoneDrafts, setWarehouseZoneDrafts] = useState<ZoneDraft[]>([]);
  const [search, setSearch] = useState("");
  const [expandedStockModels, setExpandedStockModels] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<WarehouseTab>("dashboard");
  const [categoryFilter,setCategoryFilter]=useState("all");

  useEffect(() => {
    if (warehouseFilter === "all") return;
    if ((warehouses.data ?? []).some((w) => w.id === warehouseFilter)) return;
    setWarehouseFilter("all");
  }, [warehouseFilter, warehouses.data]);

  if (models.isLoading || units.isLoading) return <Loading />;
  if (models.error) return <ErrorState error={models.error} onRetry={models.refetch} />;

  const rawUnits = units.data ?? [];
  const warehouseList = warehouses.data ?? [];
  const rawModels = models.data ?? [];
  const allModels = showArchived
    ? rawModels.filter((model) => model.archivedAt || rawUnits.some((unit) => unit.modelId === model.id && unit.archivedAt))
    : rawModels;
  const archivedModelIds = new Set(rawModels.filter((model) => model.archivedAt).map((model) => model.id));
  const allUnits = showArchived ? rawUnits.filter((unit) => unit.archivedAt || archivedModelIds.has(unit.modelId)) : rawUnits;
  const visibleModels=categoryFilter==="all"?allModels:allModels.filter(model=>categoryFilter==="none"?!model.categoryId:model.categoryId===categoryFilter);
  const getTypeName = (tid: string | undefined) => (types.data ?? []).find((t) => t.id === tid)?.name ?? "Без типа";
  const warehouseName = (id: string | null | undefined) => warehouseList.find((w) => w.id === id)?.name ?? "—";
  const openWarehouseCreate = () => {
    setWarehouseNameDraft("");
    setWarehouseAddressDraft("");
    setWarehouseZoneDrafts([]);
    setWarehouseForm({ mode: "create" });
  };
  const openWarehouseEdit = (warehouse: Equipment.WarehouseDTO) => {
    setWarehouseNameDraft(warehouse.name);
    setWarehouseAddressDraft(warehouse.address ?? "");
    setWarehouseZoneDrafts((storageZones.data ?? []).filter((zone) => zone.warehouseId === warehouse.id && zone.active).map((zone) => ({
      id: zone.id,
      parentId: zone.parentId,
      name: zone.name,
      code: zone.code,
      kind: zone.kind,
    })));
    setWarehouseForm({ mode: "edit", id: warehouse.id });
  };
  const closeWarehouseForm = () => {
    setWarehouseForm(null);
    setWarehouseNameDraft("");
    setWarehouseAddressDraft("");
    setWarehouseZoneDrafts([]);
  };
  const saveWarehouse = async () => {
    const name = warehouseNameDraft.trim();
    if (!name) return;
    const address = warehouseAddressDraft.trim() || null;
    if (warehouseForm?.mode === "edit" && warehouseForm.id) {
      const existing = warehouseList.find((warehouse) => warehouse.id === warehouseForm.id);
      let placeId = existing?.placeId ?? null;
      if (placeId) await updatePlace.mutateAsync({ id: placeId, input: { name, address, isWarehouse: true } });
      else placeId = (await createPlace.mutateAsync({ name, address, isVenue: false, isWarehouse: true })).id;
      await updateWarehouse.mutateAsync({ id: warehouseForm.id, input: { name, address, placeId } });
      await saveStorageZones.mutateAsync({ warehouseId: warehouseForm.id, zones: warehouseZoneDrafts });
      closeWarehouseForm();
      return;
    }
    const place = await createPlace.mutateAsync({ name, address, isVenue: false, isWarehouse: true });
    const warehouse = await createWarehouse.mutateAsync({ name, address, placeId: place.id });
    await saveStorageZones.mutateAsync({ warehouseId: warehouse.id, zones: warehouseZoneDrafts });
    setWarehouseFilter(warehouse.id);
    closeWarehouseForm();
  };
  const query = search.trim().toLowerCase();
  const modelMatches = (m: Equipment.EquipmentModelDTO) =>
    !query || [m.name, m.manufacturer ?? "", getTypeName(m.typeId), m.trackingMode === "cable" ? formatCableModel(m, cableSettings.data?.nameFormat) : ""].some((v) => v.toLowerCase().includes(query));
  const unitMatches = (u: Equipment.EquipmentUnitDTO) => {
    const m = allModels.find((x) => x.id === u.modelId);
    return !query || [u.assetTag, u.serial ?? "", m?.name ?? "", m?.manufacturer ?? "", getTypeName(m?.typeId)].some((v) => v.toLowerCase().includes(query));
  };
  const serialModels = visibleModels.filter((m) => m.trackingMode === "serial" && modelMatches(m));
  const quantityModels = visibleModels.filter((m) => m.trackingMode === "quantity" && modelMatches(m));
  const cableModels = visibleModels.filter((m) => m.trackingMode === "cable" && modelMatches(m));
  const warehouseStockUnits = allUnits.filter(unit => unit.status !== "installed");
  const filteredByWarehouse = warehouseFilter === "all" ? warehouseStockUnits : warehouseStockUnits.filter((u) => u.warehouseId === warehouseFilter);
  const filteredByStatus = statusFilter === "all" ? filteredByWarehouse : filteredByWarehouse.filter((u) => u.status === statusFilter);
  const filtered = filteredByStatus.filter(unit=>visibleModels.some(model=>model.id===unit.modelId)).filter(unitMatches);
  const dashboardSearchResults = query
    ? allUnits.filter((unit) => visibleModels.some((model) => model.id === unit.modelId)).filter(unitMatches)
    : [];
  const statuses: (Equipment.UnitStatus | "all")[] = ["all", "in_stock", "on_project", "in_repair", "reserved", "lost"];

  const repairTone = (s: Equipment.UnitStatus) => (s === "in_repair" ? "alert" : "warn");
  const tag = (uid: string) => allUnits.find((x) => x.id === uid)?.assetTag ?? uid.slice(0, 6);
  const toggleStockModel = (modelId: string) =>
    setExpandedStockModels((prev) => {
      const next = new Set(prev);
      next.has(modelId) ? next.delete(modelId) : next.add(modelId);
      return next;
    });
  const repairCount = (openRepairs.data ?? []).length + (openHandovers.data ?? []).length;
  const repairEstimateEUR = (openRepairs.data ?? []).reduce((sum, repair) => sum + (repair.estCostEUR ?? repair.costEUR ?? 0), 0)
    + (openHandovers.data ?? []).reduce((sum, handover) => sum + (handover.costEUR ?? 0), 0);
  const searchField = (
    <div className="warehouse-dashboard-search">
      <Field label="Поиск по складу">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Модель, номер, серийник, код зоны" />
      </Field>
    </div>
  );
  const stockSearchField = <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Модель или тип" />;
  const warehouseSelector = (
    <>
      <div className="row row--between warehouse-section-head">
        <SectionHead label="Склады" meta={`${warehouseList.length}`} />
        {canCatalog && <button className="text-action" type="button" onClick={openWarehouseCreate}>+ Склад</button>}
      </div>
      <div className="warehouse-filter-row" aria-label="Выбор склада">
        <button className={`warehouse-choice ${warehouseFilter === "all" ? "is-active" : ""}`} onClick={() => setWarehouseFilter("all")}>Все склады</button>
        {warehouseList.map((warehouse) => (
          <button key={warehouse.id} className={`warehouse-choice ${warehouseFilter === warehouse.id ? "is-active" : ""}`} onClick={() => setWarehouseFilter(warehouse.id)} title={warehouse.address ?? undefined}>{warehouse.name}</button>
        ))}
      </div>
      <div className="stack warehouse-location-list">
        {warehouseList.filter((warehouse) => warehouseFilter === "all" || warehouse.id === warehouseFilter).map((warehouse) => {
          const unitCount = allUnits.filter((unit) => unit.warehouseId === warehouse.id && unit.status !== "installed").length;
          return (
            <div className="card warehouse-location-card" key={warehouse.id}>
              <div className="row row--between warehouse-location-card__heading">
                <div style={{ minWidth: 0 }}>
                  <p className="card__title">{warehouse.name}</p>
                  <p className="card__subtitle">{warehouse.address || "Адрес не указан"}</p>
                </div>
                {warehouse.isDefault && <Chip label="основной" tone="info" />}
              </div>
              <div className="row warehouse-location-card__counts">
                <Chip label={`${unitCount} ед.`} tone="ok" />
              </div>
              {canCatalog && (
                <div className="warehouse-location-card__actions">
                  <Button block variant="secondary" disabled={storageZones.isLoading} onClick={() => openWarehouseEdit(warehouse)}>Редактировать</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
  const warehouseFilterRow = (
    <div className="warehouse-filter-row" aria-label="Выбор склада">
      <button className={`warehouse-choice ${warehouseFilter === "all" ? "is-active" : ""}`} onClick={() => setWarehouseFilter("all")}>Все склады</button>
      {warehouseList.map((warehouse) => (
        <button key={warehouse.id} className={`warehouse-choice ${warehouseFilter === warehouse.id ? "is-active" : ""}`} onClick={() => setWarehouseFilter(warehouse.id)}>{warehouse.name}</button>
      ))}
    </div>
  );
  const categorySelector = (
    <div className="warehouse-filter-row" aria-label="Категории склада">
      <button className={`warehouse-choice ${!showArchived && categoryFilter === "all" ? "is-active" : ""}`} onClick={() => { setShowArchived(false); setCategoryFilter("all"); }}>Все</button>
      {!showArchived && (categories.data ?? []).map((category) => (
        <button key={category.id} className={`warehouse-choice ${categoryFilter === category.id ? "is-active" : ""}`} onClick={() => setCategoryFilter(category.id)}>{category.name}</button>
      ))}
      {!showArchived && <button className={`warehouse-choice ${categoryFilter === "none" ? "is-active" : ""}`} onClick={() => setCategoryFilter("none")}>Без категории</button>}
      <button className={`warehouse-choice ${showArchived ? "is-active" : ""}`} onClick={() => { setShowArchived(true); setCategoryFilter("all"); }}>Архив</button>
    </div>
  );
  const repairSection = (
    <>
      <div className="warehouse-repair-stats">
        <div className="card"><span>в ремонте</span><strong>{openRepairs.data?.length ?? 0}</strong></div>
        <div className="card"><span>на сервисе</span><strong>{openHandovers.data?.length ?? 0}</strong></div>
        <div className="card"><span>оценка</span><strong>{eur(repairEstimateEUR)}</strong></div>
      </div>
      <SectionHead label="Ремонты и сервисные выдачи" meta={`${repairCount}`} />
      {repairCount === 0 ? (
        <EmptyState title="Нет открытых ремонтов" />
      ) : (
        <div className="card" style={{ padding: "2px 16px" }}>
          {(openRepairs.data ?? []).map((r) => (
            <div key={r.id} className="lrow card--tappable" onClick={() => navigate(`/warehouse/units/${r.unitId}`)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="lrow__title">{tag(r.unitId)} · {r.problem}</div>
                <div className="lrow__detail">в ремонте{r.vendor ? ` · ${r.vendor}` : ""}</div>
              </div>
              <Chip label="ремонт" tone={repairTone("in_repair")} />
            </div>
          ))}
          {(openHandovers.data ?? []).map((h) => (
            <div key={h.id} className="lrow card--tappable" onClick={() => navigate(`/warehouse/units/${h.unitId}`)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="lrow__title">{tag(h.unitId)} · {h.contractorName}</div>
                <div className="lrow__detail">на внешнем сервисе{h.reason ? ` · ${h.reason}` : ""}</div>
              </div>
              <Chip label="сервис" tone="warn" />
            </div>
          ))}
        </div>
      )}
    </>
  );
  const modelSection = (
    <>
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Начните вводить модель" />
      {canEdit && (
        <div className="row" style={{ marginBottom: 10 }}>
          {canCatalog && <Button block variant="secondary" onClick={() => setAddOpen(true)}>+ Модель / единица</Button>}
          {canImport && <Button block variant="secondary" onClick={() => setImportOpen(true)}>Импорт CSV</Button>}
        </div>
      )}
      {canCatalog && (types.data ?? []).length > 0 && <>
        <SectionHead label="Типы" meta={`${types.data?.length ?? 0}`} />
        <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {(types.data ?? []).map(type => <Button key={type.id} variant="ghost" onClick={() => setEditType(type)}>{type.name} · {type.reservationAssignmentMode === "operations" ? "Operations" : type.reservationAssignmentMode === "planning" ? "Planning" : "по модели"}</Button>)}
        </div>
      </>}
      {allModels.length === 0 ? (
        <EmptyState title="Каталог пуст" hint={canEdit ? "Добавьте модели или импортируйте CSV" : undefined} />
      ) : (
        <>
          {serialModels.length > 0 && (
            <div className="card" style={{ padding: "2px 16px" }}>
              {serialModels.map((m, i) => (
                <ModelRow key={m.id} model={m} units={allUnits} last={i === serialModels.length - 1} onEdit={canCatalog ? () => setEditModel(m) : undefined} />
              ))}
            </div>
          )}
          {quantityModels.length > 0 && (
            <>
              <SectionHead label="Количество" meta={`${quantityModels.length}`} />
              <div className="card" style={{ padding: "2px 16px" }}>
                {quantityModels.map((m, i) => (
                  <CableRow
                    key={m.id}
                    model={m}
                    warehouseId={warehouseFilter === "all" ? null : warehouseFilter}
                    onMove={() => setCableModel(m)}
                    onEdit={canCatalog ? () => setEditModel(m) : undefined}
                    last={i === quantityModels.length - 1}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
  const cableSection = (
    <>
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Разъём, длина, тип" />
      <SectionHead label="Кабели" meta={`${cableModels.length}`} />
      {cableModels.length === 0 ? (
        <EmptyState title="Нет кабелей" />
      ) : (
        <div className="card" style={{ padding: "2px 16px" }}>
          {cableModels.map((m, i) => (
            <CableRow
              key={m.id}
              model={m}
              warehouseId={warehouseFilter === "all" ? null : warehouseFilter}
              onMove={() => setCableModel(m)}
              onEdit={canCatalog ? () => setEditModel(m) : undefined}
              last={i === cableModels.length - 1}
            />
          ))}
        </div>
      )}
      {canCatalog && <Button block variant="secondary" onClick={() => setAddOpen(true)}>+ Кабель</Button>}
    </>
  );
  const unitSection = (
    <>
      <SectionHead label="Единицы" meta={`${filtered.length}`} />
      <div className="row warehouse-status-filter" style={{ flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {statuses.map((s) => (
          <button
            key={s}
            className={`warehouse-choice ${statusFilter === s ? "is-active" : ""}`}
            onClick={() => setStatusFilter(s)}
          >
            {s === "all" ? "Все" : unitStatusLabel[s]}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="Нет единиц" />
      ) : (
        (() => {
          const modelOf = (mid: string) => allModels.find((m) => m.id === mid);
          const groups = new Map<string, Equipment.EquipmentUnitDTO[]>();
          for (const u of filtered) {
            const tid = modelOf(u.modelId)?.typeId ?? "—";
            (groups.get(tid) ?? groups.set(tid, []).get(tid)!).push(u);
          }
          const ordered = [...groups.entries()].sort((a, b) => getTypeName(a[0]).localeCompare(getTypeName(b[0])));
          return ordered.map(([tid, list]) => {
            const modelGroups = new Map<string, Equipment.EquipmentUnitDTO[]>();
            for (const unit of list) (modelGroups.get(unit.modelId) ?? modelGroups.set(unit.modelId, []).get(unit.modelId)!).push(unit);
            return (
              <div key={tid}>
                <div className="row row--between" style={{ alignItems: "center" }}>
                  <SectionHead label={getTypeName(tid)} meta={`${modelGroups.size}`} />
                  {canCatalog && (
                    <button className="icon-btn" aria-label="Редактировать тип" title="Редактировать тип" onClick={() => setEditType((types.data ?? []).find(type => type.id === tid) ?? null)}>
                      ✎
                    </button>
                  )}
                </div>
                <div className="card stock-model-list">
                  {[...modelGroups.entries()].map(([modelId, modelUnits], modelIndex) => {
                    const model = modelOf(modelId);
                    const inStock = modelUnits.filter(unit => unit.status === "in_stock").length;
                    const reserved = modelUnits.filter(unit => unit.status === "reserved").length;
                    const onProject = modelUnits.filter(unit => unit.status === "on_project").length;
                    const inRepair = modelUnits.filter(unit => unit.status === "in_repair").length;
                    const isExpanded = expandedStockModels.has(modelId);
                    return (
                      <div key={modelId} className={modelIndex === modelGroups.size - 1 ? "" : "stock-model-group"}>
                        <button className="stock-model-row" onClick={() => toggleStockModel(modelId)} aria-expanded={isExpanded}>
                          <span className="stock-model-row__icon">◇</span>
                          <span className="stock-model-row__body">
                            <span className="stock-model-row__title">{model?.name ?? modelId}</span>
                            <span className="stock-model-row__detail">{inStock} на складе · {reserved} резерв · {onProject} на проекте</span>
                          </span>
                          {inRepair > 0 ? <Chip label={`ремонт ${inRepair}`} tone="alert" /> : <span className="stock-model-row__count">{modelUnits.length}</span>}
                        </button>
                        {isExpanded && (
                          <div className="stock-unit-list">
                            {modelUnits.map((unit) => {
                              const tone: Tone = unit.status === "in_stock" ? "ok" : unit.status === "on_project" ? "warn" : unit.status === "lost" || unit.status === "in_repair" ? "alert" : "info";
                              return (
                                <button key={unit.id} className="stock-unit-row" onClick={() => navigate(`/warehouse/units/${unit.id}`)}>
                                  <span><strong>{unit.assetTag}</strong><small>{warehouseName(unit.warehouseId)}</small></span>
                                  <Chip label={unitStatusLabel[unit.status]} tone={tone} />
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          });
        })()
      )}
    </>
  );

  const warehouseTabs = (
    <div className="warehouse-tabs" role="tablist" aria-label="Warehouse">
      {WAREHOUSE_TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const count = tab.id === "repair" ? repairCount : tab.id === "stocklist" ? filtered.length : tab.id === "installed" ? allUnits.filter(u => u.status === "installed").length : tab.id === "cables" ? cableModels.length : tab.id === "models" ? serialModels.length + quantityModels.length : 0;
        return (
          <button key={tab.id} className={`warehouse-tabs__item ${isActive ? "warehouse-tabs__item--active" : ""}`} onClick={() => setActiveTab(tab.id)} aria-label={tab.label} aria-selected={isActive} role="tab" type="button">
            <span className="warehouse-tabs__icon"><WarehouseGlyph type={tab.id} /></span>
            <span>{tab.shortLabel}</span>
            {count > 0 && <span className="warehouse-tabs__badge">{count > 9 ? "9+" : count}</span>}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="stack warehouse-mobile-page">
      {warehouseTabs}
      {activeTab === "dashboard" && categorySelector}
      {activeTab === "dashboard" && (
        <>
          <PrepHero units={allUnits.filter((unit) => visibleModels.some((model) => model.id === unit.modelId))} onOps={canIssue ? () => setOpsOpen(true) : () => navigate("/operations")} />
          {searchField}
          {query && (
            <div className="card warehouse-search-results">
              {dashboardSearchResults.length > 0 ? dashboardSearchResults.map((unit, index) => {
                const tone: Tone = unit.status === "in_stock" ? "ok" : unit.status === "on_project" ? "warn" : unit.status === "lost" || unit.status === "in_repair" ? "alert" : "info";
                return (
                  <button key={unit.id} className="warehouse-search-result" onClick={() => navigate(`/warehouse/units/${unit.id}`)} style={{ borderBottom: index < dashboardSearchResults.length - 1 ? undefined : "none" }}>
                    <span><strong>{unit.assetTag}</strong><small>{allModels.find((model) => model.id === unit.modelId)?.name ?? unit.modelId}{unit.serial ? ` · ${unit.serial}` : ""}</small></span>
                    <Chip label={unitStatusLabel[unit.status]} tone={tone} />
                  </button>
                );
              }) : <EmptyState title="Ничего не найдено" />}
            </div>
          )}
          {warehouseSelector}
        </>
      )}
      {activeTab === "repair" && repairSection}
      {activeTab === "stocklist" && (
        <>
          {stockSearchField}
          {warehouseFilterRow}
          {unitSection}
        </>
      )}
      {activeTab === "installed" && <><SectionHead label="Инсталлировано на площадках" meta={`${allUnits.filter(u => u.status === "installed").length}`} />{allUnits.filter(u => u.status === "installed").length === 0 ? <EmptyState title="Инсталлированного оборудования нет" /> : <div className="stack">{(venues.data ?? []).filter(v => allUnits.some(u => u.installedVenueId === v.id)).map(v => <div className="card" key={v.id}><div className="row row--between"><div><p className="card__title">{v.name}</p><p className="card__subtitle">{v.address || "Без адреса"}</p></div><Chip label={`${allUnits.filter(u => u.installedVenueId === v.id).length}`} tone="info" /></div>{allUnits.filter(u => u.installedVenueId === v.id).map(u => <button className="lrow card--tappable" key={u.id} onClick={() => navigate(`/warehouse/units/${u.id}`)}><span className="lrow__title">{u.assetTag}</span><span className="lrow__detail">{allModels.find(model => model.id === u.modelId)?.name ?? u.modelId}</span></button>)}</div>)}</div>}</>}
      {activeTab === "cables" && cableSection}
      {activeTab === "models" && modelSection}

      {canEdit && (
        <>
          <AddModelSheet open={addOpen} onClose={() => setAddOpen(false)} types={types.data ?? []} models={allModels} />
          <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} />
        </>
      )}
      {canIssue && (
        <OpsSheet open={opsOpen} onClose={() => setOpsOpen(false)} models={allModels} />
      )}
      {canCatalog && <EditModelSheet model={editModel} types={types.data??[]} categories={categories.data??[]} onClose={() => setEditModel(null)} />}
      {canCatalog && <TypeSettingsSheet type={editType} onClose={() => setEditType(null)} />}
      {canCatalog && (
        <Sheet
          open={!!warehouseForm}
          onClose={closeWarehouseForm}
          title={warehouseForm?.mode === "create" ? "Новый склад" : `Склад · ${warehouseNameDraft || "Без названия"}`}
        >
          <Field label="Название">
            <Input value={warehouseNameDraft} onChange={(e) => setWarehouseNameDraft(e.target.value)} placeholder="Main warehouse" />
          </Field>
          <Field label="Адрес">
            <AddressInput value={warehouseAddressDraft} onChange={setWarehouseAddressDraft} placeholder="Адрес — можно вставить или найти" />
          </Field>
          <Field label="Зоны хранения · помещение → стеллаж → полка">
            <div className="card warehouse-zone-editor-card">
              <ZoneEditor zones={warehouseZoneDrafts} onChange={setWarehouseZoneDrafts} />
            </div>
            <p className="warehouse-zone-editor__hint">Код зоны печатается на этикетке и ищется в поиске склада.</p>
          </Field>
          {warehouseForm?.mode === "edit" && warehouseForm.id && !warehouseList.find((warehouse) => warehouse.id === warehouseForm.id)?.isDefault && (
            <Button variant="ghost" block onClick={() => updateWarehouse.mutate({ id: warehouseForm.id!, input: { isDefault: true } })}>Сделать основным</Button>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <Button
              block
              disabled={!warehouseNameDraft.trim() || warehouseZoneDrafts.some((zone) => !zone.name.trim() || !zone.code.trim()) || createWarehouse.isPending || updateWarehouse.isPending || saveStorageZones.isPending}
              onClick={() => void saveWarehouse()}
            >
              Сохранить
            </Button>
            <Button variant="secondary" block onClick={closeWarehouseForm}>Отмена</Button>
          </div>
        </Sheet>
      )}
      <CableMoveSheet model={cableModel} warehouses={warehouseList} selectedWarehouseId={warehouseFilter === "all" ? null : warehouseFilter} onClose={() => setCableModel(null)} />
    </div>
  );
}
