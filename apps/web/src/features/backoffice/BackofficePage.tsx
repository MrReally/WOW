import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Catalog, Equipment, Finance, Operations, People, Permission, Problem, Projects } from "@sever/contracts";
import { PERMISSIONS } from "@sever/contracts";
import { BrandLogo, Chip } from "../../ui-kit/index.ts";
import { useSession } from "../../app/session.ts";
import { useTheme } from "../../app/theme.tsx";
import { Register, type RegisterColumn } from "./Register.tsx";
import { useBackofficeAppearance, useBackofficeCommands, useBackofficeData } from "./hooks.ts";
import "./backoffice.css";

type DomainId = "overview" | "projects" | "equipment" | "catalog" | "documents" | "movement" | "inventory" | "people" | "contractors" | "finance" | "problems" | "reports" | "permissions";
interface WorkspaceTab { id: string; domain: DomainId; title: string; entityId?: string; dirty?: boolean }

const domains: Array<{ id: DomainId; label: string; group: string; hint: string }> = [
  { id: "overview", label: "Обзор", group: "Контроль", hint: "Проблемы и показатели" },
  { id: "projects", label: "Проекты", group: "Планирование", hint: "Реестр и карточки" },
  { id: "equipment", label: "Оборудование", group: "Справочники", hint: "Модели и единицы" },
  { id: "catalog", label: "Номенклатура", group: "Справочники", hint: "Единицы, упаковки и рецептуры" },
  { id: "documents", label: "Выдача и возврат", group: "Документы", hint: "Операции со склада" },
  { id: "inventory", label: "Инвентаризация", group: "Документы", hint: "Ожидалось и найдено" },
  { id: "movement", label: "Движение", group: "Отчёты", hint: "Неизменяемый журнал" },
  { id: "people", label: "Люди", group: "Управление", hint: "Сотрудники и роли" },
  { id: "contractors", label: "Подрядчики", group: "Управление", hint: "Передачи и долги" },
  { id: "finance", label: "Финансы", group: "Управление", hint: "Счета и транзакции" },
  { id: "problems", label: "Проблемы", group: "Контроль", hint: "Исключения и решения" },
  { id: "reports", label: "Конструктор отчётов", group: "Отчёты", hint: "Группировка показателей" },
  { id: "permissions", label: "Права доступа", group: "Администрирование", hint: "Матрица ролей" },
];

const statusLabel: Record<string, string> = { in_stock: "На складе", reserved: "Зарезервировано", on_project: "На проекте", in_repair: "В ремонте", at_contractor: "У подрядчика", lost: "Утеряно", draft: "Черновик", confirmed: "Подтверждён", in_progress: "В работе", completed: "Завершён", cancelled: "Отменён" };
const dt = (value: string | null | undefined) => value ? new Date(value).toLocaleString("ru-RU") : "—";
const money = (value: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "EUR" }).format(value);
function domainAllowed(domain: DomainId, can: (...permissions: Permission[]) => boolean) {
  if (["equipment","catalog","documents","inventory","movement","problems","reports"].includes(domain)) return can("warehouse.view");
  if (domain === "projects") return can("projects.view");
  if (domain === "people" || domain === "permissions") return can("people.view", "people.manage", "roles.manage");
  if (domain === "contractors") return can("projects.reservation.manage", "finance.view");
  if (domain === "finance") return can("finance.view");
  return true;
}

