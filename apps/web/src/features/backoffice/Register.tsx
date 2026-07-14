import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface RegisterColumn<T> {
  id: string;
  label: string;
  value: (row: T) => string | number;
  render?: (row: T) => ReactNode;
  align?: "left" | "right";
}

type SortDirection = "asc" | "desc" | null;
interface ColumnFilter { id: string; value: string }
interface SavedView {
  name: string;
  query: string;
  sortId: string;
  sortDirection: SortDirection;
  visible: string[];
  filters: ColumnFilter[];
}

export function Register<T>({ id, rows, columns, rowKey, onOpen, empty = "Нет записей", toolbar, externalQuery = "" }: {
  id: string;
  rows: T[];
  columns: RegisterColumn<T>[];
  rowKey: (row: T) => string;
  onOpen?: (row: T) => void;
  empty?: string;
  toolbar?: ReactNode;
  externalQuery?: string;
}) {
  const storageKey = `sever.backoffice.register.${id}`;
  const initial = (() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "null") as (SavedView & { descending?: boolean }) | null; } catch { return null; }
  })();
  const [query, setQuery] = useState(initial?.query ?? "");
  const [sortId, setSortId] = useState(initial?.sortId ?? "");
  const [sortDirection, setSortDirection] = useState<SortDirection>(initial?.sortDirection ?? (initial?.sortId ? (initial.descending ? "desc" : "asc") : null));
  const [filters, setFilters] = useState<ColumnFilter[]>(initial?.filters ?? []);
  const [visible, setVisible] = useState<string[]>(() => {
    const saved = initial?.visible ?? [];
    return saved.length ? [...saved, ...columns.map((column) => column.id).filter((columnId) => !saved.includes(columnId))] : columns.map((column) => column.id);
  });
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [showColumns, setShowColumns] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeColumns = columns.filter((column) => visible.includes(column.id));

  const filtered = useMemo(() => {
    const needle = [query, externalQuery].filter(Boolean).join(" ").trim().toLocaleLowerCase();
    let next = needle ? rows.filter((row) => columns.some((column) => String(column.value(row)).toLocaleLowerCase().includes(needle))) : [...rows];
    for (const filter of filters) {
      const column = columns.find((item) => item.id === filter.id);
      const value = filter.value.trim().toLocaleLowerCase();
      if (column && value) next = next.filter((row) => String(column.value(row)).toLocaleLowerCase().includes(value));
    }
    const column = sortDirection ? columns.find((item) => item.id === sortId) : null;
    if (column) next.sort((a, b) => String(column.value(a)).localeCompare(String(column.value(b)), "ru", { numeric: true }) * (sortDirection === "desc" ? -1 : 1));
    return next;
  }, [columns, externalQuery, filters, query, rows, sortDirection, sortId]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ name: "Моё представление", query, sortId, sortDirection, visible, filters } satisfies SavedView));
  }, [filters, query, sortDirection, sortId, storageKey, visible]);

  useEffect(() => {
    if (!showColumns && !openFilter) return;
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) { setShowColumns(false); setOpenFilter(null); } };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [openFilter, showColumns]);

  const cycleSort = (columnId: string) => {
    if (sortId !== columnId || sortDirection === null) { setSortId(columnId); setSortDirection("asc"); return; }
    if (sortDirection === "asc") { setSortDirection("desc"); return; }
    setSortId(""); setSortDirection(null);
  };
  const setColumnFilter = (columnId: string, value: string) => setFilters((current) => {
    const existing = current.findIndex((filter) => filter.id === columnId);
    if (!value) return existing < 0 ? current : current.filter((filter) => filter.id !== columnId);
    if (existing < 0) return [...current, { id: columnId, value }];
    return current.map((filter, index) => index === existing ? { ...filter, value } : filter);
  });
  const exportCsv = () => {
    const csv = [activeColumns.map((c) => c.label), ...filtered.map((row) => activeColumns.map((c) => String(c.value(row))))]
      .map((line) => line.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `${id}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return <section className="bo-panel bo-panel--register" data-testid={`register-${id}`}>
    <div className="bo-register-tools">
      <input aria-label="Поиск в реестре" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по всем полям" />
      <span>{filtered.length} из {rows.length}</span>
      {filters.length > 0 && <button className="bo-filter-reset" onClick={() => setFilters([])}>Сбросить фильтры ({filters.length})</button>}
      <button onClick={exportCsv}>Экспорт CSV</button>
      {toolbar}
    </div>
    <div className="bo-table-wrap"><table className="bo-table"><thead><tr>{activeColumns.map((column) => {
      const filterIndex = filters.findIndex((filter) => filter.id === column.id);
      const filterValue = filterIndex >= 0 ? filters[filterIndex]!.value : "";
      return <th key={column.id} style={{ textAlign: column.align }}>
        <div className="bo-column-head">
          <button className="bo-sort" aria-label={`Сортировать: ${column.label}`} onClick={() => cycleSort(column.id)}>{column.label}{sortId === column.id && sortDirection ? (sortDirection === "desc" ? " ↓" : " ↑") : ""}</button>
          <button className={`bo-filter-button ${filterIndex >= 0 ? "is-active" : ""}`} aria-label={`Фильтр: ${column.label}`} aria-expanded={openFilter === column.id} onClick={() => { setShowColumns(false); setOpenFilter((current) => current === column.id ? null : column.id); }}>⌯{filterIndex >= 0 && <sup>{filterIndex + 1}</sup>}</button>
          {openFilter === column.id && <div className="bo-filter-popover" ref={menuRef}><strong>{column.label}</strong><input autoFocus aria-label={`Значение фильтра ${column.label}`} value={filterValue} onChange={(event) => setColumnFilter(column.id, event.target.value)} placeholder="Содержит…"/><div><button onClick={() => { setColumnFilter(column.id, ""); setOpenFilter(null); }}>Сбросить</button><button className="bo-primary" onClick={() => setOpenFilter(null)}>Готово</button></div></div>}
        </div>
      </th>;
    })}<th className="bo-column-editor-head"><button className="bo-column-editor" aria-label="Настроить колонки" aria-expanded={showColumns} onClick={() => { setOpenFilter(null); setShowColumns((value) => !value); }}>✎</button>{showColumns && <div className="bo-column-picker" ref={menuRef}><strong>Видимые колонки</strong>{columns.map((column) => <label key={column.id}><input type="checkbox" checked={visible.includes(column.id)} onChange={() => setVisible((current) => current.includes(column.id) ? current.filter((columnId) => columnId !== column.id) : [...current, column.id])} /> {column.label}</label>)}</div>}</th></tr></thead><tbody>
      {filtered.map((row) => <tr key={rowKey(row)} tabIndex={onOpen ? 0 : undefined} onDoubleClick={() => onOpen?.(row)} onKeyDown={(event) => { if (event.key === "Enter") onOpen?.(row); }}>
        {activeColumns.map((column) => <td key={column.id} style={{ textAlign: column.align }} onClick={() => onOpen?.(row)}>{column.render ? column.render(row) : column.value(row)}</td>)}<td className="bo-column-editor-cell" />
      </tr>)}</tbody></table></div>
    {!filtered.length && <div className="bo-empty">{empty}</div>}
  </section>;
}
