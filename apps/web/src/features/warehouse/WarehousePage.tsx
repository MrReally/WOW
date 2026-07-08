import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Equipment } from "@sever/contracts";
import {
  Button,
  Field,
  Input,
  SectionHead,
  Chip,
  Dot,
  ProgressRing,
  Loading,
  ErrorState,
  EmptyState,
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
  useCreateWarehouse,
  useUpdateWarehouse,
  useUpdateType,
  useCableSettings,
} from "./hooks.ts";
import { formatCableModel } from "./cables.ts";
import { AddModelSheet } from "./components/AddModelSheet.tsx";
import { EditModelSheet } from "./components/EditModelSheet.tsx";
import { ImportSheet } from "./components/ImportSheet.tsx";
import { CableMoveSheet, CableRow } from "./components/CableMoveSheet.tsx";
import { OpsSheet } from "./components/OpsSheet.tsx";

function PrepStat({ tone, value, label }: { tone: Tone; value: number; label: string }) {
  return (
    <div className="row" style={{ gap: 11 }}>
      <Dot tone={tone} size={9} />
      <span className="t-cond" style={{ fontSize: 21, fontWeight: 800, color: "var(--text)", minWidth: 30 }}>{value}</span>
      <span className="t-mono" style={{ fontSize: 12.5, color: "var(--text2)" }}>{label}</span>
    </div>
  );
}

function PrepHero({ units, onOps }: { units: Equipment.EquipmentUnitDTO[]; onOps: () => void }) {
  const inStock = units.filter((u) => u.status === "in_stock").length;
  const onProject = units.filter((u) => u.status === "on_project").length;
  const inRepair = units.filter((u) => u.status === "in_repair").length;
  const lost = units.filter((u) => u.status === "lost").length;
  const total = inStock + onProject;
  const pct = total ? (inStock / total) * 100 : 0;

  return (
    <div style={{ padding: "6px 4px 4px" }}>
      <div className="row" style={{ gap: 8 }}>
        <Dot tone="warn" glow />
        <span className="t-label">СКЛАД · ГОТОВНОСТЬ</span>
      </div>
      <div className="t-cond" style={{ fontSize: 32, fontWeight: 800, color: "var(--text)", marginTop: 8 }}>Warehouse</div>

      <div className="row" style={{ gap: 20, marginTop: 18, alignItems: "center" }}>
        <ProgressRing pct={pct} tone="warn" size={128} stroke={11}>
          <span className="t-cond" style={{ fontSize: 30, fontWeight: 800, color: "var(--text)", lineHeight: 0.9 }}>{inStock}</span>
          <span className="t-mono" style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>of {total}</span>
        </ProgressRing>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
          <PrepStat tone="ok" value={inStock} label="на складе" />
          <PrepStat tone="warn" value={onProject} label="на проектах" />
          <PrepStat tone="alert" value={inRepair} label="в ремонте" />
          <PrepStat tone="alert" value={lost} label="утеряно" />
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
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
        <div className="lrow__title">{model.name}</div>
        <div className="lrow__detail">{model.manufacturer ?? "—"} · {eur(model.dailyPriceEUR)}/день</div>
      </div>
      <span className="t-mono" style={{ fontSize: 12, color: "var(--text2)" }}>×{mine.length}</span>
      {onProject > 0 ? <Chip label={`${onProject} в работе`} tone="warn" /> : <Chip label={`${inStock} своб.`} tone="ok" />}
    </div>
  );
}

type WarehouseTab = "dashboard" | "repair" | "stocklist" | "cables" | "models";

