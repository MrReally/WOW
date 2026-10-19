import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
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
  useCreateType,
  useUpdateType,
  useCableSettings,
  useCableConnectors,
  useCreateCableConnector,
  useCategories,
} from "./hooks.ts";
import { cableAttrs, formatCableModel } from "./cables.ts";
import { AddModelSheet } from "./components/AddModelSheet.tsx";
import { EditModelSheet } from "./components/EditModelSheet.tsx";
import { ImportSheet } from "./components/ImportSheet.tsx";
import { CableMoveSheet, CableRow } from "./components/CableMoveSheet.tsx";
import { CableCreateSheet } from "./components/CableCreateSheet.tsx";
import { OpsSheet } from "./components/OpsSheet.tsx";
import { InventoryWindow } from "./components/InventoryWindow.tsx";
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

function ModelRow({ model, last, onEdit }: { model: Equipment.EquipmentModelDTO; last?: boolean; onEdit?: () => void }) {
  const symbol = (model.attrs as Equipment.ModelAttrs | null)?.stageSymbol;
  const symbolClass = symbol?.shape ? ` warehouse-model-symbol--${symbol.shape}` : "";
  return (
    <button type="button" className="warehouse-model-row" data-last={last || undefined} onClick={onEdit} disabled={!onEdit}>
      <span className={`warehouse-model-symbol${symbolClass}`} style={symbol?.color ? { "--model-symbol-color": symbol.color } as CSSProperties : undefined}>
        {model.imageUrl ? <img src={model.imageUrl} alt="" /> : <span>{symbol?.code || model.name.slice(0, 2).toUpperCase()}</span>}
      </span>
      <span className="warehouse-model-row__copy">
        <strong>{model.name}</strong>
        <small>{model.manufacturer || "—"} · {eur(model.dailyPriceEUR)}/сутки</small>
      </span>
      <span className="warehouse-model-row__chevron" aria-hidden="true" />
    </button>
  );
}

