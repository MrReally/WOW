import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Equipment, Projects } from "@sever/contracts";
import { Button, Card, Chip, Field, Input, Select, Sheet } from "../../../ui-kit/index.ts";
import { eur } from "../../../lib/labels.ts";
import {
  useAddContractorItem,
  useClients,
  useContractors,
  useCreateContractor,
  useCreateClient,
  useCreateProject,
  useCreateProjectRole,
  useCreateReservation,
  useEquipmentModels,
} from "../hooks.ts";
import { useCreateVenue, useVenues } from "../../plans/hooks.ts";

function localFromDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type StepId = "name" | "client" | "venue" | "time" | "reservations" | "crew" | "contractors" | "finance" | "finish";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ReservationDraft {
  modelId: string;
  qty: string;
  isReserve: boolean;
}

interface CrewDraft {
  title: string;
  count: string;
  rate: string;
}

interface ContractorDraft {
  contractorId: string;
  kind: Projects.ContractorItemKind;
  name: string;
  qty: string;
  price: string;
  cost: string;
}

interface FinanceDraft {
  name: string;
  client: string;
  cost: string;
}

const steps: { id: StepId; label: string; skip?: boolean }[] = [
  { id: "name", label: "Название" },
  { id: "client", label: "Клиент" },
  { id: "venue", label: "Площадка", skip: true },
  { id: "time", label: "Время" },
  { id: "reservations", label: "Брони", skip: true },
  { id: "crew", label: "Команда", skip: true },
  { id: "contractors", label: "Подряд", skip: true },
  { id: "finance", label: "Финансы", skip: true },
  { id: "finish", label: "Готово" },
];

const wizardInvoiceKey = (projectId: string) => `sever.invoice.wizardLines.${projectId}`;

