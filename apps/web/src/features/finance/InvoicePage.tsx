import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Button, SectionTitle, Field, Input, Textarea, Loading, ErrorState, BrandLogo } from "../../ui-kit/index.ts";
import { useProject, useClients, useProjectInvoice } from "../projects/hooks.ts";
import "./invoice.css";

// One quotation line, in the SEVER document format: Name · Count · Price · Comment,
// grouped under a section (equipment type / "Команда" / custom).
interface Line {
  id: string;
  section: string;
  name: string;
  count: string;
  price: number;
  /** Internal cost (себестоимость) — for our accounting, never printed. */
  cost: number;
  comment: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: string) => (v === "" ? 0 : Number(v) || 0);
const uid = () => Math.random().toString(36).slice(2, 9);
const money = (n: number, cur: string) => `${new Intl.NumberFormat("ru-RU").format(round2(n))} ${cur}`;

interface Company { name: string; requisites: string; }
function loadCompany(): Company {
  try {
    const raw = localStorage.getItem("sever.invoice.company");
    if (raw) return JSON.parse(raw) as Company;
  } catch {
    /* ignore */
  }
  return { name: "SEVER", requisites: "" };
}

export function InvoicePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const project = useProject(id);
  const clients = useClients();
  const invoice = useProjectInvoice(id, true);

  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [lines, setLines] = useState<Line[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [company, setCompany] = useState<Company>(loadCompany);
  const [currency, setCurrency] = useState("EUR");
  const [number, setNumber] = useState("");
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [clientName, setClientName] = useState("");
  const [note, setNote] = useState("");

  // Prices are pre-filled from the project but fully editable before the document.
  useEffect(() => {
    if (!seeded && invoice.data) {
      setLines(
        invoice.data.rentalLines.map((l) => ({
          id: l.refId,
          section: l.section,
          name: l.label,
          count: String(l.qty),
          price: l.amountEUR,
          cost: l.costEUR,
          comment: l.detail,
        }))
      );
      setSeeded(true);
    }
  }, [invoice.data, seeded]);

  useEffect(() => {
    if (project.data && !number) setNumber(`СЧ-${dateStr.replace(/-/g, "")}-${id.slice(0, 4).toUpperCase()}`);
    if (project.data && !clientName) {
      const c = (clients.data ?? []).find((x) => x.id === project.data!.clientId);
      if (c) setClientName(c.name);
    }
  }, [project.data, clients.data, dateStr, id, number, clientName]);

  useEffect(() => {
    localStorage.setItem("sever.invoice.company", JSON.stringify(company));
  }, [company]);

  const total = useMemo(() => round2(lines.reduce((s, l) => s + l.price, 0)), [lines]);
  const costTotal = useMemo(() => round2(lines.reduce((s, l) => s + l.cost, 0)), [lines]);
  const margin = round2(total - costTotal);

  // Group lines into sections, preserving first-appearance order.
  const sections = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, Line[]>();
    for (const l of lines) {
      const key = l.section || "—";
      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key)!.push(l);
    }
    return order.map((s) => ({ section: s, items: map.get(s)! }));
  }, [lines]);

  if (project.isLoading || invoice.isLoading) return <Loading />;
  if (invoice.error) return <ErrorState error={invoice.error} onRetry={invoice.refetch} />;

  const setLine = (lid: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.id === lid ? { ...l, ...patch } : l)));
  const removeLine = (lid: string) => setLines((prev) => prev.filter((l) => l.id !== lid));
  const addLine = () =>
    setLines((prev) => [...prev, { id: uid(), section: prev[prev.length - 1]?.section ?? "Оборудование", name: "", count: "1", price: 0, cost: 0, comment: "" }]);
  const addCrew = () =>
    setLines((prev) => {
      const have = new Set(prev.map((l) => l.id));
      // Crew rates are our cost, so seed both price and cost from the rate.
      const crew = (invoice.data?.laborLines ?? [])
        .filter((l) => !have.has(l.refId))
        .map((l) => ({ id: l.refId, section: l.section, name: l.label, count: String(l.qty), price: l.amountEUR, cost: l.costEUR, comment: l.detail }));
      return [...prev, ...crew];
    });

  if (mode === "preview") {
    return (
      <div className="stack">
        <div className="row no-print">
          <Button variant="ghost" onClick={() => setMode("edit")}>← Редактировать</Button>
          <Button onClick={() => window.print()}>Печать / PDF</Button>
        </div>
        <div className="invoice-doc">
          <div className="row row--between" style={{ alignItems: "flex-start", marginBottom: 6 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <BrandLogo size={44} color="#111" />
                <div className="inv-brand">{company.name || "SEVER"}</div>
              </div>
              {company.requisites && <div className="muted" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{company.requisites}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="muted">{dateStr}</div>
              <div style={{ fontWeight: 700, color: "#111", marginTop: 2 }}>{number}</div>
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: "#222", marginBottom: 4 }}>
            <span><b>Client:</b> {clientName || "—"}</span>
            <span style={{ marginLeft: 14 }}><b>Project:</b> {project.data?.name ?? "—"}</span>
          </div>

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th className="num" style={{ width: 64 }}>Count</th>
                <th className="num" style={{ width: 96 }}>Price</th>
                <th style={{ width: "32%" }}>Comment</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((sec) => (
                <SectionBlock key={sec.section} section={sec.section} items={sec.items} currency={currency} />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>TOTAL</td>
                <td className="num" colSpan={2}>{money(total, currency)}</td>
              </tr>
            </tfoot>
          </table>
          {note && <div style={{ marginTop: 16, fontSize: 12, color: "#333", whiteSpace: "pre-wrap" }}>{note}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <Button variant="ghost" onClick={() => navigate(`/projects/${id}`)}>← К проекту</Button>
      <SectionTitle>Счёт за прокат</SectionTitle>

      <Card>
        <div className="row">
          <Field label="Номер"><Input value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
          <Field label="Дата"><Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} /></Field>
          <Field label="Валюта"><Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></Field>
        </div>
        <Field label="Исполнитель"><Input value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} /></Field>
        <Field label="Реквизиты / контакты (футер документа)"><Textarea value={company.requisites} onChange={(e) => setCompany({ ...company, requisites: e.target.value })} placeholder="Телефон, e-mail, ИНН, счёт — подставится в документ" /></Field>
        <Field label="Заказчик"><Input value={clientName} onChange={(e) => setClientName(e.target.value)} /></Field>
      </Card>

      <SectionTitle>Позиции</SectionTitle>
      <p className="card__subtitle" style={{ marginTop: -6 }}>Раздел (Sound / Lighting / …), название, кол-во, цена и комментарий. Цены подставлены — правь как нужно.</p>
      <div className="stack">
        {lines.map((l) => (
          <Card key={l.id}>
            <div className="row" style={{ gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Input value={l.section} onChange={(e) => setLine(l.id, { section: e.target.value })} placeholder="Раздел (Sound…)" />
              </div>
              <Button variant="ghost" onClick={() => removeLine(l.id)} aria-label="Удалить">✕</Button>
            </div>
            <div style={{ marginTop: 6 }}>
              <Input value={l.name} onChange={(e) => setLine(l.id, { name: e.target.value })} placeholder="Наименование" />
            </div>
            <div className="row" style={{ gap: 8, marginTop: 6 }}>
              <Field label="Кол-во"><Input value={l.count} onChange={(e) => setLine(l.id, { count: e.target.value })} placeholder="1" /></Field>
              <Field label={`Цена, ${currency}`}><Input type="number" step="0.01" value={l.price} onChange={(e) => setLine(l.id, { price: num(e.target.value) })} /></Field>
              <Field label="Себест."><Input type="number" step="0.01" value={l.cost} onChange={(e) => setLine(l.id, { cost: num(e.target.value) })} /></Field>
            </div>
            <div style={{ marginTop: 6 }}>
              <Input value={l.comment} onChange={(e) => setLine(l.id, { comment: e.target.value })} placeholder="Комментарий" />
            </div>
          </Card>
        ))}
      </div>

      <div className="row">
        <Button block variant="secondary" onClick={addLine}>+ Строка</Button>
        <Button block variant="secondary" onClick={addCrew}>+ Работа команды</Button>
      </div>

      <Card>
        <div className="row row--between">
          <span className="card__title">Клиенту (TOTAL)</span>
          <span className="card__title">{money(total, currency)}</span>
        </div>
        <div className="row row--between" style={{ marginTop: 6 }}>
          <span className="card__subtitle">Себестоимость (внутр.)</span>
          <span style={{ color: "var(--text)" }}>{money(costTotal, currency)}</span>
        </div>
        <div className="row row--between" style={{ marginTop: 2 }}>
          <span className="card__subtitle">Маржа</span>
          <span style={{ color: margin >= 0 ? "var(--ok)" : "var(--alert)" }}>{money(margin, currency)}</span>
        </div>
        <p className="card__subtitle" style={{ marginTop: 8 }}>Себестоимость — только для внутреннего учёта, в документ клиенту не попадает.</p>
      </Card>

      <Field label="Примечание / условия"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Сроки оплаты, условия аренды и т.п." /></Field>

      <Button block disabled={lines.length === 0} onClick={() => setMode("preview")}>Сформировать документ</Button>
    </div>
  );
}

function SectionBlock({ section, items, currency }: { section: string; items: Line[]; currency: string }) {
  return (
    <>
      <tr className="inv-section">
        <td colSpan={4}>{section}</td>
      </tr>
      {items.map((l) => (
        <tr key={l.id}>
          <td>{l.name || "—"}</td>
          <td className="num">{l.count}</td>
          <td className="num">{money(l.price, currency)}</td>
          <td className="muted">{l.comment}</td>
        </tr>
      ))}
    </>
  );
}