function TypeSettingsSheet({ open, type, onClose }: { open: boolean; type: Equipment.EquipmentTypeDTO | null; onClose: () => void }) {
  const createType = useCreateType();
  const updateType = useUpdateType();
  const [name, setName] = useState("");
  const [trackingMode, setTrackingMode] = useState<Equipment.TrackingMode>("serial");
  const [mode, setMode] = useState<Equipment.ReservationAssignmentMode | "">("");
  useEffect(() => {
    setName(type?.name ?? "");
    setTrackingMode(type?.trackingMode ?? "serial");
    setMode(type?.reservationAssignmentMode ?? "");
  }, [open, type]);
  const save = () => {
    if (type) {
      updateType.mutate({ id: type.id, input: { name: name.trim(), reservationAssignmentMode: mode || null } }, { onSuccess: onClose });
      return;
    }
    createType.mutate({ name: name.trim(), trackingMode, reservationAssignmentMode: mode || null }, { onSuccess: onClose });
  };
  const isPending = createType.isPending || updateType.isPending;
  return <Sheet open={open} onClose={onClose} title={type ? "Настройки типа" : "Создать тип"}>
    <Field label="Название"><Input value={name} onChange={event => setName(event.target.value)} /></Field>
    {!type && <Field label="Учёт"><Select value={trackingMode} onChange={event => setTrackingMode(event.target.value as Equipment.TrackingMode)} options={[{ value: "serial", label: "По серийным единицам" }, { value: "quantity", label: "Количество" }]} /></Field>}
    <Field label="Распределение в аренду">
      <Select value={mode} onChange={event => setMode(event.target.value as Equipment.ReservationAssignmentMode | "")} options={[{ value: "", label: "Выбирать в каждой модели" }, { value: "planning", label: "Распределять заранее в Planning" }, { value: "operations", label: "Отмечать по факту в Operations" }]} />
      {mode && <p className="card__subtitle">Настройка будет унаследована всеми моделями этого типа.</p>}
    </Field>
    <Button block disabled={!name.trim() || isPending} onClick={save}>{type ? "Сохранить" : "Создать тип"}</Button>
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
  const cableConnectors = useCableConnectors();
  const createCableConnector = useCreateCableConnector();
  const categories=useCategories();

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);
  const [cableModel, setCableModel] = useState<Equipment.EquipmentModelDTO | null>(null);
  const [cableCreateOpen, setCableCreateOpen] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState<Equipment.CableConnectorDTO | null>(null);
  const [newConnectorName, setNewConnectorName] = useState("");
  const [editModel, setEditModel] = useState<Equipment.EquipmentModelDTO | null>(null);
  const [editType, setEditType] = useState<Equipment.EquipmentTypeDTO | null>(null);
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
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
  const activeStorageZones = (storageZones.data ?? []).filter((zone) => zone.active);
  const storageZoneById = new Map(activeStorageZones.map((zone) => [zone.id, zone]));
  const modelMatches = (m: Equipment.EquipmentModelDTO) =>
    !query || [m.name, m.manufacturer ?? "", getTypeName(m.typeId), m.trackingMode === "cable" ? formatCableModel(m, cableSettings.data?.nameFormat) : ""].some((v) => v.toLowerCase().includes(query));
  const stockModelMatches = (m: Equipment.EquipmentModelDTO) =>
    !query || m.name.toLowerCase().includes(query);
  const unitMatches = (u: Equipment.EquipmentUnitDTO) => {
    const m = allModels.find((x) => x.id === u.modelId);
    return !query || [u.assetTag, u.serial ?? "", storageZoneById.get(u.zoneId ?? "")?.code ?? "", m?.name ?? "", m?.manufacturer ?? "", getTypeName(m?.typeId)].some((v) => v.toLowerCase().includes(query));
  };
  const serialModels = visibleModels.filter((m) => m.trackingMode === "serial" && modelMatches(m));
  const quantityModels = visibleModels.filter((m) => m.trackingMode === "quantity" && modelMatches(m));
  const cableModels = visibleModels.filter((m) => m.trackingMode === "cable" && modelMatches(m));
  const warehouseStockUnits = allUnits.filter(unit => unit.status !== "installed");
  const filteredByWarehouse = warehouseFilter === "all" ? warehouseStockUnits : warehouseStockUnits.filter((u) => u.warehouseId === warehouseFilter);
  const visibleModelIds = new Set(visibleModels.map((model) => model.id));
  const filtered = filteredByWarehouse.filter((unit) => {
    const model = allModels.find((candidate) => candidate.id === unit.modelId);
    return visibleModelIds.has(unit.modelId) && !!model && stockModelMatches(model);
  });
  const dashboardSearchResults = query
    ? allUnits.filter((unit) => visibleModels.some((model) => model.id === unit.modelId)).filter(unitMatches)
    : [];

  const repairTone = (s: Equipment.UnitStatus) => (s === "in_repair" ? "alert" : "warn");
  const tag = (uid: string) => allUnits.find((x) => x.id === uid)?.assetTag ?? uid.slice(0, 6);
  const toggleStockModel = (modelId: string) =>
    setExpandedStockModels((prev) => {
      const next = new Set(prev);
      next.has(modelId) ? next.delete(modelId) : next.add(modelId);
      return next;
    });
  const toggleType = (typeId: string) =>
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      next.has(typeId) ? next.delete(typeId) : next.add(typeId);
      return next;
    });
  const repairCount = (openRepairs.data ?? []).length + (openHandovers.data ?? []).length;
  const repairEstimateEUR = (openRepairs.data ?? []).reduce((sum, repair) => sum + (repair.estCostEUR ?? repair.costEUR ?? 0), 0)
    + (openHandovers.data ?? []).reduce((sum, handover) => sum + (handover.costEUR ?? 0), 0);
  const searchField = (
    <div className="warehouse-dashboard-search">
      <Field label="Поиск по складу">
        <span className="warehouse-search-field">
          <span className="warehouse-search-field__icon" aria-hidden="true" />
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Модель, номер, серийник, код зоны" />
        </span>
      </Field>
    </div>
  );
  const stockSearchField = (
    <span className="warehouse-search-field warehouse-stock-search">
      <span className="warehouse-search-field__icon" aria-hidden="true" />
      <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Модель или тип" />
    </span>
  );
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
          const warehouseZones = (storageZones.data ?? []).filter((zone) => zone.warehouseId === warehouse.id && zone.active);
          const roomCount = warehouseZones.filter((zone) => zone.kind === "room").length;
          const rackCount = warehouseZones.filter((zone) => zone.kind === "rack").length;
          const shelfCount = warehouseZones.filter((zone) => zone.kind === "shelf").length;
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
                <Chip label={`${roomCount} помещ.`} tone="neutral" />
                <Chip label={`${rackCount} стеллажей`} tone="neutral" />
                <Chip label={`${shelfCount} полок`} tone="neutral" />
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
      <button className={`warehouse-choice ${warehouseFilter === "all" ? "is-active" : ""}`} onClick={() => setWarehouseFilter("all")}>ВСЕ</button>
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
    <div className="warehouse-models-section">
      <span className="warehouse-search-field warehouse-stock-search">
        <span className="warehouse-search-field__icon" aria-hidden="true" />
        <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Начните вводить модель" />
      </span>
      {canEdit && (
        <div className="warehouse-model-actions">
          {canCatalog && <Button block onClick={() => setAddOpen(true)}>+ Модель</Button>}
          {canCatalog && <Button block variant="secondary" onClick={() => { setEditType(null); setTypeSheetOpen(true); }}>+ Тип</Button>}
          {canImport && <Button block variant="ghost" onClick={() => setImportOpen(true)}>Импорт CSV</Button>}
        </div>
      )}
      {canCatalog && (types.data ?? []).length > 0 && <>
        <SectionHead label="Типы" meta={`${types.data?.length ?? 0}`} />
        <div className="card warehouse-type-list">
          {(types.data ?? []).map((type, index) => {
            const typeModels = allModels.filter(model => model.typeId === type.id);
            const expanded = expandedTypes.has(type.id);
            const modelsId = `warehouse-type-${type.id}-models`;
            const accounting = type.trackingMode === "serial" ? "По серийным единицам" : type.trackingMode === "cable" ? "Кабель" : "Количество";
            const allocation = type.reservationAssignmentMode === "operations" ? "по факту в Operations" : type.reservationAssignmentMode === "planning" ? "распределять заранее" : "выбирать в каждой модели";
            return <div key={type.id} className="warehouse-type-group" data-last={index === (types.data?.length ?? 0) - 1 || undefined}>
              <div className="warehouse-type-row">
                <button
                  type="button"
                  className="warehouse-type-row__toggle"
                  aria-expanded={expanded}
                  aria-controls={modelsId}
                  onClick={() => toggleType(type.id)}
                >
                  <span className="warehouse-type-row__copy"><strong>{type.name}</strong><small>{accounting} · {allocation}</small></span>
                  <span className="warehouse-type-row__count">{typeModels.length}</span>
                </button>
                <button
                  type="button"
                  className="warehouse-type-row__settings"
                  aria-label={`Настройки типа «${type.name}»`}
                  onClick={() => { setEditType(type); setTypeSheetOpen(true); }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9.8 3.4h4.4l.7 2.1c.5.2 1 .5 1.5.9l2.2-.5 2.2 3.8-1.5 1.6a8 8 0 010 1.8l1.5 1.6-2.2 3.8-2.2-.5c-.5.4-1 .7-1.5.9l-.7 2.1H9.8l-.7-2.1a8 8 0 01-1.5-.9l-2.2.5-2.2-3.8 1.5-1.6a8 8 0 010-1.8L3.2 9.7l2.2-3.8 2.2.5c.5-.4 1-.7 1.5-.9l.7-2.1z" />
                    <circle cx="12" cy="12.2" r="2.7" />
                  </svg>
                </button>
              </div>
              {expanded && <div id={modelsId} className="warehouse-type-models" role="region" aria-label={`Модели типа «${type.name}»`}>
                {typeModels.length > 0
                  ? typeModels.map((model, modelIndex) => <ModelRow key={model.id} model={model} last={modelIndex === typeModels.length - 1} onEdit={() => setEditModel(model)} />)
                  : <p className="warehouse-type-models__empty">У этого типа пока нет моделей</p>}
              </div>}
            </div>;
          })}
        </div>
      </>}
      <SectionHead label="Модели" meta={`${visibleModels.filter(model => model.trackingMode !== "cable").length}`} />
      {serialModels.length + quantityModels.length === 0 ? (
        <EmptyState title={query ? "Модели не найдены" : "Каталог пуст"} hint={!query && canEdit ? "Добавьте модели или импортируйте CSV" : undefined} />
      ) : (
        <div className="card warehouse-model-list">
          {[...serialModels, ...quantityModels].map((model, index, list) => <ModelRow key={model.id} model={model} last={index === list.length - 1} onEdit={canCatalog ? () => setEditModel(model) : undefined} />)}
        </div>
      )}
    </div>
  );
  const cableSection = (
    <>
      <SectionHead label="Справочник разъёмов" meta={`${cableConnectors.data?.length ?? 0}`} />
      <div className="cable-connectors" aria-label="Справочник разъёмов">
        {(cableConnectors.data ?? []).map((connector) => (
          <button key={connector.id} type="button" className="cable-connector-card" onClick={() => setSelectedConnector(connector)}>
            <span className="cable-connector-card__visual">
              {connector.imageDataUrl ? <img src={connector.imageDataUrl} alt="" /> : <WarehouseGlyph type="cables" />}
            </span>
            <span>{connector.name}</span>
          </button>
        ))}
      </div>
      {canCatalog && (
        <div className="cable-connector-create">
          <Input value={newConnectorName} onChange={(event) => setNewConnectorName(event.target.value)} placeholder="Новый разъём" />
          <Button variant="secondary" disabled={!newConnectorName.trim() || createCableConnector.isPending} onClick={() => createCableConnector.mutate({ name: newConnectorName.trim(), designation: newConnectorName.trim().slice(0, 24) }, { onSuccess: () => setNewConnectorName("") })}>Добавить</Button>
        </div>
      )}
      <SectionHead label="Кабели" />
      <span className="warehouse-search-field warehouse-stock-search">
        <span className="warehouse-search-field__icon" aria-hidden="true" />
        <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Разъём, длина, тип" />
      </span>
      {cableModels.length === 0 ? (
        <EmptyState title="Нет кабелей" />
      ) : (
        (() => {
          const groups = new Map<string, Equipment.EquipmentModelDTO[]>();
          for (const model of cableModels) {
            const group = cableAttrs(model)?.cableType || "Кабели";
            (groups.get(group) ?? groups.set(group, []).get(group)!).push(model);
          }
          return [...groups.entries()].map(([group, groupModels]) => (
            <div key={group} className="cable-type-group">
              <SectionHead label={group} meta={`${groupModels.length}`} />
              <div className="card cable-model-list">
                {groupModels.map((model, index) => (
                  <CableRow
                    key={model.id}
                    model={model}
                    warehouseId={warehouseFilter === "all" ? null : warehouseFilter}
                    onMove={() => setCableModel(model)}
                    showStepper
                    last={index === groupModels.length - 1}
                  />
                ))}
              </div>
            </div>
          ));
        })()
      )}
      {canCatalog && <Button block variant="secondary" onClick={() => setCableCreateOpen(true)}>+ Кабель</Button>}
    </>
  );
  const unitSection = (
    <>
      {filtered.length === 0 ? (
        <EmptyState title="Нет моделей" />
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
              <div key={tid} className="stock-type-group">
                <SectionHead label={getTypeName(tid)} meta={`${modelGroups.size}`} />
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
                          {model?.imageUrl
                            ? <img className="stock-model-row__image" src={model.imageUrl} alt="" />
                            : <span className="stock-model-row__icon" aria-hidden="true">◇</span>}
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
      <InventoryWindow warehouses={warehouseList} models={allModels} />
      {activeTab === "dashboard" && categorySelector}
      {activeTab === "dashboard" && (
        <>
          <PrepHero units={allUnits.filter((unit) => visibleModels.some((model) => model.id === unit.modelId))} onOps={canIssue ? () => setOpsOpen(true) : () => navigate("/operations")} />
          {searchField}
          {query && (
            <div className="card warehouse-search-results">
              {dashboardSearchResults.length > 0 ? dashboardSearchResults.map((unit, index) => {
                const tone: Tone = unit.status === "in_stock" ? "ok" : unit.status === "on_project" ? "warn" : unit.status === "lost" || unit.status === "in_repair" ? "alert" : "info";
                const zoneCode = storageZoneById.get(unit.zoneId ?? "")?.code;
                return (
                  <button key={unit.id} className="warehouse-search-result" onClick={() => navigate(`/warehouse/units/${unit.id}`)} style={{ borderBottom: index < dashboardSearchResults.length - 1 ? undefined : "none" }}>
                    <span><strong>{unit.assetTag}</strong><small>{allModels.find((model) => model.id === unit.modelId)?.name ?? unit.modelId}{unit.serial ? ` · ${unit.serial}` : ""}{zoneCode ? ` · ${zoneCode}` : ""}</small></span>
                    <span className="warehouse-search-result__tail">
                      <Chip label={unitStatusLabel[unit.status].toLocaleLowerCase("ru-RU")} tone={tone} />
                      <span className="warehouse-search-result__chevron" aria-hidden="true" />
                    </span>
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
          {categorySelector}
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
      {canCatalog && <CableCreateSheet open={cableCreateOpen} onClose={() => setCableCreateOpen(false)} types={types.data ?? []} categories={categories.data ?? []} warehouses={warehouseList} />}
      <Sheet open={!!selectedConnector} onClose={() => setSelectedConnector(null)} title={selectedConnector ? `Разъём · ${selectedConnector.name}` : "Разъём"}>
        {selectedConnector?.imageDataUrl ? <img className="cable-connector-detail__image" src={selectedConnector.imageDataUrl} alt="" /> : <div className="cable-connector-detail__placeholder"><WarehouseGlyph type="cables" /></div>}
        <Field label="Обозначение"><Input value={selectedConnector?.designation ?? ""} readOnly /></Field>
        <p className="card__subtitle">Кабелей с этим разъёмом: {selectedConnector ? cableModels.filter((model) => { const attrs = cableAttrs(model); return attrs?.sideAConnector === selectedConnector.name || attrs?.sideBConnector === selectedConnector.name; }).length : 0}</p>
      </Sheet>
      {canIssue && (
        <OpsSheet open={opsOpen} onClose={() => setOpsOpen(false)} models={allModels} />
      )}
      {canCatalog && <EditModelSheet model={editModel} types={types.data??[]} categories={categories.data??[]} onClose={() => setEditModel(null)} />}
      {canCatalog && <TypeSettingsSheet open={typeSheetOpen} type={editType} onClose={() => { setTypeSheetOpen(false); setEditType(null); }} />}
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