export function BackofficePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user, can } = useSession();
  const { view, selectView } = useBackofficeAppearance(user?.id);
  const { theme, toggle: toggleTheme } = useTheme();
  const data = useBackofficeData(can);
  const commands = useBackofficeCommands();
  const initialDomain = domains.some((item) => item.id === params.get("domain")) ? params.get("domain") as DomainId : "overview";
  const [tabs, setTabs] = useState<WorkspaceTab[]>([{ id: "overview", domain: initialDomain, title: domains.find((d) => d.id === initialDomain)?.label ?? "Обзор" }]);
  const [activeTab, setActiveTab] = useState("overview");
  const [globalQuery, setGlobalQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState("all");
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]!;

  const openDomain = (domain: DomainId, entityId?: string, title?: string) => {
    const id = entityId ? `${domain}:${entityId}` : domain;
    setTabs((current) => current.some((tab) => tab.id === id) ? current : [...current, { id, domain, entityId, title: title ?? domains.find((item) => item.id === domain)?.label ?? domain }]);
    setActiveTab(id);
    setParams({ domain, ...(entityId ? { id: entityId } : {}) });
  };
  const closeTab = (id: string) => {
    if (id === "overview") return;
    const next = tabs.filter((tab) => tab.id !== id);
    setTabs(next);
    if (activeTab === id) { setActiveTab(next.at(-1)?.id ?? "overview"); setParams({ domain: next.at(-1)?.domain ?? "overview" }); }
  };
  const grouped = useMemo(() => domains.filter((item) => domainAllowed(item.id, can)).reduce<Record<string, typeof domains>>((acc, item) => ({ ...acc, [item.group]: [...(acc[item.group] ?? []), item] }), {}), [can]);

  return <div className="bo-shell" data-bo-view={view}>
    <aside className="bo-sidebar">
      <button className="bo-brand" onClick={() => navigate("/apex")}><BrandLogo size={30} color="var(--text)" /><span><strong>SEVER</strong><small>Backoffice</small></span></button>
      <nav className="bo-nav" aria-label="Разделы Backoffice">{Object.entries(grouped).map(([group, items]) => <div className="bo-nav__group" key={group}><div className="bo-nav__group-label">{group}</div>{items.map((item) => <button key={item.id} className={`bo-nav__item ${active.domain === item.id ? "bo-nav__item--active" : ""}`} onClick={() => openDomain(item.id)}><span>{item.label}</span><small>{item.hint}</small></button>)}</div>)}</nav>
    </aside>
    <section className="bo-main">
      <header className="bo-topbar"><div><div className="bo-eyebrow">SEVER · рабочий контур</div><h1>{domains.find((item) => item.id === active.domain)?.label}</h1></div><div className="bo-topbar__actions">
        <select aria-label="Склад" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}><option value="all">Все склады</option>{(data.warehouses.data ?? []).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
        <input className="bo-command" aria-label="Глобальный поиск" value={globalQuery} onChange={(event) => setGlobalQuery(event.target.value)} placeholder="Поиск записей, документов, кодов" />
        <button className="bo-icon-button" onClick={() => navigate("/apex")}>Мобильный режим</button>
        <details className="bo-user-menu"><summary className="bo-user">{user?.displayName ?? "SEVER user"}</summary><div className="bo-user-menu__popover"><div className="bo-user-menu__title">Вид Backoffice</div><div className="bo-user-menu__label">Оформление</div><div className="bo-view-switch" aria-label="Оформление Backoffice"><button className={view === "classic" ? "is-active" : ""} aria-pressed={view === "classic"} onClick={() => selectView("classic")}>Classic</button><button className={view === "stylish" ? "is-active" : ""} aria-pressed={view === "stylish"} onClick={() => selectView("stylish")}>Stylish</button></div><div className="bo-user-menu__label">Тема</div><div className="bo-view-switch" aria-label="Тема Backoffice"><button className={theme === "light" ? "is-active" : ""} aria-pressed={theme === "light"} onClick={() => { if (theme !== "light") toggleTheme(); }}>Светлая</button><button className={theme === "dark" ? "is-active" : ""} aria-pressed={theme === "dark"} onClick={() => { if (theme !== "dark") toggleTheme(); }}>Тёмная</button></div></div></details>
      </div></header>
      <div className="bo-tabs">{tabs.map((tab) => <button key={tab.id} className={`bo-tab ${activeTab === tab.id ? "bo-tab--active" : ""}`} onClick={() => { setActiveTab(tab.id); setParams({ domain: tab.domain, ...(tab.entityId ? { id: tab.entityId } : {}) }); }}>{tab.title}{tab.dirty ? " *" : ""}{tab.id !== "overview" && <span onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}> ×</span>}</button>)}</div>
      <main className="bo-workspace"><Workspace domain={active.domain} entityId={active.entityId} query={globalQuery} warehouseId={warehouseId} data={data} commands={commands} can={can} openDomain={openDomain} /></main>
    </section>
  </div>;
}

