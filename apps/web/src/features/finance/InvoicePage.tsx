import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Currency } from "@sever/contracts";
import { Card, Button, SectionTitle, Field, Input, Textarea, Select, Loading, ErrorState, BrandLogo } from "../../ui-kit/index.ts";
import { useProject, useClients, useProjectInvoice } from "../projects/hooks.ts";
import { useFxRates } from "./hooks.ts";
import "./invoice.css";

// One quotation line, in the SEVER document format: Name · Count · Price · Comment,
// grouped under a section (equipment type / "Crew" / custom).
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
const money = (n: number, cur: string) => `${new Intl.NumberFormat("en-US").format(round2(n))} ${cur}`;
const amount = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(round2(n));
type InvoiceLang = "EN" | "RU" | "RS";
const DOC_LABELS: Record<InvoiceLang, { title: string; date: string; place: string; name: string; count: string; price: string; comment: string; total: string; contacts: string; phone: string; email: string; telegram: string }> = {
  EN: { title: "Purchase Order", date: "Date", place: "Place", name: "Name", count: "Count", price: "Price", comment: "Comment", total: "TOTAL:", contacts: "Contacts", phone: "Phone", email: "Email", telegram: "Telegram" },
  RU: { title: "Смета", date: "Дата", place: "Место", name: "Название", count: "Кол-во", price: "Цена", comment: "Комментарий", total: "ИТОГО:", contacts: "Контакты", phone: "Телефон", email: "Email", telegram: "Telegram" },
  RS: { title: "Ponuda", date: "Datum", place: "Mesto", name: "Naziv", count: "Količina", price: "Cena", comment: "Komentar", total: "UKUPNO:", contacts: "Kontakti", phone: "Telefon", email: "Email", telegram: "Telegram" },
};

interface Company { name: string; requisites: string; phone: string; email: string; telegram: string; }
function loadCompany(): Company {
  try {
    const raw = localStorage.getItem("sever.invoice.company");
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Company>;
      return {
        name: parsed.name ?? "SEVER",
        requisites: parsed.requisites ?? "",
        phone: parsed.phone ?? "+381 62 852 5240",
        email: parsed.email ?? "sever.beo.contact@gmail.com",
        telegram: parsed.telegram ?? "@sever_contact",
      };
    }
  } catch {
    /* ignore */
  }
  return {
    name: "SEVER",
    requisites: "",
    phone: "+381 62 852 5240",
    email: "sever.beo.contact@gmail.com",
    telegram: "@sever_contact",
  };
}