export function ProjectWizardSheet({ open, onClose }: Props) {
  const navigate = useNavigate();
  const clients = useClients();
  const venues = useVenues();
  const models = useEquipmentModels();
  const contractors = useContractors();
  const createClient = useCreateClient();
  const createVenue = useCreateVenue();
  const createProject = useCreateProject();
  const createReservation = useCreateReservation();
  const createRole = useCreateProjectRole();
  const addContractorItem = useAddContractorItem();
  const createContractor = useCreateContractor();

  const [stepIndex, setStepIndex] = useState(0);
  const [project, setProject] = useState<Projects.ProjectDTO | null>(null);
  const [projectName, setProjectName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [venueId, setVenueId] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [starts, setStarts] = useState(localFromDate(new Date(Date.now() + 86_400_000)));
  const [ends, setEnds] = useState(localFromDate(new Date(Date.now() + 2 * 86_400_000)));
  const [reservationDrafts, setReservationDrafts] = useState<ReservationDraft[]>([{ modelId: "", qty: "1", isReserve: false }]);
  const [crewDrafts, setCrewDrafts] = useState<CrewDraft[]>([{ title: "", count: "1", rate: "" }]);
  const [contractorDrafts, setContractorDrafts] = useState<ContractorDraft[]>([{ contractorId: "", kind: "equipment", name: "", qty: "1", price: "", cost: "" }]);
  const [newContractorName, setNewContractorName] = useState("");
  const [newContractorContacts, setNewContractorContacts] = useState("");
  const [financeDrafts, setFinanceDrafts] = useState<FinanceDraft[]>([{ name: "", client: "", cost: "" }]);
  const [busy, setBusy] = useState(false);

  const step = steps[stepIndex]!;
  const validRange = new Date(ends).getTime() > new Date(starts).getTime();
  const selectedClientName = clients.data?.find((c) => c.id === clientId)?.name ?? clientName;
  const totals = useMemo(() => {
    const extrasClient = financeDrafts.reduce((sum, line) => sum + (Number(line.client) || 0), 0);
    const extrasCost = financeDrafts.reduce((sum, line) => sum + (Number(line.cost) || 0), 0);
    const crewCost = crewDrafts.reduce((sum, role) => sum + (Number(role.count) || 0) * (Number(role.rate) || 0), 0);
    const contractorClient = contractorDrafts.reduce((sum, item) => sum + (Number(item.qty) || 1) * (Number(item.price) || 0), 0);
    const contractorCost = contractorDrafts.reduce((sum, item) => sum + (Number(item.qty) || 1) * (Number(item.cost) || 0), 0);
    return { extrasClient, extrasCost, crewCost, contractorClient, contractorCost };
  }, [contractorDrafts, crewDrafts, financeDrafts]);

  const close = () => {
    onClose();
    setTimeout(() => {
      setStepIndex(0);
      setProject(null);
      setProjectName("");
      setClientId("");
      setClientName("");
      setVenueId("");
      setVenueName("");
      setVenueAddress("");
      setStarts(localFromDate(new Date(Date.now() + 86_400_000)));
      setEnds(localFromDate(new Date(Date.now() + 2 * 86_400_000)));
      setReservationDrafts([{ modelId: "", qty: "1", isReserve: false }]);
      setCrewDrafts([{ title: "", count: "1", rate: "" }]);
      setContractorDrafts([{ contractorId: "", kind: "equipment", name: "", qty: "1", price: "", cost: "" }]);
      setNewContractorName("");
      setNewContractorContacts("");
      setFinanceDrafts([{ name: "", client: "", cost: "" }]);
    }, 150);
  };

  const createEverything = async () => {
    if (project || busy) return;
    setBusy(true);
    try {
      let cid = clientId;
      if (!cid && clientName.trim()) {
        const client = await createClient.mutateAsync({ name: clientName.trim() });
        cid = client.id;
        setClientId(cid);
      }
      if (!cid) return;
      let vid = venueId || null;
      if (!vid && venueName.trim()) {
        const venue = await createVenue.mutateAsync({ name: venueName.trim(), address: venueAddress.trim() || null });
        vid = venue.id;
        setVenueId(venue.id);
      }
      const created = await createProject.mutateAsync({
        name: projectName.trim(),
        clientId: cid,
        venueId: vid,
        startsAt: new Date(starts).toISOString(),
        endsAt: new Date(ends).toISOString(),
      });
      let createdContractorId = "";
      if (newContractorName.trim()) {
        const contractor = await createContractor.mutateAsync({ name: newContractorName.trim(), contacts: newContractorContacts.trim() || null });
        createdContractorId = contractor.id;
      }
      for (const draft of reservationDrafts) {
        if (!draft.modelId || Number(draft.qty) <= 0) continue;
        await createReservation.mutateAsync({ projectId: created.id, modelId: draft.modelId, qty: Number(draft.qty), isReserve: draft.isReserve, startsAt: created.startsAt, endsAt: created.endsAt });
      }
      for (const draft of crewDrafts) {
        if (!draft.title.trim()) continue;
        await createRole.mutateAsync({ projectId: created.id, input: { title: draft.title.trim(), requiredCount: Number(draft.count) || 1, rateEUR: draft.rate ? Number(draft.rate) || 0 : null } });
      }
      for (const draft of contractorDrafts) {
        const contractorId = draft.contractorId === "__new__" || (!draft.contractorId && createdContractorId) ? createdContractorId : draft.contractorId;
        if (!contractorId || !draft.name.trim()) continue;
        await addContractorItem.mutateAsync({ projectId: created.id, contractorId, kind: draft.kind, name: draft.name.trim(), qty: Number(draft.qty) || 1, priceEUR: Number(draft.price) || 0, costEUR: Number(draft.cost) || 0 });
      }
      const lines = financeDrafts.filter((line) => line.name.trim() && ((Number(line.client) || 0) > 0 || (Number(line.cost) || 0) > 0)).map((line) => ({
        id: `wizard-${Math.random().toString(36).slice(2, 9)}`, section: "Project extras", name: line.name.trim(), count: "1", price: Number(line.client) || 0, cost: Number(line.cost) || 0, comment: "planned",
      }));
      localStorage.setItem(wizardInvoiceKey(created.id), JSON.stringify(lines));
      setProject(created);
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };
  const skip = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1));

  const canContinue =
    step.id === "name" ? !!projectName.trim() :
    step.id === "client" ? !!clientId || !!clientName.trim() :
    step.id === "time" ? validRange :
    true;

  return (
    <Sheet open={open} onClose={close} title="Мастер проекта">
      <div className="row row--between" style={{ marginBottom: 12 }}>
        <Chip label={`${stepIndex + 1}/${steps.length}`} tone="accent" />
        <span className="card__subtitle">{step.label}</span>
      </div>

      {step.id === "name" && (
        <WizardScreen title="Название мероприятия">
          <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Villa Viko · 12/06" autoFocus />
        </WizardScreen>
      )}

      {step.id === "client" && (
        <WizardScreen title="Клиент">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)} options={[{ value: "", label: "Новый клиент" }, ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
          {!clientId && <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Название клиента" />}
        </WizardScreen>
      )}

      {step.id === "venue" && (
        <WizardScreen title="Площадка">
          <Select value={venueId} onChange={(e) => setVenueId(e.target.value)} options={[{ value: "", label: "Новая / пропустить" }, ...(venues.data ?? []).map((v) => ({ value: v.id, label: v.name }))]} />
          {!venueId && (
            <>
              <Input value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="Название площадки" />
              <Input value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} placeholder="Адрес" />
            </>
          )}
        </WizardScreen>
      )}

      {step.id === "time" && (
        <WizardScreen title="Время мероприятия">
          <Field label="Начало"><Input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} /></Field>
          <Field label="Конец"><Input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} /></Field>
          {!validRange && <p className="card__subtitle" style={{ color: "var(--alert)" }}>Конец должен быть позже начала</p>}
        </WizardScreen>
      )}

      {step.id === "reservations" && (
        <WizardScreen title="Брони оборудования">
          {reservationDrafts.map((draft, idx) => (
            <DraftCard key={idx}>
              <Select value={draft.modelId} onChange={(e) => patchReservation(idx, { modelId: e.target.value })} options={[{ value: "", label: "Модель" }, ...(models.data ?? []).map((m) => ({ value: m.id, label: modelLabel(m) }))]} />
              <Input type="number" value={draft.qty} onChange={(e) => patchReservation(idx, { qty: e.target.value })} placeholder="Кол-во" />
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={draft.isReserve} onChange={(e) => patchReservation(idx, { isReserve: e.target.checked })} />
                <span>В резерв · не добавлять в счёт</span>
              </label>
            </DraftCard>
          ))}
          <Button variant="secondary" onClick={() => setReservationDrafts((x) => [...x, { modelId: "", qty: "1", isReserve: false }])}>+</Button>
        </WizardScreen>
      )}

      {step.id === "crew" && (
        <WizardScreen title="Роли и ставки">
          {crewDrafts.map((draft, idx) => (
            <DraftCard key={idx}>
              <Input value={draft.title} onChange={(e) => patchCrew(idx, { title: e.target.value })} placeholder="Роль" />
              <div className="row">
                <Input type="number" value={draft.count} onChange={(e) => patchCrew(idx, { count: e.target.value })} placeholder="Кол-во" />
                <Input type="number" value={draft.rate} onChange={(e) => patchCrew(idx, { rate: e.target.value })} placeholder="€" />
              </div>
            </DraftCard>
          ))}
          <Button variant="secondary" onClick={() => setCrewDrafts((x) => [...x, { title: "", count: "1", rate: "" }])}>+</Button>
        </WizardScreen>
      )}

      {step.id === "contractors" && (
        <WizardScreen title="Подрядчики">
          <DraftCard>
            <Input value={newContractorName} onChange={(e) => setNewContractorName(e.target.value)} placeholder="+ Новый подрядчик" />
            <Input value={newContractorContacts} onChange={(e) => setNewContractorContacts(e.target.value)} placeholder="Контакты" />
          </DraftCard>
          {contractorDrafts.map((draft, idx) => (
            <DraftCard key={idx}>
              <Select value={draft.contractorId} onChange={(e) => patchContractor(idx, { contractorId: e.target.value })} options={[{ value: "", label: "Подрядчик" }, ...(newContractorName.trim() ? [{ value: "__new__", label: `Новый: ${newContractorName.trim()}` }] : []), ...(contractors.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
              <Select value={draft.kind} onChange={(e) => patchContractor(idx, { kind: e.target.value as Projects.ContractorItemKind })} options={[{ value: "equipment", label: "Оборудование" }, { value: "delivery", label: "Доставка" }, { value: "setup", label: "Монтаж" }]} />
              <Input value={draft.name} onChange={(e) => patchContractor(idx, { name: e.target.value })} placeholder="Позиция" />
              <div className="row">
                <Input type="number" value={draft.qty} onChange={(e) => patchContractor(idx, { qty: e.target.value })} placeholder="Кол-во" />
                <Input type="number" value={draft.price} onChange={(e) => patchContractor(idx, { price: e.target.value })} placeholder="Клиенту" />
                <Input type="number" value={draft.cost} onChange={(e) => patchContractor(idx, { cost: e.target.value })} placeholder="Себес" />
              </div>
            </DraftCard>
          ))}
          <Button variant="secondary" onClick={() => setContractorDrafts((x) => [...x, { contractorId: "", kind: "equipment", name: "", qty: "1", price: "", cost: "" }])}>+</Button>
        </WizardScreen>
      )}

      {step.id === "finance" && (
        <WizardScreen title="Финансы">
          {financeDrafts.map((draft, idx) => (
            <DraftCard key={idx}>
              <Input value={draft.name} onChange={(e) => patchFinance(idx, { name: e.target.value })} placeholder="Питание, доставка, скидка..." />
              <div className="row">
                <Input type="number" value={draft.client} onChange={(e) => patchFinance(idx, { client: e.target.value })} placeholder="Клиенту" />
                <Input type="number" value={draft.cost} onChange={(e) => patchFinance(idx, { cost: e.target.value })} placeholder="Себес" />
              </div>
            </DraftCard>
          ))}
          <Button variant="secondary" onClick={() => setFinanceDrafts((x) => [...x, { name: "", client: "", cost: "" }])}>+</Button>
          <Card>
            <div className="row row--between"><span className="card__subtitle">План клиенту</span><span>{eur(totals.extrasClient + totals.contractorClient)}</span></div>
            <div className="row row--between"><span className="card__subtitle">План себес</span><span>{eur(totals.extrasCost + totals.contractorCost + totals.crewCost)}</span></div>
          </Card>
        </WizardScreen>
      )}

      {step.id === "finish" && (
        <WizardScreen title={project ? "Проект создан" : "Проверьте и создайте"}>
          <Card>
            <p className="card__title">{project?.name ?? projectName}</p>
            <p className="card__subtitle">{selectedClientName || "Клиент"} · можно открыть проект или сразу перейти к смете.</p>
          </Card>
        </WizardScreen>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        {stepIndex > 0 && !project && <Button variant="ghost" onClick={() => setStepIndex((i) => Math.max(0, i - 1))}>Назад</Button>}
        {step.skip && step.id !== "finish" && <Button variant="ghost" onClick={skip}>Пропустить</Button>}
        {step.id === "finish" ? (
          project ? <>
            <Button block variant="secondary" disabled={!project} onClick={() => project && navigate(`/projects/${project.id}`)}>Проект</Button>
            <Button block disabled={!project} onClick={() => project && navigate(`/projects/${project.id}/invoice`)}>Смета</Button>
          </> : <Button block disabled={busy} onClick={() => void createEverything()}>{busy ? "Создаём…" : "Создать проект"}</Button>
        ) : (
          <Button block disabled={!canContinue || busy} onClick={next}>Дальше</Button>
        )}
      </div>
    </Sheet>
  );

  function patchReservation(index: number, patch: Partial<ReservationDraft>) {
    setReservationDrafts((list) => list.map((item, i) => i === index ? { ...item, ...patch } : item));
  }
  function patchCrew(index: number, patch: Partial<CrewDraft>) {
    setCrewDrafts((list) => list.map((item, i) => i === index ? { ...item, ...patch } : item));
  }
  function patchContractor(index: number, patch: Partial<ContractorDraft>) {
    setContractorDrafts((list) => list.map((item, i) => i === index ? { ...item, ...patch } : item));
  }
  function patchFinance(index: number, patch: Partial<FinanceDraft>) {
    setFinanceDrafts((list) => list.map((item, i) => i === index ? { ...item, ...patch } : item));
  }
}

function WizardScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="card__title" style={{ fontSize: 24 }}>{title}</p>
      {children}
    </div>
  );
}

function DraftCard({ children }: { children: ReactNode }) {
  return <Card><div className="stack" style={{ gap: 8 }}>{children}</div></Card>;
}

function modelLabel(model: Equipment.EquipmentModelDTO) {
  return model.manufacturer ? `${model.name} · ${model.manufacturer}` : model.name;
}