type Data = ReturnType<typeof useBackofficeData>;
type Commands = ReturnType<typeof useBackofficeCommands>;

function Workspace({ domain, entityId, query, warehouseId, data, commands, can, openDomain }: { domain: DomainId; entityId?: string; query: string; warehouseId: string; data: Data; commands: Commands; can: (...permissions: Permission[]) => boolean; openDomain: (domain: DomainId, entityId?: string, title?: string) => void }) {
  if (domain === "overview") return <Overview data={data} openDomain={openDomain} />;
  if (domain === "equipment") return <EquipmentWorkspace data={data} warehouseId={warehouseId} entityId={entityId} openDomain={openDomain} />;
  if (domain === "catalog") return <CatalogWorkspace data={data} commands={commands} can={can} />;
  if (domain === "projects") return <ProjectsWorkspace data={data} entityId={entityId} commands={commands} openDomain={openDomain} />;
  if (domain === "documents") return <OperationDocument data={data} commands={commands} can={can} />;
  if (domain === "inventory") return <InventoryWorkspace data={data} commands={commands} can={can} />;
  if (domain === "movement") return <MovementWorkspace data={data} query={query} />;
  if (domain === "people") return <PeopleWorkspace data={data} />;
  if (domain === "contractors") return <ContractorsWorkspace data={data} />;
  if (domain === "finance") return <FinanceWorkspace data={data} commands={commands} can={can} />;
  if (domain === "problems") return <ProblemsWorkspace data={data} commands={commands} can={can} />;
  if (domain === "reports") return <ReportBuilder data={data} />;
  return <PermissionsWorkspace data={data} commands={commands} can={can} />;
}

function Overview({ data, openDomain }: { data: Data; openDomain: (domain: DomainId) => void }) {
  const apex = data.apex.data;
  return <div className="bo-grid bo-grid--overview"><Metric label="Активные проекты" value={String((apex?.current.length ?? 0) + (apex?.upcoming.length ?? 0))} onClick={() => openDomain("projects")} /><Metric label="Открытые проблемы" value={String(apex?.problems.length ?? 0)} onClick={() => openDomain("problems")} /><Metric label="Долг клиентов" value={money(apex?.financeSummary.clientDebtEUR ?? 0)} onClick={() => openDomain("finance")} /><Metric label="Единицы оборудования" value={String(data.units.data?.length ?? 0)} onClick={() => openDomain("equipment")} /></div>;
}
function Metric({ label, value, onClick }: { label: string; value: string; onClick: () => void }) { return <button className="bo-panel bo-metric" onClick={onClick}><span>{label}</span><strong>{value}</strong></button>; }

