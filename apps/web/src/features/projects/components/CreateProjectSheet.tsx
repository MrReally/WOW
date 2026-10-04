import { useState } from "react";
import { Sheet, Field, Input, Select, Button, Textarea } from "../../../ui-kit/index.ts";
import { useClients, useCreateClient, useCreateProject, useCreateProjectSeries } from "../hooks.ts";
import { useCreateVenue, useVenues } from "../../plans/hooks.ts";
import { AddressInput } from "../../places/AddressInput.tsx";
import { useSession } from "../../../app/session.ts";
import { ConfiguredDateTimeInput } from "../../../app/ConfiguredDateTimeInput.tsx";
import { isoFromLocal } from "../../../lib/datetime.ts";

export function CreateProjectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can } = useSession();
  const canViewNote = can("projects.note.view");
  const clients = useClients();
  const venues = useVenues();
  const createClient = useCreateClient();
  const createVenue = useCreateVenue();
  const createProject = useCreateProject();
  const createSeries = useCreateProjectSeries();

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [newClient, setNewClient] = useState("");
  const [venueId, setVenueId] = useState("");
  const [venueFormOpen, setVenueFormOpen] = useState(false);
  const [newVenue, setNewVenue] = useState("");
  const [newVenueAddress, setNewVenueAddress] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [note, setNote] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [interval, setInterval] = useState("1");
  const [endMode, setEndMode] = useState<"never" | "until" | "count">("count");
  const [occurrenceCount, setOccurrenceCount] = useState("12");
  const [until, setUntil] = useState("");

  const clientOptions = [
    { value: "", label: "— выбрать клиента —" },
    ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  const validRange = !!starts && ends > starts;

  const submit = () => {
    createProject.mutate(
      {
        name,
        clientId,
        venueId: venueId || null,
        ...(canViewNote ? { note: note.trim() || null } : {}),
        ...(validRange ? { startsAt: isoFromLocal(starts), endsAt: isoFromLocal(ends) } : {}),
      },
      {
        onSuccess: (project) => {
          const finish = () => { setName(""); setNote(""); setRecurring(false); onClose(); };
          if (!recurring || !project.startsAt) return finish();
          const weekday = new Date(project.startsAt).getDay() || 7;
          createSeries.mutate({
            projectId: project.id,
            input: {
              name: project.name,
              schedule: {
                frequency,
                interval: Number(interval),
                weekdays: frequency === "weekly" ? [weekday] : [],
                endMode,
                until: endMode === "until" && until ? isoFromLocal(`${until}T23:59`) : null,
                occurrenceCount: endMode === "count" ? Number(occurrenceCount) : null,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Belgrade",
              },
            },
          }, { onSuccess: finish });
        },
      }
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Новый проект">
      <Field label="Название">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Корпоратив …" />
      </Field>

      <Field label="Клиент">
        <Select value={clientId} onChange={(e) => setClientId(e.target.value)} options={clientOptions} />
      </Field>

      <Field label="Площадка">
        <Select
          value={venueId}
          onChange={(e) => setVenueId(e.target.value)}
          options={[{ value: "", label: "— не выбрана —" }, ...(venues.data ?? []).filter((v) => v.isVenue).map((v) => ({ value: v.id, label: v.name }))]}
        />
      </Field>
      {!venueFormOpen ? (
        <Button variant="ghost" onClick={() => setVenueFormOpen(true)}>+ Площадка</Button>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <Field label="Новая площадка">
            <Input value={newVenue} onChange={(e) => setNewVenue(e.target.value)} placeholder="Название" />
          </Field>
          <Field label="Адрес">
            <AddressInput value={newVenueAddress} onChange={setNewVenueAddress} placeholder="Адрес — можно вставить или найти" />
          </Field>
          <div className="row">
            <Button
              variant="secondary"
              disabled={!newVenue.trim() || createVenue.isPending}
              onClick={() =>
                createVenue.mutate(
                  { name: newVenue.trim(), address: newVenueAddress.trim() || null, isVenue: true },
                  {
                    onSuccess: (venue) => {
                      setVenueId(venue.id);
                      setNewVenue("");
                      setNewVenueAddress("");
                      setVenueFormOpen(false);
                    },
                  }
                )
              }
            >
              Добавить
            </Button>
            <Button variant="ghost" onClick={() => setVenueFormOpen(false)}>Отмена</Button>
          </div>
        </div>
      )}

      <div className="row" style={{ alignItems: "flex-end", marginBottom: "var(--space-4)" }}>
        <div style={{ flex: 1 }}>
          <Field label="…или новый клиент">
            <Input value={newClient} onChange={(e) => setNewClient(e.target.value)} placeholder="Имя клиента" />
          </Field>
        </div>
        <Button
          variant="secondary"
          disabled={!newClient || createClient.isPending}
          onClick={() =>
            createClient.mutate(
              { name: newClient },
              {
                onSuccess: (c) => {
                  setClientId(c.id);
                  setNewClient("");
                },
              }
            )
          }
          style={{ marginBottom: "var(--space-4)" }}
        >
          Добавить
        </Button>
      </div>

      <div className="row">
        <Field label="Начало">
          <ConfiguredDateTimeInput value={starts} onChange={setStarts} />
        </Field>
        <Field label="Конец">
          <ConfiguredDateTimeInput value={ends} onChange={setEnds} />
        </Field>
      </div>

      {(starts || ends) && !validRange && <p className="card__subtitle" style={{ color: "var(--alert)" }}>Укажите обе даты; конец должен быть позже начала</p>}
      {!starts && !ends && <p className="card__subtitle">Дата необязательна — её можно добавить позже.</p>}
      <label className="row" style={{ justifyContent: "flex-start", gap: 8 }}>
        <input type="checkbox" checked={recurring} disabled={!validRange} onChange={(event) => setRecurring(event.target.checked)} />
        <span>Регулярный проект</span>
      </label>
      {recurring && <div className="stack" style={{ gap: 8 }}>
        <div className="row">
          <Field label="Повторять">
            <Select value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)} options={[
              { value: "daily", label: "Ежедневно" }, { value: "weekly", label: "Еженедельно" }, { value: "monthly", label: "Ежемесячно" },
            ]} />
          </Field>
          <Field label="Каждые">
            <Input type="number" min="1" value={interval} onChange={(event) => setInterval(event.target.value)} />
          </Field>
        </div>
        <Field label="Окончание">
          <Select value={endMode} onChange={(event) => setEndMode(event.target.value as typeof endMode)} options={[
            { value: "count", label: "После количества повторов" }, { value: "until", label: "В указанную дату" }, { value: "never", label: "Без даты окончания" },
          ]} />
        </Field>
        {endMode === "count" && <Field label="Количество проектов"><Input type="number" min="1" value={occurrenceCount} onChange={(event) => setOccurrenceCount(event.target.value)} /></Field>}
        {endMode === "until" && <Field label="Последняя дата"><Input type="date" value={until} onChange={(event) => setUntil(event.target.value)} /></Field>}
        <p className="card__subtitle">Каждая дата создаётся отдельным проектом со своей сметой и транзакциями. Ближайшие 12 недель будут созданы сразу.</p>
      </div>}
      {canViewNote && <Field label="Общая заметка по проекту">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Важная информация для команды и планирования" />
      </Field>}
      <Button block disabled={!name || !clientId || ((!!starts || !!ends) && !validRange) || (recurring && (Number(interval) < 1 || (endMode === "count" && Number(occurrenceCount) < 1) || (endMode === "until" && !until))) || createProject.isPending || createSeries.isPending} onClick={submit}>
        Создать проект
      </Button>
    </Sheet>
  );
}
