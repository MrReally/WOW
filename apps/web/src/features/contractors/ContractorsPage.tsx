import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Equipment, Projects } from "@sever/contracts";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Metric,
  SectionTitle,
  StatusBadge,
  Textarea,
} from "../../ui-kit/index.ts";
import { useI18n } from "../../app/i18n.tsx";
import {
  useContractors,
  useContractorHistory,
  useCreateContractor,
  useOpenContractorItems,
  useProjects,
  useReturnContractorItem,
  useUpdateContractor,
} from "./hooks.ts";

const totalClient = (item: Projects.ContractorItemDTO) => item.priceEUR * item.qty;
const totalCost = (item: Projects.ContractorItemDTO) => item.costEUR * item.qty;

export function ContractorsPage() {
  const contractors = useContractors();
  const projects = useProjects();
  const openItems = useOpenContractorItems();
  const create = useCreateContractor();
  const update = useUpdateContractor();
  const markReturned = useReturnContractorItem();
  const { t, eur } = useI18n();

  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [contacts, setContacts] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editContacts, setEditContacts] = useState("");

  const list = contractors.data ?? [];
  const open = openItems.data ?? [];
  useEffect(() => {
    if (!selectedId && list[0]) setSelectedId(list[0].id);
  }, [list, selectedId]);

  const selected = list.find((c) => c.id === selectedId) ?? null;
  useEffect(() => {
    if (!selected) return;
    setEditName(selected.name);
    setEditContacts(selected.contacts ?? "");
    setEditing(false);
  }, [selected?.id]);

  const history = useContractorHistory(selectedId);
  const projectName = (id: string) => (projects.data ?? []).find((p) => p.id === id)?.name ?? "—";

  const active = useMemo(() => open.filter((item) => item.contractorId === selectedId), [open, selectedId]);
  const historyItems = history.data ?? [];
  const activeCost = active.reduce((sum, item) => sum + totalCost(item), 0);
  const activeClient = active.reduce((sum, item) => sum + totalClient(item), 0);
  const activeMargin = activeClient - activeCost;
  const filteredHistory = historyItems.filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [item.name, item.note, projectName(item.projectId)].some((value) => value?.toLowerCase().includes(q));
  });

  const filteredContractors = list.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [c.name, c.contacts].some((value) => value?.toLowerCase().includes(q));
  });

  const submitNew = () =>
    create.mutate(
      { name: name.trim(), contacts: contacts.trim() || null },
      { onSuccess: (c) => { setSelectedId(c.id); setName(""); setContacts(""); } }
    );

  const submitEdit = () => {
    if (!selected) return;
    update.mutate(
      { id: selected.id, input: { name: editName.trim(), contacts: editContacts.trim() || null } },
      { onSuccess: () => setEditing(false) }
    );
  };

  if (contractors.isLoading) return <Loading />;
  if (contractors.error) return <ErrorState error={contractors.error} onRetry={contractors.refetch} />;

  return (
    <div className="stack">
      <SectionTitle>{t("contractors.title")}</SectionTitle>

      <Card>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <Metric value={list.length} label={t("contractors.title")} />
          <Metric value={open.length} label={t("contractors.returnDue")} tone={open.length ? "danger" : "ok"} />
          <Metric value={eur(open.reduce((sum, item) => sum + totalCost(item), 0))} label={t("finance.payables")} tone={open.length ? "danger" : "ok"} />
        </div>
      </Card>

      <Field label={t("common.search")}>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Light, truss, kontakt..." />
      </Field>

      <Card>
        <p className="card__title">{t("contractors.new")}</p>
        <Field label={t("common.name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company / person / warehouse" />
        </Field>
        <Field label={t("common.contacts")}>
          <Textarea value={contacts} onChange={(e) => setContacts(e.target.value)} placeholder="Phone, Telegram, payment terms" />
        </Field>
        <Button block disabled={!name.trim() || create.isPending} onClick={submitNew}>
          {t("contractors.add")}
        </Button>
      </Card>

      {list.length === 0 ? (
        <EmptyState title={t("contractors.empty")} hint={t("contractors.emptyHint")} />
      ) : (
        <div className="row" style={{ gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {filteredContractors.map((c) => {
            const count = open.filter((item) => item.contractorId === c.id).length;
            return (
              <button
                key={c.id}
                className={`chip ${selectedId === c.id ? "chip--accent chip--solid" : "chip--neutral"}`}
                style={{ border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
                onClick={() => setSelectedId(c.id)}
              >
                {c.name}{count ? ` · ${t("contractors.returnDue")} ${count}` : ""}
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <>
          <Card>
            <div className="row row--between">
              <div style={{ minWidth: 0 }}>
                <p className="card__title">{selected.name}</p>
                <p className="card__subtitle">{selected.contacts || t("common.noContacts")}</p>
              </div>
              <StatusBadge tone={active.length ? "warn" : "ok"}>{active.length ? t("contractors.returnDue") : t("contractors.allClosed")}</StatusBadge>
            </div>
            <div className="row" style={{ marginTop: 12, gap: 18, flexWrap: "wrap" }}>
              <Metric value={eur(activeCost)} label={t("contractors.activeCost")} tone={activeCost ? "danger" : "ok"} />
              <Metric value={eur(activeMargin)} label={t("common.margin")} tone={activeMargin >= 0 ? "ok" : "danger"} />
              <Metric value={historyItems.length} label={t("contractors.items")} />
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <Button variant="secondary" onClick={() => setEditing((v) => !v)}>
                {editing ? t("common.close") : t("common.edit")}
              </Button>
            </div>
            {editing && (
              <div style={{ marginTop: 12 }}>
                <Field label={t("common.name")}>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </Field>
                <Field label={t("common.contacts")}>
                  <Textarea value={editContacts} onChange={(e) => setEditContacts(e.target.value)} />
                </Field>
                <Button block disabled={!editName.trim() || update.isPending} onClick={submitEdit}>
                  {t("common.save")}
                </Button>
              </div>
            )}
          </Card>

          <SectionTitle>{t("contractors.needReturn")}</SectionTitle>
          {openItems.isLoading ? (
            <Loading />
          ) : active.length === 0 ? (
            <EmptyState title={t("contractors.noActive")} hint={t("contractors.noActiveHint")} />
          ) : (
            <div className="stack">
              {active.map((item) => (
                <ContractorItemCard
                  key={item.id}
                  item={item}
                  projectName={projectName(item.projectId)}
                  action={
                    <Button variant="secondary" disabled={markReturned.isPending} onClick={() => markReturned.mutate(item.id)}>
                      {t("contractors.return")}
                    </Button>
                  }
                />
              ))}
            </div>
          )}

          <SectionTitle>{t("contractors.prices")}</SectionTitle>
          {history.isLoading ? (
            <Loading />
          ) : filteredHistory.length === 0 ? (
            <EmptyState title={t("contractors.noHistory")} hint={t("contractors.noHistoryHint")} />
          ) : (
            <div className="stack">
              {filteredHistory.map((item) => (
                <ContractorItemCard key={item.id} item={item} projectName={projectName(item.projectId)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ContractorItemCard({ item, projectName, action }: { item: Projects.ContractorItemDTO; projectName: string; action?: ReactNode }) {
  const { t, eur, dateTime } = useI18n();
  const margin = totalClient(item) - totalCost(item);
  const kindLabel =
    item.kind === "delivery" ? t("contractors.kindDelivery") : item.kind === "setup" ? t("contractors.kindSetup") : t("contractors.kindEquipment");
  return (
    <Card>
      <div className="row row--between">
        <div style={{ minWidth: 0 }}>
          <p className="card__title">{item.name} × {item.qty}</p>
          <p className="card__subtitle">{kindLabel} · {projectName} · {item.note || t("common.noNote")}</p>
        </div>
        {action ?? (
          item.kind === "equipment"
            ? <StatusBadge tone={item.returnedAt ? "ok" : "warn"}>{item.returnedAt ? t("common.returned") : t("contractors.atUs")}</StatusBadge>
            : <StatusBadge tone="ok">{t("contractors.service")}</StatusBadge>
        )}
      </div>
      <p className="card__subtitle" style={{ marginTop: 8 }}>
        {t("contractors.clientPrice")} {eur(totalClient(item))} · {t("contractors.vendorCost")} {eur(totalCost(item))} · {t("common.margin")} {eur(margin)}
      </p>
      <p className="card__subtitle" style={{ marginTop: 2 }}>
        {t("contractors.added")} {dateTime(item.createdAt)}{item.returnedAt ? ` · ${t("contractors.back")} ${dateTime(item.returnedAt)}` : ""}
      </p>
    </Card>
  );
}