function EquipmentWorkspace({ data, warehouseId, entityId, openDomain }: { data: Data; warehouseId: string; entityId?: string; openDomain: (domain: DomainId, id?: string, title?: string) => void }) {
  const models = data.models.data ?? [], units = (data.units.data ?? []).filter((unit) => warehouseId === "all" || unit.warehouseId === warehouseId);
  const warehouses = new Map((data.warehouses.data ?? []).map((row) => [row.id, row.name]));
  const modelMap = new Map(models.map((row) => [row.id, row]));
  const selected = entityId ? units.find((unit) => unit.id === entityId) : undefined;
  const columns: RegisterColumn<Equipment.EquipmentUnitDTO>[] = [
    { id: "tag", label: "Маркировка", value: (row) => row.assetTag }, { id: "model", label: "Модель", value: (row) => modelMap.get(row.modelId)?.name ?? row.modelId }, { id: "serial", label: "Серийный №", value: (row) => row.serial ?? "—" }, { id: "status", label: "Статус", value: (row) => statusLabel[row.status] ?? row.status }, { id: "warehouse", label: "Склад", value: (row) => warehouses.get(row.warehouseId ?? "") ?? "—" }, { id: "cost", label: "Стоимость", value: (row) => modelMap.get(row.modelId)?.unitCostEUR ?? 0, render: (row) => money(modelMap.get(row.modelId)?.unitCostEUR ?? 0), align: "right" },
  ];
  return <div className="bo-split"><Register id="equipment" rows={units} columns={columns} rowKey={(row) => row.id} onOpen={(row) => openDomain("equipment", row.id, row.assetTag)} />{selected && <aside className="bo-panel bo-peek"><div className="bo-panel__head"><span>Карточка единицы</span><Chip label={statusLabel[selected.status] ?? selected.status} tone={selected.status === "lost" ? "danger" : "info"} /></div><h2>{selected.assetTag}</h2><dl className="bo-details"><dt>Модель</dt><dd>{modelMap.get(selected.modelId)?.name}</dd><dt>Серийный номер</dt><dd>{selected.serial ?? "—"}</dd><dt>Склад</dt><dd>{warehouses.get(selected.warehouseId ?? "") ?? "—"}</dd><dt>Примечание</dt><dd>{selected.notes ?? "—"}</dd></dl></aside>}</div>;
}

function CatalogWorkspace({ data, commands, can }: { data: Data; commands: Commands; can: (...permissions: Permission[]) => boolean }) {
  const columns: RegisterColumn<Catalog.CatalogItemDTO>[] = [{ id: "sku", label: "SKU", value: (r) => r.sku }, { id: "name", label: "Название", value: (r) => r.name }, { id: "kind", label: "Тип", value: (r) => r.kind }, { id: "group", label: "Группа", value: (r) => r.groupName ?? "—" }, { id: "unit", label: "Базовая ед.", value: (r) => r.baseUnit }, { id: "state", label: "Состояние", value: (r) => r.active ? "Активна" : "Архив" }];
  return <Register id="catalog" rows={data.catalog.data ?? []} columns={columns} rowKey={(row) => row.id} toolbar={can("warehouse.catalog.manage") ? <button className="bo-primary" onClick={() => commands.createCatalogItem.mutate({ sku: `SKU-${Date.now()}`, name: "Новая позиция", kind: "product", baseUnit: "pcs" })}>Добавить позицию</button> : null} />;
}

function ProjectsWorkspace({ data, entityId, commands, openDomain }: { data: Data; entityId?: string; commands: Commands; openDomain: (domain: DomainId, id?: string, title?: string) => void }) {
  const projects = data.projects.data ?? [], clients = new Map((data.clients.data ?? []).map((row) => [row.id, row.name]));
  const selected = projects.find((row) => row.id === entityId);
  const columns: RegisterColumn<Projects.ProjectDTO>[] = [{ id: "name", label: "Проект", value: (row) => row.name }, { id: "client", label: "Клиент", value: (row) => clients.get(row.clientId) ?? "—" }, { id: "starts", label: "Начало", value: (row) => dt(row.startsAt) }, { id: "ends", label: "Окончание", value: (row) => dt(row.endsAt) }, { id: "status", label: "Статус", value: (row) => statusLabel[row.status] ?? row.status }];
  return <div className="bo-split"><Register id="projects" rows={projects} columns={columns} rowKey={(row) => row.id} onOpen={(row) => openDomain("projects", row.id, row.name)} />{selected && <ProjectEditor project={selected} clients={data.clients.data ?? []} save={(input) => commands.updateProject.mutate({ id: selected.id, input })} pending={commands.updateProject.isPending} />}</div>;
}
function ProjectEditor({ project, clients, save, pending }: { project: Projects.ProjectDTO; clients: Projects.ClientDTO[]; save: (input: Projects.UpdateProjectInput) => void; pending: boolean }) {
  const [name, setName] = useState(project.name); const [clientId, setClientId] = useState(project.clientId); const [startsAt, setStartsAt] = useState(project.startsAt.slice(0, 16)); const [endsAt, setEndsAt] = useState(project.endsAt.slice(0, 16));
  return <aside className="bo-panel bo-peek"><div className="bo-panel__head"><span>Редактор проекта</span><Chip label={statusLabel[project.status] ?? project.status} tone="info" /></div><label>Название<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>Клиент<select value={clientId} onChange={(e) => setClientId(e.target.value)}>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label>Начало<input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></label><label>Окончание<input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></label><button className="bo-primary" disabled={pending} onClick={() => save({ name, clientId, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() })}>Сохранить</button></aside>;
}

