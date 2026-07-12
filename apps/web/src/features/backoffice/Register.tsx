import { useEffect, useMemo, useState, type ReactNode } from "react";

export interface RegisterColumn<T> {
  id: string;
  label: string;
  value: (row: T) => string | number;
  render?: (row: T) => ReactNode;
  align?: "left" | "right";
}

interface SavedView {
  name: string;
  query: string;
  sortId: string;
  descending: boolean;
  visible: string[];
}

export function Register<T>({
  id,
  rows,
  columns,
  rowKey,
  onOpen,
  empty = "Нет записей",
  toolbar,
  externalQuery = "",
}: {
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
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "null") as SavedView | null; } catch { return null; }
  })();
  const [query, setQuery] = useState(initial?.query ?? "");
  const [sortId, setSortId] = useState(initial?.sortId ?? columns[0]?.id ?? "");
  const [descending, setDescending] = useState(initial?.descending ?? false);
  const [visible, setVisible] = useState<string[]>(() => {
    const saved = initial?.visible ?? [];
    return [...saved, ...columns.map((column) => column.id).filter((columnId) => !saved.includes(columnId))];
  });
  const [showColumns, setShowColumns] = useState(false);
  const activeColumns = columns.filter((column) => visible.includes(column.id));
  const filtered = useMemo(() => {
    const needle = [query, externalQuery].filter(Boolean).join(" ").trim().toLocaleLowerCase();
    const next = needle ? rows.filter((row) => columns.some((column) => String(column.value(row)).toLocaleLowerCase().includes(needle))) : [...rows];
    const column = columns.find((item) => item.id === sortId);
    if (column) next.sort((a, b) => String(column.value(a)).localeCompare(String(column.value(b)), "ru", { numeric: true }) * (descending ? -1 : 1));
    return next;
  }, [columns, descending, externalQuery, query, rows, sortId]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ name: "Моё представление", query, sortId, descending, visible } satisfies SavedView));
  }, [descending, query, sortId, storageKey, visible]);

  const exportCsv = () => {
    const csv = [activeColumns.map((c) => c.label), ...filtered.map((row) => activeColumns.map((c) => String(c.value(row))))]
      .map((line) => line.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `${id}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return <section className="bo-panel bo-panel--register">
    <div className="bo-register-tools">
      <input aria-label="Поиск в реестре" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по всем полям" />
      <span>{filtered.length} из {rows.length}</span>
      <button onClick={() => setShowColumns((value) => !value)}>Колонки</button>
      <button onClick={exportCsv}>Экспорт CSV</button>
      {toolbar}
    </div>
    {showColumns && <div className="bo-column-picker">{columns.map((column) => <label key={column.id}>
      <input type="checkbox" checked={visible.includes(column.id)} onChange={() => setVisible((current) => current.includes(column.id) ? current.filter((id) => id !== column.id) : [...current, column.id])} /> {column.label}
    </label>)}</div>}
    <div className="bo-table-wrap"><table className="bo-table"><thead><tr>{activeColumns.map((column) => <th key={column.id} style={{ textAlign: column.align }}>
      <button className="bo-sort" onClick={() => { if (sortId === column.id) setDescending((value) => !value); else { setSortId(column.id); setDescending(false); } }}>
        {column.label}{sortId === column.id ? (descending ? " ↓" : " ↑") : ""}
      </button>
    </th>)}</tr></thead><tbody>
      {filtered.map((row) => <tr key={rowKey(row)} tabIndex={0} onDoubleClick={() => onOpen?.(row)} onKeyDown={(event) => { if (event.key === "Enter") onOpen?.(row); }}>
        {activeColumns.map((column) => <td key={column.id} style={{ textAlign: column.align }} onClick={() => onOpen?.(row)}>{column.render ? column.render(row) : column.value(row)}</td>)}
      </tr>)}
    </tbody></table></div>
    {!filtered.length && <div className="bo-empty">{empty}</div>}
  </section>;
}
