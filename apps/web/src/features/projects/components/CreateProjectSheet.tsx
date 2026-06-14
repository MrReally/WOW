import { useState } from "react";
import { Sheet, Field, Input, Select, Button } from "../../../ui-kit/index.ts";
import { useClients, useCreateClient, useCreateProject } from "../hooks.ts";

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateProjectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const clients = useClients();
  const createClient = useCreateClient();
  const createProject = useCreateProject();

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [newClient, setNewClient] = useState("");
  const [starts, setStarts] = useState(toLocalInput(new Date(Date.now() + 86_400_000)));
  const [ends, setEnds] = useState(toLocalInput(new Date(Date.now() + 2 * 86_400_000)));

  const clientOptions = [
    { value: "", label: "— выбрать клиента —" },
    ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  const submit = () => {
    createProject.mutate(
      {
        name,
        clientId,
        startsAt: new Date(starts).toISOString(),
        endsAt: new Date(ends).toISOString(),
      },
      {
        onSuccess: () => {
          setName("");
          onClose();
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
          <Input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
        </Field>
        <Field label="Конец">
          <Input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
        </Field>
      </div>

      <Button block disabled={!name || !clientId || createProject.isPending} onClick={submit}>
        Создать проект
      </Button>
    </Sheet>
  );
}
