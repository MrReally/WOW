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
  useContractorPeople,
  useContractorVehicles,
  useCreateContractorPerson,
  useCreateContractorVehicle,
  useContractorEquipmentDirectory,
  useCreateContractorEquipment,
  useOpenContractorItems,
  useProjects,
  useReturnContractorItem,
  useUpdateContractor,
} from "./hooks.ts";

const directoryCopy = {
  ru: { directory:"Справочник подрядчика", people:"Сотрудники", vehicles:"Машины", equipment:"Оборудование", firstName:"Имя", lastName:"Фамилия", patronymic:"Отчество", phone:"Телефон", telegram:"Telegram", document:"Номер документа", photo:"Фото (URL)", make:"Марка", model:"Модель", color:"Цвет", plate:"Гос. номер", itemName:"Название", qty:"Количество", cost:"Обычная цена, €", note:"Примечание", noPeople:"Сотрудников пока нет", noVehicles:"Машин пока нет", noEquipment:"Оборудования пока нет" },
  en: { directory:"Contractor directory", people:"People", vehicles:"Vehicles", equipment:"Equipment", firstName:"First name", lastName:"Last name", patronymic:"Middle name", phone:"Phone", telegram:"Telegram", document:"Document number", photo:"Photo (URL)", make:"Make", model:"Model", color:"Color", plate:"Plate number", itemName:"Name", qty:"Quantity", cost:"Default price, €", note:"Note", noPeople:"No people yet", noVehicles:"No vehicles yet", noEquipment:"No equipment yet" },
  sr: { directory:"Imenik izvođača", people:"Ljudi", vehicles:"Vozila", equipment:"Oprema", firstName:"Ime", lastName:"Prezime", patronymic:"Srednje ime", phone:"Telefon", telegram:"Telegram", document:"Broj dokumenta", photo:"Fotografija (URL)", make:"Marka", model:"Model", color:"Boja", plate:"Registarski broj", itemName:"Naziv", qty:"Količina", cost:"Uobičajena cena, €", note:"Napomena", noPeople:"Još nema ljudi", noVehicles:"Još nema vozila", noEquipment:"Još nema opreme" },
} as const;

const totalClient = (item: Projects.ContractorItemDTO) => item.priceEUR * item.qty;
const totalCost = (item: Projects.ContractorItemDTO) => item.costEUR * item.qty;

