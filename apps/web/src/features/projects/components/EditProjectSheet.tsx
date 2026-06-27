import { useEffect, useState } from "react";
import type { Projects } from "@sever/contracts";
import { Sheet, Field, Input, Select, Button } from "../../../ui-kit/index.ts";
import { useUpdateProject } from "../hooks.ts";
import { useVenues } from "../../plans/hooks.ts";
import { toLocalInput } from "../../../lib/datetime.ts";

interface Props {
  open: boolean;
  project: Projects.ProjectDTO;
  clients: Projects.ClientDTO[];
  onClose: () => void;
}

export function EditProjectSheet({ open, project, clients, onClose }: Props) {
  const update = useUpdateProject();
  const venues = useVenues();
  const [name, setName] = useState(project.name);
  const [clientId, setClientId] = useState(project.clientId);
  const [venueId, setVenueId] = useState(project.venueId ?? "");
  const [starts, setStarts] = useState(toLocalInput(project.startsAt));
  const [ends, setEnds] = useState(toLocalInput(project.endsAt));

  // Re-sync when opening on a different project / after external changes.
  useEffect(() => {
    if (open) {
      setName(project.name);
      setClientId(project.clientId);
      setVenueId(project.venueId ?? "");
      setStarts(toLocalInput(project.startsAt));
      setEnds(toLocalInput(project.endsAt));
    }
  }, [open, project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const validRange = new Date(ends).getTime() > new Date(starts).getTime();

  const submit = () => {
    update.mutate(
      {
        id: project.id,
        input: {
          name,
          clientId,
          venueId: venueId || null,
          startsAt: new Date(starts).toISOString(),
          endsAt: new Date(ends).toISOString(),
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
          options={[{ value: "", label: "— не выбрана —" }, ...(venues.data ?? []).map((v) => ({ value: v.id, label: v.name }))]}
        />
      </Field>
      <div className="row">
        <Field label="Начало">
          <Input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
        </Field>
        <Field label="Конец">
          <Input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
        </Field>
      </div>
      {!validRange && <p className="card__subtitle" style={{ color: "var(--alert)" }}>Конец должен быть позже начала</p>}
      <Button block disabled={!name || !validRange || update.isPending} onClick={submit}>
        Сохранить
      </Button>
    </Sheet>
  );
}
