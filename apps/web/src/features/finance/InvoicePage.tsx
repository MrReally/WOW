import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Currency, Finance } from "@sever/contracts";
import { amountAfterDiscountEUR, formatDateValue } from "@sever/contracts";
import { Card, Button, Field, Input, Textarea, Select, Loading, ErrorState, BrandLogo, Chip } from "../../ui-kit/index.ts";
import { authenticatedFetch } from "../../lib/api.ts";
import { platform } from "../../app/platform/telegram.ts";
import { useSession } from "../../app/session.ts";
import { useProject, useClients, useProjectInvoice } from "../projects/hooks.ts";
import { useVenues } from "../plans/hooks.ts";
import { useCreateInvoiceVersion, useFxRates, useInvoiceCompanySettings, useInvoiceVersions, useProjectEstimateLines, useProjectEstimateSettings, useReplaceProjectEstimateLines, useSetInvoiceCompanySettings } from "./hooks.ts";
import "./invoice.css";
import { useDateFormatSettings } from "../../app/dateFormat.tsx";

interface Line {
  id: string;
  source: Finance.ProjectEstimateLineSource;
  sourceRefId: string | null;
  section: string;
  name: string;
  count: string;
  price: number;
  rawPrice: number;
  discountType: Finance.DiscountType;
  discountValue: number;
  cost: number;
  comment: string;
  hidden: boolean;
}

interface Company { name: string; requisites: string; phone: string; email: string; telegram: string; }
interface StoredInvoiceVersion {
  id: string;
  projectId: string;
  number: string;
  date: string;
  place: string;
  clientName: string;
  totalEUR: number;
  currency: Currency;
  lang: InvoiceLang;
  createdAt: string;
  lines: Line[];
  totalDiscountType: Finance.DiscountType;
  totalDiscountValue: number;
  note?: string;
}

type InvoiceLang = Finance.InvoiceLang;
type Panel = "doc" | "lines" | "summary";