export function ContractorsPage() {
  const contractors = useContractors();
  const projects = useProjects();
  const openItems = useOpenContractorItems();
  const create = useCreateContractor();
  const update = useUpdateContractor();
  const contractorPeople = useContractorPeople();
  const contractorVehicles = useContractorVehicles();
  const createPerson = useCreateContractorPerson();
  const createVehicle = useCreateContractorVehicle();
  const contractorEquipment = useContractorEquipmentDirectory();
  const createEquipment = useCreateContractorEquipment();
  const markReturned = useReturnContractorItem();
  const { t, eur, locale } = useI18n();
  const directoryLabels = directoryCopy[locale];

  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [contacts, setContacts] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editContacts, setEditContacts] = useState("");
  const [personFirstName, setPersonFirstName] = useState("");
  const [personLastName, setPersonLastName] = useState("");
  const [personPatronymic, setPersonPatronymic] = useState("");
  const [personPhone, setPersonPhone] = useState("");
  const [personTelegram, setPersonTelegram] = useState("");
  const [personDocument, setPersonDocument] = useState("");
  const [personPhoto, setPersonPhoto] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [equipmentName, setEquipmentName] = useState("");
  const [equipmentQty, setEquipmentQty] = useState("1");
  const [equipmentCost, setEquipmentCost] = useState("");
  const [equipmentNote, setEquipmentNote] = useState("");

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

          <SectionTitle>{directoryLabels.directory}</SectionTitle>
          <Card>
            <p className="card__title">{directoryLabels.people}</p>
            <div className="row" style={{ marginTop: 10, flexWrap:"wrap" }}>
              <Field label={directoryLabels.lastName}><Input value={personLastName} onChange={(event) => setPersonLastName(event.target.value)} /></Field>
              <Field label={directoryLabels.firstName}><Input value={personFirstName} onChange={(event) => setPersonFirstName(event.target.value)} /></Field>
              <Field label={directoryLabels.patronymic}><Input value={personPatronymic} onChange={(event) => setPersonPatronymic(event.target.value)} /></Field>
              <Field label={directoryLabels.phone}><Input value={personPhone} onChange={(event) => setPersonPhone(event.target.value)} /></Field>
              <Field label={directoryLabels.telegram}><Input value={personTelegram} onChange={(event) => setPersonTelegram(event.target.value)} /></Field>
              <Field label={directoryLabels.document}><Input value={personDocument} onChange={(event) => setPersonDocument(event.target.value)} /></Field>
              <Field label={directoryLabels.photo}><Input value={personPhoto} onChange={(event) => setPersonPhoto(event.target.value)} /></Field>
              <Button disabled={!personFirstName.trim() || !personLastName.trim() || createPerson.isPending} onClick={() => createPerson.mutate({ contractorId:selected.id, firstName:personFirstName.trim(), lastName:personLastName.trim(), patronymic:personPatronymic.trim() || null, phone:personPhone.trim() || null, telegram:personTelegram.trim() || null, documentNumber:personDocument.trim() || null, photoUrl:personPhoto.trim() || null }, { onSuccess:() => { setPersonFirstName(""); setPersonLastName(""); setPersonPatronymic(""); setPersonPhone(""); setPersonTelegram(""); setPersonDocument(""); setPersonPhoto(""); } })}>+</Button>
            </div>
            {(contractorPeople.data ?? []).filter((person) => person.contractorId === selected.id).length === 0
              ? <p className="card__subtitle">{directoryLabels.noPeople}</p>
              : <div className="stack" style={{ gap: 6, marginTop: 10 }}>{(contractorPeople.data ?? []).filter((person) => person.contractorId === selected.id).map((person) => <div key={person.id} className="row row--between"><div className="row">{person.photoUrl && <img src={person.photoUrl} alt="" className="crew-photo" />}<span>{[person.lastName, person.firstName, person.patronymic].filter(Boolean).join(" ")}</span></div><span className="card__subtitle">{[person.phone, person.telegram, person.documentNumber ? `ID ${person.documentNumber}` : null].filter(Boolean).join(" · ") || "—"}</span></div>)}</div>}
          </Card>
          <Card>
            <p className="card__title">{directoryLabels.vehicles}</p>
            <div className="row" style={{ marginTop: 10 }}>
              <Field label={directoryLabels.make}><Input value={vehicleMake} onChange={(event) => setVehicleMake(event.target.value)} /></Field>
              <Field label={directoryLabels.model}><Input value={vehicleModel} onChange={(event) => setVehicleModel(event.target.value)} /></Field>
              <Field label={directoryLabels.color}><Input value={vehicleColor} onChange={(event) => setVehicleColor(event.target.value)} /></Field>
              <Field label={directoryLabels.plate}><Input value={vehiclePlate} onChange={(event) => setVehiclePlate(event.target.value)} /></Field>
              <Button disabled={!vehicleMake.trim() || !vehicleModel.trim() || !vehiclePlate.trim() || createVehicle.isPending} onClick={() => createVehicle.mutate({ contractorId:selected.id, make:vehicleMake.trim(), model:vehicleModel.trim(), color:vehicleColor.trim() || null, plateNumber:vehiclePlate.trim() }, { onSuccess:() => { setVehicleMake(""); setVehicleModel(""); setVehicleColor(""); setVehiclePlate(""); } })}>+</Button>
            </div>
            {(contractorVehicles.data ?? []).filter((vehicle) => vehicle.contractorId === selected.id).length === 0
              ? <p className="card__subtitle">{directoryLabels.noVehicles}</p>
              : <div className="stack" style={{ gap: 6, marginTop: 10 }}>{(contractorVehicles.data ?? []).filter((vehicle) => vehicle.contractorId === selected.id).map((vehicle) => <div key={vehicle.id} className="row row--between"><span>{vehicle.make} {vehicle.model}{vehicle.color ? ` · ${vehicle.color}` : ""}</span><span className="card__subtitle">{vehicle.plateNumber}</span></div>)}</div>}
          </Card>
          <Card>
            <p className="card__title">{directoryLabels.equipment}</p>
            <div className="row" style={{ marginTop:10, flexWrap:"wrap" }}><Field label={directoryLabels.itemName}><Input value={equipmentName} onChange={event => setEquipmentName(event.target.value)} /></Field><Field label={directoryLabels.qty}><Input type="number" min="0" value={equipmentQty} onChange={event => setEquipmentQty(event.target.value)} /></Field><Field label={directoryLabels.cost}><Input type="number" min="0" step="0.01" value={equipmentCost} onChange={event => setEquipmentCost(event.target.value)} /></Field><Field label={directoryLabels.note}><Input value={equipmentNote} onChange={event => setEquipmentNote(event.target.value)} /></Field><Button disabled={!equipmentName.trim() || createEquipment.isPending} onClick={() => createEquipment.mutate({ contractorId:selected.id, name:equipmentName.trim(), availableQty:Math.max(0, Number(equipmentQty) || 0), defaultCostEUR:equipmentCost ? Number(equipmentCost) : null, note:equipmentNote.trim() || null }, { onSuccess:() => { setEquipmentName(""); setEquipmentQty("1"); setEquipmentCost(""); setEquipmentNote(""); } })}>+</Button></div>
            {(contractorEquipment.data ?? []).filter(item => item.contractorId === selected.id).length === 0 ? <p className="card__subtitle">{directoryLabels.noEquipment}</p> : <div className="stack" style={{ gap:6, marginTop:10 }}>{(contractorEquipment.data ?? []).filter(item => item.contractorId === selected.id).map(item => <div key={item.id} className="row row--between"><span>{item.name} × {item.availableQty}</span><span className="card__subtitle">{item.defaultCostEUR == null ? item.note || "—" : eur(item.defaultCostEUR)}</span></div>)}</div>}
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