export function InvoicePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const project = useProject(id);
  const clients = useClients();
  const invoice = useProjectInvoice(id, true);
  const fx = useFxRates();

  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [lines, setLines] = useState<Line[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [company, setCompany] = useState<Company>(loadCompany);
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [lang, setLang] = useState<InvoiceLang>("EN");
  const [number, setNumber] = useState("");
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [clientName, setClientName] = useState("");
  const [place, setPlace] = useState("");
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
    if (project.data && !number) setNumber(`EST-${dateStr.replace(/-/g, "")}-${id.slice(0, 4).toUpperCase()}`);
    if (project.data && !clientName) {
      const c = (clients.data ?? []).find((x) => x.id === project.data!.clientId);
      if (c) setClientName(c.name);
    }
    if (project.data && !place) setPlace(project.data.name);
  }, [project.data, clients.data, dateStr, id, number, clientName, place]);

  useEffect(() => {
    localStorage.setItem("sever.invoice.company", JSON.stringify(company));
  }, [company]);

  const fxRateToEUR = currency === "EUR" ? 1 : (fx.data ?? []).find((r) => r.currency === currency)?.rateToEUR ?? null;
  const convert = (valueEUR: number) => (fxRateToEUR ? round2(valueEUR / fxRateToEUR) : valueEUR);
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
    setLines((prev) => [...prev, { id: uid(), section: prev[prev.length - 1]?.section ?? "Equipment", name: "", count: "1", price: 0, cost: 0, comment: "" }]);
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
    const displayDate = dateStr.slice(5).replace("-", ".");
    const labels = DOC_LABELS[lang];
    const canConvert = fxRateToEUR !== null;
    const printOrOpen = () => {
      const tg = (window as { Telegram?: { WebApp?: { openLink?: (url: string) => void } } }).Telegram?.WebApp;
      if (tg?.openLink) {
        tg.openLink(window.location.href);
        return;
      }
      window.print();
    };
    return (
      <div className="stack">
        <div className="row no-print">
          <Button variant="ghost" onClick={() => setMode("edit")}>← Редактировать</Button>
          <Select value={lang} onChange={(e) => setLang(e.target.value as InvoiceLang)} options={[{ value: "EN", label: "EN" }, { value: "RU", label: "RU" }, { value: "RS", label: "RS" }]} />
          <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} options={[{ value: "EUR", label: "EUR" }, { value: "RSD", label: "RSD" }, { value: "RUB", label: "RUB" }]} />
          <Button onClick={printOrOpen}>Печать / PDF</Button>
        </div>
        {!canConvert && (
          <p className="card__subtitle no-print" style={{ color: "var(--warn)" }}>
            Для {currency} не задан курс в Settings → FX. В документе показаны суммы без конвертации.
          </p>
        )}
        <div className="invoice-doc">
          <div className="estimate-head">
            <div className="estimate-info">
              <div className="estimate-title">{labels.title}</div>
              <div className="estimate-field">
                <div>{labels.date}</div>
                <strong>{displayDate}</strong>
              </div>
              <div className="estimate-field estimate-field--tall">
                <div>{labels.place}</div>
                <strong>{place || project.data?.name || "—"}</strong>
              </div>
            </div>
            <div className="estimate-logo">
              <BrandLogo size={170} color="#000" />
            </div>
          </div>

          <table className="estimate-table">
            <thead>
              <tr>
                <th>{labels.name}</th>
                <th className="num" style={{ width: 64 }}>{labels.count}</th>
                <th className="num" style={{ width: 96 }}>{labels.price}</th>
                <th style={{ width: "32%" }}>{labels.comment}</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((sec) => (
                <SectionBlock key={sec.section} section={sec.section} items={sec.items} convert={convert} />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td></td>
                <td className="total-label">{labels.total}</td>
                <td className="total-amount">{new Intl.NumberFormat("en-US").format(convert(total))}</td>
                <td className="total-currency">{currency}</td>
              </tr>
            </tfoot>
          </table>

          {note && <div className="estimate-note">{note}</div>}

          <table className="contacts-table">
            <tbody>
              <tr><th colSpan={2}>{labels.contacts}</th></tr>
              <tr><td>{labels.phone}</td><td>{company.phone}</td></tr>
              <tr><td>{labels.email}</td><td>{company.email}</td></tr>
              <tr><td>{labels.telegram}</td><td className="contact-link">{company.telegram}</td></tr>
            </tbody>
          </table>
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
          <Field label="Валюта"><Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} options={[{ value: "EUR", label: "EUR" }, { value: "RSD", label: "RSD" }, { value: "RUB", label: "RUB" }]} /></Field>
        </div>
        <Field label="Исполнитель"><Input value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} /></Field>
        <Field label="Заказчик"><Input value={clientName} onChange={(e) => setClientName(e.target.value)} /></Field>
        <Field label="Place в смете"><Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Villa Viko" /></Field>
        <div className="row">
          <Field label="Phone"><Input value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} /></Field>
          <Field label="Email"><Input value={company.email} onChange={(e) => setCompany({ ...company, email: e.target.value })} /></Field>
        </div>
        <Field label="Telegram"><Input value={company.telegram} onChange={(e) => setCompany({ ...company, telegram: e.target.value })} /></Field>
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
              <Field label="Цена, EUR"><Input type="number" step="0.01" value={l.price} onChange={(e) => setLine(l.id, { price: num(e.target.value) })} /></Field>
              <Field label="Себест., EUR"><Input type="number" step="0.01" value={l.cost} onChange={(e) => setLine(l.id, { cost: num(e.target.value) })} /></Field>
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
          <span className="card__title">{money(total, "EUR")}</span>
        </div>
        <div className="row row--between" style={{ marginTop: 6 }}>
          <span className="card__subtitle">Себестоимость (внутр.)</span>
          <span style={{ color: "var(--text)" }}>{money(costTotal, "EUR")}</span>
        </div>
        <div className="row row--between" style={{ marginTop: 2 }}>
          <span className="card__subtitle">Маржа</span>
          <span style={{ color: margin >= 0 ? "var(--ok)" : "var(--alert)" }}>{money(margin, "EUR")}</span>
        </div>
        <p className="card__subtitle" style={{ marginTop: 8 }}>Себестоимость — только для внутреннего учёта, в документ клиенту не попадает.</p>
      </Card>

      <Field label="Примечание / условия"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Сроки оплаты, условия аренды и т.п." /></Field>

      <Button block disabled={lines.length === 0} onClick={() => setMode("preview")}>Сформировать документ</Button>
    </div>
  );
}

function sectionTone(section: string): string {
  const key = section.toLowerCase();
  if (key.includes("sound")) return "sound";
  if (key.includes("light")) return "lighting";
  if (key.includes("other")) return "other";
  if (key.includes("staff") || key.includes("crew")) return "staff";
  if (key.includes("delivery") || key.includes("transport")) return "delivery";
  return "default";
}

function SectionBlock({ section, items, convert }: { section: string; items: Line[]; convert: (valueEUR: number) => number }) {
  return (
    <>
      <tr className={`inv-section inv-section--${sectionTone(section)}`}>
        <td colSpan={4}>{section}</td>
      </tr>
      {items.map((l) => (
        <tr key={l.id}>
          <td>{l.name || "—"}</td>
          <td className="num">{l.count}</td>
          <td className="num">{amount(convert(l.price))}</td>
          <td className="muted">{l.comment}</td>
        </tr>
      ))}
    </>
  );
}