const WAREHOUSE_TABS: { id: WarehouseTab; label: string; shortLabel: string; tone: "accent" | "warn" | "info" | "ok" }[] = [
  { id: "dashboard", label: "Dashboard", shortLabel: "Dash", tone: "accent" },
  { id: "repair", label: "Ремонт", shortLabel: "Ремонт", tone: "warn" },
  { id: "stocklist", label: "Stocklist", shortLabel: "Stock", tone: "ok" },
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
  const models = useModels();
  const units = useUnits();
  const types = useTypes();
  const warehouses = useWarehouses();
  const createWarehouse = useCreateWarehouse();
  const updateWarehouse = useUpdateWarehouse();
  const updateType = useUpdateType();
  const projects = useProjectsForOps();
  const openRepairs = useOpenRepairs();
  const openHandovers = useOpenHandovers();
  const cableSettings = useCableSettings();

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);
  const [cableModel, setCableModel] = useState<Equipment.EquipmentModelDTO | null>(null);
  const [editModel, setEditModel] = useState<Equipment.EquipmentModelDTO | null>(null);
  const [statusFilter, setStatusFilter] = useState<Equipment.UnitStatus | "all">("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [warehouseForm, setWarehouseForm] = useState<{ mode: "create" | "edit"; id?: string } | null>(null);
  const [warehouseNameDraft, setWarehouseNameDraft] = useState("");
  const [warehouseAddressDraft, setWarehouseAddressDraft] = useState("");
  const [search, setSearch] = useState("");
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<WarehouseTab>("dashboard");

  useEffect(() => {
    if (warehouseFilter === "all") return;
    if ((warehouses.data ?? []).some((w) => w.id === warehouseFilter)) return;
    setWarehouseFilter("all");
  }, [warehouseFilter, warehouses.data]);

  if (models.isLoading || units.isLoading) return <Loading />;
  if (models.error) return <ErrorState error={models.error} onRetry={models.refetch} />;

  const allUnits = units.data ?? [];
  const warehouseList = warehouses.data ?? [];
  const allModels = models.data ?? [];
  const getTypeName = (tid: string | undefined) => (types.data ?? []).find((t) => t.id === tid)?.name ?? "Без типа";
  const warehouseName = (id: string | null | undefined) => warehouseList.find((w) => w.id === id)?.name ?? "—";
  const selectedWarehouse = warehouseList.find((w) => w.id === warehouseFilter) ?? null;
  const openWarehouseCreate = () => {
    setWarehouseNameDraft("");
    setWarehouseAddressDraft("");
    setWarehouseForm({ mode: "create" });
  };
  const openWarehouseEdit = (warehouse: Equipment.WarehouseDTO) => {
    setWarehouseNameDraft(warehouse.name);
    setWarehouseAddressDraft(warehouse.address ?? "");
    setWarehouseForm({ mode: "edit", id: warehouse.id });
  };
  const closeWarehouseForm = () => {
    setWarehouseForm(null);
    setWarehouseNameDraft("");
    setWarehouseAddressDraft("");
  };
  const saveWarehouse = () => {
    const name = warehouseNameDraft.trim();
    if (!name) return;
    const address = warehouseAddressDraft.trim() || null;
    if (warehouseForm?.mode === "edit" && warehouseForm.id) {
      updateWarehouse.mutate(
        { id: warehouseForm.id, input: { name, address } },
        { onSuccess: closeWarehouseForm }
      );
      return;
    }
    createWarehouse.mutate(
      { name, address },
      {
        onSuccess: (warehouse) => {
          setWarehouseFilter(warehouse.id);
          closeWarehouseForm();
        },
      }
    );
  };
  const query = search.trim().toLowerCase();
  const modelMatches = (m: Equipment.EquipmentModelDTO) =>
    !query || [m.name, m.manufacturer ?? "", getTypeName(m.typeId), m.trackingMode === "cable" ? formatCableModel(m, cableSettings.data?.nameFormat) : ""].some((v) => v.toLowerCase().includes(query));
  const unitMatches = (u: Equipment.EquipmentUnitDTO) => {
    const m = allModels.find((x) => x.id === u.modelId);
    return !query || [u.assetTag, u.serial ?? "", m?.name ?? "", m?.manufacturer ?? "", getTypeName(m?.typeId)].some((v) => v.toLowerCase().includes(query));
  };
  const serialModels = allModels.filter((m) => m.trackingMode === "serial" && modelMatches(m));
  const quantityModels = allModels.filter((m) => m.trackingMode === "quantity" && modelMatches(m));
  const cableModels = allModels.filter((m) => m.trackingMode === "cable" && modelMatches(m));
  const filteredByWarehouse = warehouseFilter === "all" ? allUnits : allUnits.filter((u) => u.warehouseId === warehouseFilter);
  const filteredByStatus = statusFilter === "all" ? filteredByWarehouse : filteredByWarehouse.filter((u) => u.status === statusFilter);
  const filtered = filteredByStatus.filter(unitMatches);
  const statuses: (Equipment.UnitStatus | "all")[] = ["all", "in_stock", "on_project", "in_repair", "reserved", "lost"];

  const repairTone = (s: Equipment.UnitStatus) => (s === "in_repair" ? "alert" : "warn");
  const tag = (uid: string) => allUnits.find((x) => x.id === uid)?.assetTag ?? uid.slice(0, 6);
  const toggleType = (tid: string) =>
    setCollapsedTypes((prev) => {
      const next = new Set(prev);
      next.has(tid) ? next.delete(tid) : next.add(tid);
      return next;
    });
  const renameType = (tid: string) => {
    const current = getTypeName(tid);
    const next = prompt("Новое название типа", current)?.trim();
    if (!next || next === current) return;
    updateType.mutate({ id: tid, input: { name: next } });
  };
  const repairCount = (openRepairs.data ?? []).length + (openHandovers.data ?? []).length;
  const searchField = (
    <Field label="Поиск по складу">
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Модель, тип, номер, серийник" />
    </Field>
  );
  const warehouseSelector = (
    <>
      <SectionHead label="Склады" meta={warehouseFilter === "all" ? "ВСЕ" : warehouseName(warehouseFilter)} />
      <div className="card" style={{ padding: "12px 14px", marginBottom: 12 }}>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          <button
            className={`chip ${warehouseFilter === "all" ? "chip--accent chip--solid" : "chip--neutral"}`}
            style={{ cursor: "pointer", border: "none" }}
            onClick={() => setWarehouseFilter("all")}
          >
            Все склады
          </button>
          {warehouseList.map((w) => (
            <button
              key={w.id}
              className={`chip ${warehouseFilter === w.id ? "chip--accent chip--solid" : "chip--neutral"}`}
              style={{ cursor: "pointer", border: "none" }}
              onClick={() => setWarehouseFilter(w.id)}
              title={w.address ?? undefined}
            >
              {w.name}{w.isDefault ? " ★" : ""}
            </button>
          ))}
        </div>
        {warehouseFilter !== "all" && (
          <p className="card__subtitle" style={{ marginTop: 8 }}>
            {warehouseList.find((w) => w.id === warehouseFilter)?.address || "Адрес не указан"}
          </p>
        )}
        {canCatalog && (
          <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={openWarehouseCreate}>
              + Склад
            </Button>
            {warehouseFilter !== "all" && (
              <>
                <Button variant="ghost" disabled={!selectedWarehouse} onClick={() => selectedWarehouse && openWarehouseEdit(selectedWarehouse)}>
                  Редактировать
                </Button>
                <Button
                  variant="ghost"
                  disabled={warehouseList.find((w) => w.id === warehouseFilter)?.isDefault}
                  aria-label={warehouseList.find((w) => w.id === warehouseFilter)?.isDefault ? "Основной склад" : "Сделать основным"}
                  title={warehouseList.find((w) => w.id === warehouseFilter)?.isDefault ? "Основной склад" : "Сделать основным"}
                  style={{ width: 44, height: 44, padding: 0, flex: "0 0 auto", fontSize: 20 }}
                  onClick={() => updateWarehouse.mutate({ id: warehouseFilter, input: { isDefault: true } })}
                >
                  {warehouseList.find((w) => w.id === warehouseFilter)?.isDefault ? "★" : "☆"}
                </Button>
              </>
            )}
          </div>
        )}
        {canCatalog && warehouseForm && (
          <div className="card card--flat" style={{ marginTop: 12 }}>
            <p className="card__title">{warehouseForm.mode === "create" ? "Новый склад" : "Редактировать склад"}</p>
            <Field label="Название">
              <Input value={warehouseNameDraft} onChange={(e) => setWarehouseNameDraft(e.target.value)} placeholder="Main warehouse" />
            </Field>
            <Field label="Адрес">
              <Input value={warehouseAddressDraft} onChange={(e) => setWarehouseAddressDraft(e.target.value)} placeholder="Город, улица, помещение" />
            </Field>
            <div className="row" style={{ marginTop: 8 }}>
              <Button
                block
                disabled={!warehouseNameDraft.trim() || createWarehouse.isPending || updateWarehouse.isPending}
                onClick={saveWarehouse}
              >
                Сохранить
              </Button>
              <Button variant="secondary" block onClick={closeWarehouseForm}>Отмена</Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
  const repairSection = (
    <>
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
      <SectionHead label="Модели" meta={canEdit ? undefined : `${allModels.length}`} />
      <Field label="Поиск модели">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Модель или тип" />
      </Field>
      {canEdit && (
        <div className="row" style={{ marginBottom: 10 }}>
          {canCatalog && <Button block variant="secondary" onClick={() => setAddOpen(true)}>+ Модель / единица</Button>}
          {canImport && <Button block variant="secondary" onClick={() => setImportOpen(true)}>Импорт CSV</Button>}
        </div>
      )}
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
      {warehouseSelector}
      <Field label="Поиск кабеля">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Разъём, длина, тип" />
      </Field>
      {canCatalog && (
        <div className="row" style={{ marginBottom: 10 }}>
          <Button block variant="secondary" onClick={() => setAddOpen(true)}>+ Кабель</Button>
        </div>
      )}
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
    </>
  );
  const unitSection = (
    <>
      <SectionHead label="Единицы" meta={`${filtered.length}`} />
      <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {statuses.map((s) => (
          <button
            key={s}
            className={`chip ${statusFilter === s ? "chip--accent chip--solid" : "chip--neutral"}`}
            style={{ cursor: "pointer", border: "none" }}
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
          return ordered.map(([tid, list]) => (
            <div key={tid}>
              <div className="row row--between" style={{ alignItems: "center" }}>
                <SectionHead label={getTypeName(tid)} meta={`${list.length}`} />
                <div className="row" style={{ gap: 6 }}>
                  {canCatalog && (
                    <button className="icon-btn" aria-label="Редактировать тип" title="Редактировать тип" onClick={() => renameType(tid)}>
                      ✎
                    </button>
                  )}
                  <button className="icon-btn" aria-label={collapsedTypes.has(tid) ? "Развернуть" : "Свернуть"} title={collapsedTypes.has(tid) ? "Развернуть" : "Свернуть"} onClick={() => toggleType(tid)}>
                    {collapsedTypes.has(tid) ? "▾" : "▴"}
                  </button>
                </div>
              </div>
              {!collapsedTypes.has(tid) && (
                <div className="card" style={{ padding: "2px 16px" }}>
                  {list.map((u, i) => {
                    const tone: Tone = u.status === "in_stock" ? "ok" : u.status === "on_project" ? "warn" : u.status === "lost" || u.status === "in_repair" ? "alert" : "info";
                    return (
                      <div
                        key={u.id}
                        className="lrow card--tappable"
                        style={{ borderBottom: i === list.length - 1 ? "none" : undefined }}
                        onClick={() => navigate(`/warehouse/units/${u.id}`)}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="lrow__title">{u.assetTag}</div>
                          <div className="lrow__detail">{modelOf(u.modelId)?.name ?? u.modelId} · {warehouseName(u.warehouseId)}</div>
                        </div>
                        <Chip label={unitStatusLabel[u.status]} tone={tone} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ));
        })()
      )}
    </>
  );

  return (
    <div style={{ paddingBottom: 92 }}>
      {activeTab === "dashboard" && (
        <>
          <PrepHero units={allUnits} onOps={canIssue ? () => setOpsOpen(true) : () => navigate("/operations")} />
          {searchField}
        </>
      )}
      {activeTab === "repair" && repairSection}
      {activeTab === "stocklist" && (
        <>
          {warehouseSelector}
          {searchField}
          {unitSection}
        </>
      )}
      {activeTab === "cables" && cableSection}
      {activeTab === "models" && modelSection}

      {canEdit && (
        <>
          <AddModelSheet open={addOpen} onClose={() => setAddOpen(false)} types={types.data ?? []} models={allModels} />
          <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} />
        </>
      )}
      {canIssue && (
        <OpsSheet open={opsOpen} onClose={() => setOpsOpen(false)} projects={projects.data ?? []} models={allModels} />
      )}
      {canCatalog && <EditModelSheet model={editModel} onClose={() => setEditModel(null)} />}
      <CableMoveSheet model={cableModel} projects={projects.data ?? []} warehouses={warehouseList} selectedWarehouseId={warehouseFilter === "all" ? null : warehouseFilter} onClose={() => setCableModel(null)} />
      <div className="project-tabbar" role="tablist" aria-label="Warehouse">
        {WAREHOUSE_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = tab.id === "repair" ? repairCount : tab.id === "stocklist" ? filtered.length : tab.id === "cables" ? cableModels.length : tab.id === "models" ? serialModels.length + quantityModels.length : 0;
          return (
            <button
              key={tab.id}
              className={`project-tabbar__item ${isActive ? "project-tabbar__item--active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
              aria-label={tab.label}
              aria-selected={isActive}
              role="tab"
              type="button"
              style={{ ["--tab-c" as string]: `var(--${tab.tone === "accent" ? "accent" : tab.tone})` }}
            >
              <span className="project-tabbar__icon">
                <WarehouseGlyph type={tab.id} />
                {count > 0 && <span className="project-tabbar__badge">{count > 9 ? "9+" : count}</span>}
              </span>
              <span className="project-tabbar__label">{tab.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