function OperationDocument({ data, commands, can }: { data: Data; commands: Commands; can: (...permissions: Permission[]) => boolean }) {
  const [kind, setKind] = useState<"issue" | "return" | "transfer">("issue"); const [projectId, setProjectId] = useState(""); const [warehouseId, setWarehouseId] = useState(""); const [selected, setSelected] = useState<string[]>([]); const units = data.units.data ?? [];
  const eligible = kind === "issue" ? units.filter((u) => u.status === "in_stock") : kind === "return" ? units.filter((u) => u.status === "on_project" && (!projectId || u.currentProjectId === projectId)) : units;
  const saveDraft = () => { const payload:Operations.OperationPayload=kind==="issue"?{kind,projectId,unitIds:selected}:kind==="return"?{kind,projectId,expectedUnitIds:eligible.map(u=>u.id),returnedUnitIds:selected}:{kind,unitId:selected[0]!,warehouseId}; commands.createDocument.mutate(payload); };
  const docs=data.documents.data??[];
  return <><section className="bo-panel"><div className="bo-document-head"><div><div className="bo-eyebrow">Операционный документ · новый черновик</div><h2>{kind === "issue" ? "Выдача" : kind === "return" ? "Возврат" : "Перемещение"}</h2></div><button className="bo-primary" disabled={!can("warehouse.issue") || !selected.length || (kind !== "transfer" && !projectId)} onClick={saveDraft}>Сохранить черновик</button></div><div className="bo-doc-fields"><label>Тип<select value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setSelected([]); }}><option value="issue">Выдача</option><option value="return">Возврат</option><option value="transfer">Перемещение</option></select></label>{kind !== "transfer" && <label>Проект<select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Выберите проект</option>{(data.projects.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}{kind === "transfer" && <label>Склад назначения<select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}><option value="">Выберите склад</option>{(data.warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}</div><table className="bo-table"><thead><tr><th></th><th>Единица</th><th>Статус</th></tr></thead><tbody>{eligible.map((unit) => <tr key={unit.id}><td><input type={kind === "transfer" ? "radio" : "checkbox"} checked={selected.includes(unit.id)} onChange={() => setSelected((current) => kind === "transfer" ? [unit.id] : current.includes(unit.id) ? current.filter((id) => id !== unit.id) : [...current, unit.id])} /></td><td>{unit.assetTag}</td><td>{statusLabel[unit.status]}</td></tr>)}</tbody></table></section><DocumentJournal rows={docs} post={id=>commands.postDocument.mutate(id)} reverse={id=>commands.reverseDocument.mutate(id)} canManage={can("warehouse.issue","warehouse.catalog.manage")}/></>;
}

function DocumentJournal({rows,post,reverse,canManage}:{rows:Operations.OperationDocumentDTO[];post:(id:string)=>void;reverse:(id:string)=>void;canManage:boolean}){const columns:RegisterColumn<Operations.OperationDocumentDTO>[]=[{id:"number",label:"Номер",value:r=>r.number},{id:"kind",label:"Тип",value:r=>({issue:"Выдача",return:"Возврат",transfer:"Перемещение",inventory:"Инвентаризация"}[r.kind])},{id:"status",label:"Статус",value:r=>({draft:"Черновик",posted:"Проведён",reversed:"Сторнирован"}[r.status])},{id:"created",label:"Создан",value:r=>dt(r.createdAt)},{id:"action",label:"Действие",value:r=>r.status,render:r=>canManage?r.status==="draft"?<button onClick={e=>{e.stopPropagation();post(r.id)}}>Провести</button>:r.status==="posted"?<button onClick={e=>{e.stopPropagation();reverse(r.id)}}>Сторнировать</button>:"—":"—"}];return <Register id="operation-documents" rows={rows} columns={columns} rowKey={r=>r.id}/>;}

function InventoryWorkspace({ data,commands,can }: { data: Data;commands:Commands;can:(...permissions:Permission[])=>boolean }) { const units = data.units.data ?? []; const [missing,setMissing]=useState<string[]>([]); const byStatus = Object.entries(Object.groupBy(units, (unit) => unit.status)); return <><section className="bo-panel"><div className="bo-document-head"><div><div className="bo-eyebrow">Инвентаризационная ведомость · черновик</div><h2>Фактические остатки</h2></div><button className="bo-primary" disabled={!missing.length||!can("warehouse.catalog.manage","warehouse.issue")} onClick={()=>commands.createDocument.mutate({kind:"inventory",lines:units.map(unit=>({unitId:unit.id,present:!missing.includes(unit.id)}))})}>Сохранить черновик</button></div><table className="bo-table"><thead><tr><th>Не найдено</th><th>Единица</th><th>Ожидаемый статус</th></tr></thead><tbody>{units.map(unit=><tr key={unit.id}><td><input type="checkbox" checked={missing.includes(unit.id)} onChange={()=>setMissing(current=>current.includes(unit.id)?current.filter(id=>id!==unit.id):[...current,unit.id])}/></td><td>{unit.assetTag}</td><td>{statusLabel[unit.status]??unit.status}</td></tr>)}</tbody></table><div className="bo-grid bo-grid--accounts">{byStatus.map(([status, rows]) => <div className="bo-panel" key={status}><span>{statusLabel[status] ?? status}</span><strong>{rows?.length ?? 0}</strong></div>)}</div><p className="bo-note">Проведение помечает отсутствующие единицы как утерянные и создаёт Problems; сторно восстанавливает прежние статусы. Журнал остаётся неизменяемым.</p></section><DocumentJournal rows={(data.documents.data??[]).filter(row=>row.kind==="inventory")} post={id=>commands.postDocument.mutate(id)} reverse={id=>commands.reverseDocument.mutate(id)} canManage={can("warehouse.catalog.manage","warehouse.issue")}/></>; }

function MovementWorkspace({ data, query }: { data: Data; query: string }) { const units = new Map((data.units.data ?? []).map((row) => [row.id, row.assetTag])); const projects = new Map((data.projects.data ?? []).map((row) => [row.id, row.name])); const warehouses = new Map((data.warehouses.data ?? []).map((row) => [row.id, row.name])); const rows = (data.journal.data ?? []).filter((r) => !query || JSON.stringify(r).toLowerCase().includes(query.toLowerCase())); const columns: RegisterColumn<Equipment.JournalEntryDTO>[] = [{ id: "at", label: "Время", value: (r) => dt(r.at) }, { id: "object", label: "Объект", value: (r) => units.get(r.unitId ?? "") ?? r.modelId ?? "—" }, { id: "action", label: "Действие", value: (r) => r.action }, { id: "project", label: "Проект", value: (r) => projects.get(r.projectId ?? "") ?? "—" }, { id: "warehouse", label: "Склад", value: (r) => warehouses.get(r.warehouseId ?? r.toWarehouseId ?? "") ?? "—" }, { id: "qty", label: "Количество", value: (r) => r.qty ?? 1, align: "right" }]; return <Register id="movement" rows={rows} columns={columns} rowKey={(row) => row.id} />; }

function PeopleWorkspace({ data }: { data: Data }) { const columns: RegisterColumn<People.UserDTO>[] = [{ id: "name", label: "Сотрудник", value: (r) => r.displayName }, { id: "role", label: "Роль", value: (r) => r.roleName }, { id: "email", label: "Email", value: (r) => r.email ?? "—" }, { id: "rate", label: "Ставка", value: (r) => r.hourlyRateEUR ?? 0, render: (r) => r.hourlyRateEUR == null ? "—" : money(r.hourlyRateEUR) }, { id: "status", label: "Статус", value: (r) => r.active ? "Активен" : "Архив" }]; return <Register id="people" rows={data.people.data ?? []} columns={columns} rowKey={(row) => row.id} />; }
function ContractorsWorkspace({ data }: { data: Data }) { const items = data.contractorItems.data ?? []; const columns: RegisterColumn<Equipment.ContractorDTO>[] = [{ id: "name", label: "Подрядчик", value: (r) => r.name }, { id: "contacts", label: "Контакты", value: (r) => r.contacts ?? "—" }, { id: "open", label: "Открытых позиций", value: (r) => items.filter((i) => i.contractorId === r.id).length, align: "right" }, { id: "debt", label: "Себестоимость", value: (r) => items.filter((i) => i.contractorId === r.id).reduce((sum, i) => sum + i.costEUR * i.qty, 0), render: (r) => money(items.filter((i) => i.contractorId === r.id).reduce((sum, i) => sum + i.costEUR * i.qty, 0)), align: "right" }]; return <Register id="contractors" rows={data.contractors.data ?? []} columns={columns} rowKey={(row) => row.id} />; }

function FinanceWorkspace({ data, commands, can }: { data: Data; commands: Commands; can: (...permissions: Permission[]) => boolean }) {
  const [creating,setCreating]=useState(false); const [accountId,setAccountId]=useState(""); const [kind,setKind]=useState<Finance.TxKind>("income"); const [amount,setAmount]=useState(""); const [note,setNote]=useState("");
  const accounts = new Map((data.accounts.data ?? []).map((r) => [r.id, r.name])); const columns: RegisterColumn<Finance.TransactionDTO>[] = [{ id: "at", label: "Дата", value: (r) => dt(r.createdAt) }, { id: "account", label: "Счёт", value: (r) => accounts.get(r.accountId) ?? "—" }, { id: "kind", label: "Тип", value: (r) => r.kind === "income" ? "Доход" : "Расход" }, { id: "category", label: "Категория", value: (r) => r.category }, { id: "amount", label: "Сумма EUR", value: (r) => r.amountEUR, render: (r) => money(r.amountEUR), align: "right" }, { id: "note", label: "Комментарий", value: (r) => r.note ?? "—" }];
  const account=data.accounts.data?.find((row)=>row.id===accountId);
  return <><div className="bo-grid bo-grid--accounts">{(data.accounts.data ?? []).map((row) => <div className="bo-panel" key={row.id}><span>{row.name}</span><strong>{row.balance} {row.currency}</strong></div>)}</div>{creating&&<section className="bo-panel bo-inline-form"><label>Счёт<select value={accountId} onChange={(e)=>setAccountId(e.target.value)}><option value="">Выберите счёт</option>{(data.accounts.data??[]).map((row)=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Тип<select value={kind} onChange={(e)=>setKind(e.target.value as Finance.TxKind)}><option value="income">Доход</option><option value="expense">Расход</option></select></label><label>Сумма<input type="number" min="0.01" step="0.01" value={amount} onChange={(e)=>setAmount(e.target.value)}/></label><label>Комментарий<input value={note} onChange={(e)=>setNote(e.target.value)}/></label><button className="bo-primary" disabled={!account||Number(amount)<=0} onClick={()=>account&&commands.createTransaction.mutate({accountId:account.id,kind,category:"other",amount:Number(amount),currency:account.currency,note:note||null},{onSuccess:()=>{setCreating(false);setAmount("");setNote("");}})}>Провести</button></section>}<Register id="finance" rows={data.transactions.data ?? []} columns={columns} rowKey={(row) => row.id} toolbar={can("finance.manage") ? <button className="bo-primary" onClick={() => setCreating(true)}>Новая транзакция</button> : null} /></>;
}

function ProblemsWorkspace({ data, commands, can }: { data: Data; commands: Commands; can: (...permissions: Permission[]) => boolean }) { const columns: RegisterColumn<Problem>[] = [{ id: "severity", label: "Приоритет", value: (r) => r.severity }, { id: "title", label: "Проблема", value: (r) => r.title }, { id: "detail", label: "Описание", value: (r) => r.detail }, { id: "created", label: "Создана", value: (r) => dt(r.createdAt) }, { id: "state", label: "Состояние", value: (r) => r.resolved ? "Решена" : "Открыта", render: (r) => !r.resolved && can("warehouse.issue") ? <button onClick={(e) => { e.stopPropagation(); commands.resolveProblem.mutate(r.id); }}>Решить</button> : r.resolved ? "Решена" : "Открыта" }]; return <Register id="problems" rows={data.problems.data ?? []} columns={columns} rowKey={(row) => row.id} />; }

function ReportBuilder({ data }: { data: Data }) { const [dimension, setDimension] = useState<"status" | "warehouse">("status"); const units = data.units.data ?? []; const warehouses = new Map((data.warehouses.data ?? []).map((w) => [w.id, w.name])); const groups = Object.entries(Object.groupBy(units, (unit) => dimension === "status" ? statusLabel[unit.status] ?? unit.status : warehouses.get(unit.warehouseId ?? "") ?? "Без склада")); return <section className="bo-panel"><div className="bo-toolbar"><div><div className="bo-eyebrow">Конструктор отчёта</div><h2>Оборудование</h2></div><label>Строки <select value={dimension} onChange={(e) => setDimension(e.target.value as typeof dimension)}><option value="status">Статус</option><option value="warehouse">Склад</option></select></label></div><table className="bo-table"><thead><tr><th>{dimension === "status" ? "Статус" : "Склад"}</th><th>Количество</th><th>Стоимость</th></tr></thead><tbody>{groups.map(([name, rows]) => <tr key={name}><td>{name}</td><td>{rows?.length ?? 0}</td><td>{money((rows ?? []).reduce((sum, unit) => sum + (data.models.data?.find((model) => model.id === unit.modelId)?.unitCostEUR ?? 0), 0))}</td></tr>)}</tbody></table></section>; }

function PermissionsWorkspace({ data, commands, can }: { data: Data; commands: Commands; can: (...permissions: Permission[]) => boolean }) { const [draft, setDraft] = useState<Record<string, Permission[]>>({}); const roles = data.roles.data ?? []; const perms = PERMISSIONS.map((p) => p.key); const toggle = (role: People.RoleDTO, permission: Permission) => setDraft((current) => { const values = current[role.id] ?? role.permissions; return { ...current, [role.id]: values.includes(permission) ? values.filter((p) => p !== permission) : [...values, permission] }; }); return <section className="bo-panel"><div className="bo-toolbar"><div><div className="bo-eyebrow">Администрирование</div><h2>Матрица прав</h2></div><button className="bo-primary" disabled={!can("roles.manage")} onClick={() => Object.entries(draft).forEach(([id, permissions]) => commands.updateRole.mutate({ id, input: { permissions } }))}>Сохранить изменения</button></div><div className="bo-table-wrap"><table className="bo-table bo-table--matrix"><thead><tr><th>Код права</th>{roles.map((role) => <th key={role.id}>{role.name}</th>)}</tr></thead><tbody>{perms.map((permission) => <tr key={permission}><td className="bo-mono">{permission}</td>{roles.map((role) => { const checked = (draft[role.id] ?? role.permissions).includes(permission); return <td key={role.id}><button className={`bo-permission ${checked ? "bo-permission--full" : "bo-permission--none"}`} disabled={role.isOwner || !can("roles.manage")} onClick={() => toggle(role, permission)}>{checked ? "Да" : "Нет"}</button></td>; })}</tr>)}</tbody></table></div></section>; }