const round2 = (n: number) => Math.round(n * 100) / 100;
const uid = () => Math.random().toString(36).slice(2, 9);
const money = (n: number, cur = "EUR") => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(round2(n))} ${cur}`;
const amount = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(round2(n));
const cleanText = (value: string) => value.trim().replace(/\s+/g, " ");

const DOC_LABELS: Record<InvoiceLang, { title: string; date: string; place: string; name: string; count: string; price: string; comment: string; discount: string; total: string; contacts: string; phone: string; email: string; telegram: string }> = {
  EN: { title: "Purchase Order", date: "Date", place: "Place", name: "Name", count: "Count", price: "Price", comment: "Comment", discount: "DISCOUNT:", total: "TOTAL:", contacts: "Contacts", phone: "Phone", email: "Email", telegram: "Telegram" },
  RU: { title: "Смета", date: "Дата", place: "Место", name: "Название", count: "Кол-во", price: "Цена", comment: "Комментарий", discount: "СКИДКА:", total: "ИТОГО:", contacts: "Контакты", phone: "Телефон", email: "Email", telegram: "Telegram" },
  RS: { title: "Ponuda", date: "Datum", place: "Mesto", name: "Naziv", count: "Količina", price: "Cena", comment: "Komentar", discount: "POPUST:", total: "UKUPNO:", contacts: "Kontakti", phone: "Telefon", email: "Email", telegram: "Telegram" },
};

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
  return { name: "SEVER", requisites: "", phone: "+381 62 852 5240", email: "sever.beo.contact@gmail.com", telegram: "@sever_contact" };
}

export function InvoicePage() {
  const dateTimeSettings = useDateFormatSettings();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { can } = useSession();
  const canManageFinance = can("finance.manage");
  const project = useProject(id);
  const clients = useClients();
  const invoice = useProjectInvoice(id, true);
  const venues = useVenues();
  const fx = useFxRates();
  const companySettings = useInvoiceCompanySettings();
  const setCompanySettings = useSetInvoiceCompanySettings();
  const serverVersions = useInvoiceVersions(id);
  const createVersion = useCreateInvoiceVersion(id);
  const estimateLines = useProjectEstimateLines(id);
  const estimateSettings = useProjectEstimateSettings(id);
  const replaceEstimateLines = useReplaceProjectEstimateLines(id);

  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [panel, setPanel] = useState<Panel>("lines");
  const [lines, setLines] = useState<Line[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [company, setCompany] = useState<Company>(loadCompany);
  const [companyTouched, setCompanyTouched] = useState(false);
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [lang, setLang] = useState<InvoiceLang>("EN");
  const [number, setNumber] = useState("");
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [clientName, setClientName] = useState("");
  const [place, setPlace] = useState("");
  const [placeTouched, setPlaceTouched] = useState(false);
  const [note, setNote] = useState("");
  const [versions, setVersions] = useState<StoredInvoiceVersion[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [mergeName, setMergeName] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);

  useEffect(() => {
    setSeeded(false);
    setSelectedLineIds([]);
    setMergeOpen(false);
  }, [id]);

  useEffect(() => {
    try {
      setVersions(JSON.parse(localStorage.getItem(`sever.invoice.versions.${id}`) || "[]"));
    } catch {
      setVersions([]);
    }
  }, [id]);

  useEffect(() => {
    if (!companySettings.data || companyTouched) return;
    setCompany(companySettings.data);
  }, [companySettings.data, companyTouched]);

  useEffect(() => {
    if (!serverVersions.data) return;
    setVersions(serverVersions.data.map(versionFromDTO));
  }, [serverVersions.data]);

  useEffect(() => {
    if (!seeded && invoice.data && estimateLines.data) {
      const saved = estimateLines.data;
      const invoiceSource = saved.length > 0 ? invoice.data.rentalLines : [...invoice.data.rentalLines, ...invoice.data.laborLines];
      const visible = invoiceSource.map((l) => {
        const stored = saved.find((line) => line.id === l.refId || line.sourceRefId === l.refId);
        return {
          id: stored?.id ?? l.refId,
          source: stored?.source ?? (l.section === "Crew" ? "labor" : "equipment"),
          sourceRefId: stored?.sourceRefId ?? l.refId,
          section: l.section,
          name: l.label,
          count: String(l.qty),
          price: l.amountEUR,
          rawPrice: stored?.priceEUR ?? l.amountEUR,
          discountType: stored?.discountType ?? "percent",
          discountValue: stored?.discountValue ?? 0,
          cost: l.costEUR,
          comment: l.detail,
          hidden: false,
        } satisfies Line;
      });
      const rsdRateToEUR = (fx.data ?? []).find((rate) => rate.currency === "RSD")?.rateToEUR ?? 0;
      const hidden = saved.filter((line) => line.hidden).map((line) => lineFromEstimate(line, rsdRateToEUR));
      setLines([...visible, ...hidden]);
      setSeeded(true);
    }
  }, [invoice.data, estimateLines.data, fx.data, seeded]);

  useEffect(() => {
    if (project.data && !number) setNumber(`EST-${dateStr.replace(/-/g, "")}-${id.slice(0, 4).toUpperCase()}`);
    if (project.data && !clientName) {
      const c = (clients.data ?? []).find((x) => x.id === project.data!.clientId);
      if (c) setClientName(c.name);
    }
    if (project.data && !placeTouched && (!project.data.venueId || venues.data)) {
      const venue = (venues.data ?? []).find((x) => x.id === project.data!.venueId);
      setPlace(venue?.name ?? "");
    }
  }, [project.data, clients.data, venues.data, dateStr, id, number, clientName, placeTouched]);

  useEffect(() => {
    localStorage.setItem("sever.invoice.company", JSON.stringify(company));
  }, [company]);

  const fxRateToEUR = currency === "EUR" ? 1 : (fx.data ?? []).find((r) => r.currency === currency)?.rateToEUR ?? null;
  const convert = (valueEUR: number) => (fxRateToEUR ? round2(valueEUR / fxRateToEUR) : valueEUR);
  const visibleLines = useMemo(() => lines.filter((line) => !line.hidden), [lines]);
  const subtotal = useMemo(() => round2(visibleLines.reduce((s, l) => s + l.price, 0)), [visibleLines]);
  const totalDiscountEUR = Math.min(subtotal, invoice.data?.discountEUR ?? 0);
  const total = round2(subtotal - totalDiscountEUR);
  const costTotal = useMemo(() => round2(visibleLines.reduce((s, l) => s + l.cost, 0)), [visibleLines]);
  const margin = round2(total - costTotal);
  const normalizedLines = useMemo(() => visibleLines.map((l) => ({
    ...l,
    section: cleanText(l.section) || "Equipment",
    name: cleanText(l.name),
    count: cleanText(l.count) || "1",
    comment: l.comment.trim(),
  })), [visibleLines]);
  const sections = useMemo(() => groupLines(normalizedLines), [normalizedLines]);

  if (project.isLoading || invoice.isLoading) return <Loading />;
  if (invoice.error) return <ErrorState error={invoice.error} onRetry={invoice.refetch} />;

  const saveCompany = (patch: Partial<Company>) => {
    const next = { ...company, ...patch };
    setCompanyTouched(true);
    setCompany(next);
    setCompanySettings.mutate(next);
  };
  const payload = (): Finance.EstimatePdfRequestDTO => ({
    number: number.trim(),
    date: dateStr,
    place: place.trim(),
    clientName: clientName.trim(),
    company,
    lang,
    currency,
    rateToEUR: fxRateToEUR,
    note,
    totalDiscountEUR,
    lines: normalizedLines.map((l) => ({ id: l.id, section: l.section, name: l.name, count: l.count, priceEUR: l.price, costEUR: l.cost, comment: l.comment })),
  });
  const saveVersion = async () => {
    const version: StoredInvoiceVersion = {
      id: uid(),
      projectId: id,
      number: number.trim(),
      date: dateStr,
      place: place.trim(),
      clientName: clientName.trim(),
      totalEUR: total,
      currency,
      lang,
      createdAt: new Date().toISOString(),
      lines: normalizedLines,
      totalDiscountType: estimateSettings.data?.totalDiscountType ?? "percent",
      totalDiscountValue: estimateSettings.data?.totalDiscountValue ?? 0,
      note,
    };
    const next = [version, ...versions].slice(0, 20);
    setVersions(next);
    localStorage.setItem(`sever.invoice.versions.${id}`, JSON.stringify(next));
    createVersion.mutate({
      number: version.number,
      date: version.date,
      place: version.place,
      clientName: version.clientName,
      totalEUR: version.totalEUR,
      currency: version.currency,
      lang: version.lang,
      lines: normalizedLines.map((l) => ({
        id: l.id,
        section: l.section,
        name: l.name,
        count: l.count,
        priceEUR: l.price,
        costEUR: l.cost,
        comment: l.comment,
      })),
      totalDiscountType: version.totalDiscountType,
      totalDiscountValue: version.totalDiscountValue,
      note: version.note ?? "",
    });
    return version;
  };
  const preview = async () => {
    setLines(normalizedLines);
    await saveVersion();
    setMode("preview");
  };
  const restoreVersion = (v: StoredInvoiceVersion) => {
    setNumber(v.number);
    setDateStr(v.date);
    setPlace(v.place);
    setPlaceTouched(true);
    setClientName(v.clientName);
    setCurrency(v.currency);
    setLang(v.lang);
    setLines(v.lines.map((line) => ({ ...line, source: line.source ?? "manual", sourceRefId: line.sourceRefId ?? null, hidden: line.hidden ?? false })));
    setNote(v.note ?? "");
    setPanel("lines");
  };
  const downloadPdf = async () => {
    if (fxRateToEUR === null) {
      setPdfError(`Для ${currency} не задан курс в Settings.`);
      return;
    }
    setPdfBusy(true);
    setPdfError("");
    try {
      await saveVersion();
      const telegramDelivery = platform.kind === "telegram";
      const res = await authenticatedFetch(`/api/projects/${id}/invoice/pdf${telegramDelivery ? "/telegram" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      if (telegramDelivery) {
        platform.haptic("medium");
        return;
      }
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "estimate.pdf";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "PDF error");
    } finally {
      setPdfBusy(false);
    }
  };
  const selectedLines = visibleLines.filter((line) => selectedLineIds.includes(line.id));
  const selectedPrice = round2(selectedLines.reduce((sum, line) => sum + line.price, 0));
  const selectedCost = round2(selectedLines.reduce((sum, line) => sum + line.cost, 0));
  const persistMergedLine = () => {
    const name = cleanText(mergeName);
    if (!name || selectedLines.length < 2) return;
    const selectedIds = new Set(selectedLineIds);
    const retained = lines.flatMap((line) => {
      if (!selectedIds.has(line.id)) return [line];
      return line.source === "manual" ? [] : [{ ...line, hidden: true }];
    });
    const commonSection = selectedLines.every((line) => line.section === selectedLines[0]?.section)
      ? selectedLines[0]!.section
      : "Услуги";
    const next: Line[] = [...retained, {
      id: `manual-merge-${Date.now()}`,
      source: "manual",
      sourceRefId: null,
      section: commonSection,
      name,
      count: "1",
      price: selectedPrice,
      rawPrice: selectedPrice,
      discountType: "percent",
      discountValue: 0,
      cost: selectedCost,
      comment: "",
      hidden: false,
    }];
    replaceEstimateLines.mutate(next.map(lineToEstimateInput), {
      onSuccess: (saved) => {
        const rsdRateToEUR = (fx.data ?? []).find((rate) => rate.currency === "RSD")?.rateToEUR ?? 0;
        setLines(saved.map((line) => lineFromEstimate(line, rsdRateToEUR)));
        setSelectedLineIds([]);
        setMergeName("");
        setMergeOpen(false);
      },
    });
  };

  if (mode === "preview") {
    const labels = DOC_LABELS[lang];
    const canConvert = fxRateToEUR !== null;
    return (
      <div className="stack">
        <InvoiceTopbar
          lang={lang}
          currency={currency}
          onLang={setLang}
          onCurrency={setCurrency}
          onBack={() => setMode("edit")}
          onPdf={downloadPdf}
          pdfBusy={pdfBusy}
          canConvert={canConvert}
        />
        {!canConvert && <p className="card__subtitle no-print" style={{ color: "var(--warn)" }}>Для {currency} не задан курс в Settings.</p>}
        {pdfError && <p className="card__subtitle no-print" style={{ color: "var(--alert)" }}>{pdfError}</p>}
        <PrintableInvoice labels={labels} formattedDate={formatDateValue(dateStr, dateTimeSettings, lang === "EN" ? "en-US" : lang === "RS" ? "sr-RS" : "ru-RU")} place={place} sections={sections} convert={convert} subtotal={subtotal} totalDiscountEUR={totalDiscountEUR} total={total} currency={currency} note={note} company={company} />
      </div>
    );
  }

  return (
    <div className="stack invoice-workspace">
      <button className="icon-text-action" onClick={() => navigate(`/projects/${id}`)} aria-label="К проекту">
        <span>←</span><span>Проект</span>
      </button>

      <Card>
        <div className="row row--between">
          <div>
            <p className="card__title">Смета</p>
            <p className="card__subtitle">{clientName || "Клиент"} · {place || "Place"}</p>
          </div>
          <Chip label={money(convert(total), currency)} tone="accent" />
        </div>
        <div className="invoice-mini-metrics">
          <Metric label="Строк" value={String(visibleLines.length)} />
          <Metric label="Себес" value={money(costTotal)} />
          <Metric label="Маржа" value={money(margin)} tone={margin >= 0 ? "var(--ok)" : "var(--alert)"} />
        </div>
      </Card>

      <div className="invoice-tabbar">
        {(["doc", "lines", "summary"] as Panel[]).map((p) => (
          <button key={p} className={`invoice-tab ${panel === p ? "invoice-tab--active" : ""}`} onClick={() => setPanel(p)} type="button">
            {p === "doc" ? "Документ" : p === "lines" ? "Позиции" : "Итог"}
          </button>
        ))}
      </div>

      {panel === "doc" && (
        <Card>
          <div className="row">
            <Field label="Номер"><Input value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
            <Field label="Дата"><Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} /></Field>
          </div>
          <div className="row">
            <Field label="Язык"><Select value={lang} onChange={(e) => setLang(e.target.value as InvoiceLang)} options={langOptions} /></Field>
            <Field label="Валюта"><Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} options={currencyOptions} /></Field>
          </div>
          <Field label="Заказчик"><Input value={clientName} onChange={(e) => setClientName(e.target.value)} /></Field>
          <Field label="Place"><Input value={place} onChange={(e) => { setPlaceTouched(true); setPlace(e.target.value); }} placeholder="Villa Viko" /></Field>
          <div className="row">
            <Field label="Phone"><Input value={company.phone} onChange={(e) => saveCompany({ phone: e.target.value })} /></Field>
            <Field label="Email"><Input value={company.email} onChange={(e) => saveCompany({ email: e.target.value })} /></Field>
          </div>
          <Field label="Telegram"><Input value={company.telegram} onChange={(e) => saveCompany({ telegram: e.target.value })} /></Field>
        </Card>
      )}

      {panel === "lines" && (
        <>
          <p className="card__subtitle">Цены и себестоимость редактируются в «€». Здесь можно объединить несколько строк и задать клиентское название.</p>
          {canManageFinance && <Card>
            <div className="invoice-merge-toolbar">
              <div>
                <p className="card__title">Объединить позиции</p>
                <p className="card__subtitle">Выбрано: {selectedLines.length} · Ц {money(selectedPrice)} · СС {money(selectedCost)}</p>
              </div>
              <Button variant="secondary" disabled={selectedLines.length < 2} onClick={() => { setMergeOpen(true); if (!mergeName) setMergeName(selectedLines.map((line) => line.name).join(" + ")); }}>Объединить</Button>
            </div>
            {mergeOpen && <div className="invoice-merge-form">
              <Field label="Новое название для клиента"><Input autoFocus value={mergeName} onChange={(e) => setMergeName(e.target.value)} placeholder="Монтаж + доставка" /></Field>
              <p className="card__subtitle">Цена {money(selectedPrice)} и себестоимость {money(selectedCost)} уже сложены.</p>
              <div className="row">
                <Button block disabled={!mergeName.trim() || replaceEstimateLines.isPending} onClick={persistMergedLine}>{replaceEstimateLines.isPending ? "Сохраняем…" : "Сохранить объединение"}</Button>
                <Button block variant="ghost" onClick={() => setMergeOpen(false)}>Отмена</Button>
              </div>
            </div>}
          </Card>}
          {sections.map((sec) => (
            <Card key={sec.section}>
              <div className="row row--between">
                <p className="card__title">{sec.section}</p>
                <Chip label={money(sec.items.reduce((s, l) => s + l.price, 0))} tone="neutral" />
              </div>
              <div className="stack" style={{ marginTop: 10 }}>
                {sec.items.map((line) => (
                  <div className="row row--between" key={line.id} style={{ gap: 10, padding: "7px 0", borderBottom: "1px solid var(--bdr)" }}>
                    {canManageFinance && <input type="checkbox" checked={selectedLineIds.includes(line.id)} aria-label={`Выбрать ${line.name}`} onChange={(e) => setSelectedLineIds((ids) => e.target.checked ? [...ids, line.id] : ids.filter((id) => id !== line.id))} />}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div>{line.name || "—"} · К {line.count}</div>
                      {line.comment && <div className="card__subtitle">{line.comment}</div>}
                    </div>
                    <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div>Ц {money(line.price)}</div>
                      <div className="card__subtitle">СС {money(line.cost)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </>
      )}

      {panel === "summary" && (
        <>
          <Card>
            <div className="row row--between"><span className="card__subtitle">До общей скидки</span><span>{money(subtotal)}</span></div>
            {totalDiscountEUR > 0 && <div className="row row--between" style={{ marginTop: 4 }}><span className="card__subtitle">Общая скидка</span><span>−{money(totalDiscountEUR)}</span></div>}
            <div className="row row--between" style={{ marginTop: 8 }}><span className="card__title">Клиенту</span><span className="card__title">{money(total)}</span></div>
            <div className="row row--between" style={{ marginTop: 6 }}><span className="card__subtitle">Себестоимость</span><span>{money(costTotal)}</span></div>
            <div className="row row--between" style={{ marginTop: 2 }}><span className="card__subtitle">Маржа</span><span style={{ color: margin >= 0 ? "var(--ok)" : "var(--alert)" }}>{money(margin)}</span></div>
          </Card>
          <Field label="Примечание / условия"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Сроки оплаты, условия аренды и т.п." /></Field>
          {versions.length > 0 && (
            <Card>
              <p className="card__title">Версии</p>
              <div className="stack" style={{ marginTop: 8 }}>
                {versions.slice(0, 6).map((v) => (
                  <button key={v.id} className="invoice-version-row" onClick={() => restoreVersion(v)} type="button">
                    <span>{v.number || "Смета"} · {v.lang}</span>
                    <span>{money(v.totalEUR, "EUR")}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <div className="invoice-bottom-actions">
        <Button block variant="secondary" disabled={visibleLines.length === 0} onClick={() => void preview()}>Preview</Button>
        <Button block disabled={visibleLines.length === 0 || pdfBusy || fxRateToEUR === null} onClick={downloadPdf}>{pdfBusy ? "PDF…" : "PDF"}</Button>
      </div>
    </div>
  );
}

const langOptions = [{ value: "EN", label: "EN" }, { value: "RU", label: "RU" }, { value: "RS", label: "RS" }];
const currencyOptions = [{ value: "EUR", label: "EUR" }, { value: "RSD", label: "RSD" }, { value: "RUB", label: "RUB" }];

function versionFromDTO(v: Finance.InvoiceVersionDTO): StoredInvoiceVersion {
  return {
    id: v.id,
    projectId: v.projectId,
    number: v.number,
    date: v.date,
    place: v.place,
    clientName: v.clientName,
    totalEUR: v.totalEUR,
    currency: v.currency,
    lang: v.lang,
    createdAt: v.createdAt,
    lines: v.lines.map((line) => ({
      id: line.id,
      source: "manual",
      sourceRefId: null,
      section: line.section,
      name: line.name,
      count: line.count,
      price: line.priceEUR,
      rawPrice: line.priceEUR,
      discountType: "percent",
      discountValue: 0,
      cost: line.costEUR,
      comment: line.comment,
      hidden: false,
    })),
    totalDiscountType: v.totalDiscountType,
    totalDiscountValue: v.totalDiscountValue,
    note: v.note,
  };
}

function lineFromEstimate(line: Finance.ProjectEstimateLineDTO, rsdRateToEUR: number): Line {
  return {
    id: line.id,
    source: line.source,
    sourceRefId: line.sourceRefId,
    section: line.section,
    name: line.name,
    count: String(line.qty),
    price: amountAfterDiscountEUR(line.priceEUR, line.discountType, line.discountValue, rsdRateToEUR),
    rawPrice: line.priceEUR,
    discountType: line.discountType,
    discountValue: line.discountValue,
    cost: line.costEUR,
    comment: line.comment,
    hidden: line.hidden,
  };
}

function lineToEstimateInput(line: Line): Finance.SaveProjectEstimateLineInput {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(line.id);
  return {
    ...(isUuid ? { id: line.id } : {}),
    source: line.source,
    sourceRefId: line.sourceRefId,
    section: cleanText(line.section) || "Прочее",
    name: cleanText(line.name),
    qty: Number(line.count) > 0 ? Number(line.count) : 1,
    priceEUR: line.rawPrice,
    costEUR: line.cost,
    discountType: line.discountType,
    discountValue: line.discountValue,
    comment: line.comment.trim(),
    hidden: line.hidden,
  };
}

function groupLines(lines: Line[]) {
  const order: string[] = [];
  const map = new Map<string, Line[]>();
  for (const line of lines) {
    const key = line.section;
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key)!.push(line);
  }
  return order.map((section) => ({ section, items: map.get(section)! }));
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div><div className="card__subtitle">{label}</div><div className="card__title" style={{ color: tone }}>{value}</div></div>;
}

function InvoiceTopbar({ lang, currency, onLang, onCurrency, onBack, onPdf, pdfBusy, canConvert }: { lang: InvoiceLang; currency: Currency; onLang: (v: InvoiceLang) => void; onCurrency: (v: Currency) => void; onBack: () => void; onPdf: () => void; pdfBusy: boolean; canConvert: boolean }) {
  return (
    <div className="row no-print invoice-preview-topbar">
      <button className="icon-btn" onClick={onBack} aria-label="Редактировать" title="Редактировать">✎</button>
      <Select value={lang} onChange={(e) => onLang(e.target.value as InvoiceLang)} options={langOptions} />
      <Select value={currency} onChange={(e) => onCurrency(e.target.value as Currency)} options={currencyOptions} />
      <Button onClick={onPdf} disabled={pdfBusy || !canConvert}>{pdfBusy ? "PDF…" : "PDF"}</Button>
    </div>
  );
}

function PrintableInvoice({ labels, formattedDate, place, sections, convert, subtotal, totalDiscountEUR, total, currency, note, company }: { labels: typeof DOC_LABELS[InvoiceLang]; formattedDate: string; place: string; sections: { section: string; items: Line[] }[]; convert: (valueEUR: number) => number; subtotal: number; totalDiscountEUR: number; total: number; currency: Currency; note: string; company: Company }) {
  return (
    <div className="invoice-doc">
      <div className="estimate-head">
        <div className="estimate-info">
          <div className="estimate-title">{labels.title}</div>
          <div className="estimate-field"><div>{labels.date}</div><strong>{formattedDate}</strong></div>
          <div className="estimate-field estimate-field--tall"><div>{labels.place}</div><strong>{place.trim() || "—"}</strong></div>
        </div>
        <div className="estimate-logo"><BrandLogo size={170} color="#000" /></div>
      </div>
      <table className="estimate-table">
        <thead><tr><th>{labels.name}</th><th className="num">{labels.count}</th><th className="num">{labels.price}</th><th>{labels.comment}</th></tr></thead>
        <tbody>{sections.map((sec) => <SectionBlock key={sec.section} section={sec.section} items={sec.items} convert={convert} />)}</tbody>
        <tfoot>
          {totalDiscountEUR > 0 && <tr><td>{amount(convert(subtotal))}</td><td>{labels.discount}</td><td>−{amount(convert(totalDiscountEUR))}</td><td>{currency}</td></tr>}
          <tr><td></td><td className="total-label">{labels.total}</td><td className="total-amount">{amount(convert(total))}</td><td className="total-currency">{currency}</td></tr>
        </tfoot>
      </table>
      {note && <div className="estimate-note">{note}</div>}
      <table className="contacts-table"><tbody>
        <tr><th colSpan={2}>{labels.contacts}</th></tr>
        <tr><td>{labels.phone}</td><td>{company.phone}</td></tr>
        <tr><td>{labels.email}</td><td>{company.email}</td></tr>
        <tr><td>{labels.telegram}</td><td className="contact-link">{company.telegram}</td></tr>
      </tbody></table>
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
      <tr className={`inv-section inv-section--${sectionTone(section)}`}><td colSpan={4}>{section}</td></tr>
      {items.map((l) => (
        <tr key={l.id}><td>{l.name || "—"}</td><td className="num">{l.count}</td><td className="num">{amount(convert(l.price))}</td><td className="muted">{l.comment}</td></tr>
      ))}
    </>
  );
}
