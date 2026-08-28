import { useEffect, useState } from "react";
import type { Projects } from "@sever/contracts";
import { Sheet, Field, Input, Select, Button } from "../../../ui-kit/index.ts";
import { useUpdateProject } from "../hooks.ts";
import { useCreateVenue, useVenues } from "../../plans/hooks.ts";
import { AddressInput } from "../../places/AddressInput.tsx";
import { toLocalInput } from "../../../lib/datetime.ts";
import { useDressCodeOptions } from "../../settings/hooks.ts";

interface Props {
  open: boolean;
  project: Projects.ProjectDTO;
  clients: Projects.ClientDTO[];
  onClose: () => void;
}

export function EditProjectSheet({ open, project, clients, onClose }: Props) {
  const update = useUpdateProject();
  const venues = useVenues();
  const createVenue = useCreateVenue();
  const dressCodes = useDressCodeOptions();
  const [name, setName] = useState(project.name);
  const [clientId, setClientId] = useState(project.clientId);
  const [venueId, setVenueId] = useState(project.venueId ?? "");
  const [venueFormOpen, setVenueFormOpen] = useState(false);
  const [newVenue, setNewVenue] = useState("");
  const [newVenueAddress, setNewVenueAddress] = useState("");
  const [starts, setStarts] = useState(toLocalInput(project.startsAt));
  const [ends, setEnds] = useState(toLocalInput(project.endsAt));
  const [dressCodeOptionId, setDressCodeOptionId] = useState(project.dressCodeOptionId ?? "");
  const [dressCodeUniform, setDressCodeUniform] = useState(project.dressCodeUniform);

  // Re-sync when opening on a different project / after external changes.
  useEffect(() => {
    if (open) {
      setName(project.name);
      setClientId(project.clientId);
      setVenueId(project.venueId ?? "");
      setStarts(toLocalInput(project.startsAt));
      setEnds(toLocalInput(project.endsAt));
      setDressCodeOptionId(project.dressCodeOptionId ?? "");
      setDressCodeUniform(project.dressCodeUniform);
    }
  }, [open, project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const validRange = new Date(ends).getTime() > new Date(starts).getTime();
  const datesValid = (!starts && !ends) || validRange;

  const submit = () => {
    update.mutate(
      {
        id: project.id,
        input: {
          name,
          clientId,
          venueId: venueId || null,
          startsAt: starts ? new Date(starts).toISOString() : null,
          endsAt: ends ? new Date(ends).toISOString() : null,
          dressCodeOptionId: dressCodeOptionId || null,
          dressCodeLabel: dressCodes.data?.find(x => x.id === dressCodeOptionId)?.label ?? null,
          dressCodeUniform,
        },
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Редактировать проект">
      <Field label="Название">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Клиент">
        <Select value={clientId} onChange={(e) => setClientId(e.target.value)} options={clients.map((c) => ({ value: c.id, label: c.name }))} />
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
      <Field label="Дресс-код">
        <Select value={dressCodeOptionId} onChange={e => setDressCodeOptionId(e.target.value)} options={[{ value: "", label: "— не выбран —" }, ...(dressCodes.data ?? []).map(x => ({ value: x.id, label: x.label }))]} />
      </Field>
      <label className="row"><input type="checkbox" checked={dressCodeUniform} onChange={e => setDressCodeUniform(e.target.checked)} /> В форме SEVER</label>
      <div className="row">
        <Field label="Начало">
          <Input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
        </Field>
        <Field label="Конец">
          <Input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
        </Field>
      </div>
      {(starts || ends) && !validRange && <p className="card__subtitle" style={{ color: "var(--alert)" }}>Укажите обе даты; конец должен быть позже начала</p>}
      <Button block disabled={!name || !datesValid || update.isPending} onClick={submit}>
        Сохранить
      </Button>
    </Sheet>
  );
}
