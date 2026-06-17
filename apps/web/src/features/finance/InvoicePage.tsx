import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Button, SectionTitle, Field, Input, Textarea, Loading, ErrorState } from "../../ui-kit/index.ts";
import { eur } from "../../lib/labels.ts";
import { useProject, useClients, useProjectInvoice } from "../projects/hooks.ts";
import "./invoice.css";

interface Line {
  id: string;
  description: string;
  qty: number;
  unitEUR: number;
  periods: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const amountOf = (l: Line) => round2(l.qty * l.unitEUR * l.periods);
const num = (v: string) => (v === "" ? 0 : Number(v) || 0);
const uid = () => Math.random().toString(36).slice(2, 9);

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
  const [number, setNumber] = useState("");
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [clientName, setClientName] = useState("");
  const [note, setNote] = useState("");

  // Seed editable lines from the computed rental positions once, prices filled
  // in but fully editable before the document is generated.
  useEffect(() => {
    if (!seeded && invoice.data) {
      setLines(
        invoice.data.rentalLines.map((l) => ({
          id: l.refId,
          description: l.label,
          qty: l.qty,
          unitEUR: l.unitEUR,
          periods: l.periods,
        }))
      );
      setSeeded(true);
    }
  }, [invoice.data, seeded]);

  useEffect(() => {
    if (project.data && !number) {
      setNumber(`СЧ-${dateStr.replace(/-/g, "")}-${id.slice(0, 4).toUpperCase()}`);
    }
    if (project.data && !clientName) {
      const c = (clients.data ?? []).find((x) => x.id === project.data!.clientId);
      if (c) setClientName(c.name);
    }
  }, [project.data, clients.data, dateStr, id, number, clientName]);

  useEffect(() => {
    localStorage.setItem("sever.invoice.company", JSON.stringify(company));
  }, [company]);

  const total = useMemo(() => round2(lines.reduce((s, l) => s + amountOf(l), 0)), [lines]);

  if (project.isLoading || invoice.isLoading) return <Loading />;
  if (invoice.error) return <ErrorState error={invoice.error} onRetry={invoice.refetch} />;

  const setLine = (lid: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.id === lid ? { ...l, ...patch } : l)));
  const removeLine = (lid: string) => setLines((prev) => prev.filter((l) => l.id !== lid));
  const addLine = () => setLines((prev) => [...prev, { id: uid(), description: "", qty: 1, unitEUR: 0, periods: 1 }]);
  const addCrew = () =>
    setLines((prev) => {
      const have = new Set(prev.map((l) => l.id));
      const crew = (invoice.data?.laborLines ?? [])
        .filter((l) => !have.has(l.refId))
        .map((l) => ({ id: l.refId, description: `${l.label}${l.detail ? ` — ${l.detail}` : ""}`, qty: l.qty, unitEUR: l.unitEUR, periods: l.periods }));
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
          <div className="row row--between" style={{ alignItems: "flex-start" }}>
            <div>
              <h1>{company.name || "—"}</h1>
              {company.requisites && <div className="muted" style={{ whiteSpace: "pre-wrap" }}>{company.requisites}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#111" }}>Счёт {number}</div>
              <div className="muted">от {dateStr}</div>
            </div>
          </div>
          <div style={{ marginTop: 14, fontSize: 13, color: "#222" }}>
            <div><b>Заказчик:</b> {clientName || "—"}</div>
            <div><b>Проект:</b> {project.data?.name ?? "—"}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th style={{ width: 24 }}>#</th>
                <th>Наименование</th>
                <th className="num">Кол-во</th>
                <th className="num">Цена</th>
                <th className="num">Период</th>
                <th className="num">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.id}>
                  <td>{i + 1}</td>
                  <td>{l.description || "—"}</td>
                  <td className="num">{l.qty}</td>
                  <td className="num">{eur(l.unitEUR)}</td>
                  <td className="num">{l.periods}</td>
                  <td className="num">{eur(amountOf(l))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>Итого</td>
                <td className="num">{eur(total)}</td>
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
        </div>
        <Field label="Исполнитель"><Input value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} /></Field>
        <Field label="Реквизиты исполнителя"><Textarea value={company.requisites} onChange={(e) => setCompany({ ...company, requisites: e.target.value })} placeholder="ИНН, счёт, контакты — подставится в документ" /></Field>
        <Field label="Заказчик"><Input value={clientName} onChange={(e) => setClientName(e.target.value)} /></Field>
      </Card>

      <SectionTitle>Позиции</SectionTitle>
      <div className="stack">
        {lines.map((l) => (
          <Card key={l.id}>
            <Input value={l.description} onChange={(e) => setLine(l.id, { description: e.target.value })} placeholder="Наименование позиции" />
            <div className="inv-line-grid">
              <input className="input" type="number" min="0" step="1" value={l.qty} onChange={(e) => setLine(l.id, { qty: num(e.target.value) })} aria-label="Кол-во" />
              <input className="input" type="number" min="0" step="0.01" value={l.unitEUR} onChange={(e) => setLine(l.id, { unitEUR: num(e.target.value) })} aria-label="Цена €" />
              <input className="input" type="number" min="1" step="1" value={l.periods} onChange={(e) => setLine(l.id, { periods: num(e.target.value) })} aria-label="Период" />
              <Button variant="ghost" onClick={() => removeLine(l.id)} aria-label="Удалить">✕</Button>
            </div>
            <p className="card__subtitle" style={{ marginTop: 6 }}>
              {l.qty} × {eur(l.unitEUR)} × {l.periods} = <b style={{ color: "var(--text)" }}>{eur(amountOf(l))}</b>
            </p>
          </Card>
        ))}
        <p className="card__subtitle" style={{ textAlign: "center" }}>колонки: кол-во · цена € · период (сутки)</p>
      </div>

      <div className="row">
        <Button block variant="secondary" onClick={addLine}>+ Строка</Button>
        <Button block variant="secondary" onClick={addCrew}>+ Работа команды</Button>
      </div>

      <Card>
        <div className="row row--between">
          <span className="card__title">Итого</span>
          <span className="card__title">{eur(total)}</span>
        </div>
      </Card>

      <Field label="Примечание / условия"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Сроки оплаты, условия аренды и т.п." /></Field>

      <Button block disabled={lines.length === 0} onClick={() => setMode("preview")}>Сформировать документ</Button>
    </div>
  );
}
