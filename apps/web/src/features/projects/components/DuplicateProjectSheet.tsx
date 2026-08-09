import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Projects } from "@sever/contracts";
import { Button, Field, Input, Sheet } from "../../../ui-kit/index.ts";
import { toLocalInput } from "../../../lib/datetime.ts";
import { useDuplicateProject } from "../hooks.ts";

export function DuplicateProjectSheet({ open, project, onClose }: {
  open: boolean;
  project: Projects.ProjectDTO;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const duplicate = useDuplicateProject();
  const duration = Date.parse(project.endsAt) - Date.parse(project.startsAt);
  const [name, setName] = useState(`${project.name} — копия`);
  const [startsAt, setStartsAt] = useState(toLocalInput(project.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(project.endsAt));

  useEffect(() => {
    if (!open) return;
    setName(`${project.name} — копия`);
    setStartsAt(toLocalInput(project.startsAt));
    setEndsAt(toLocalInput(project.endsAt));
  }, [open, project.id, project.name, project.startsAt, project.endsAt]);

  const changeStart = (value: string) => {
    setStartsAt(value);
    const next = new Date(value).getTime();
    if (Number.isFinite(next)) setEndsAt(toLocalInput(new Date(next + duration).toISOString()));
  };
  const valid = name.trim() && Date.parse(endsAt) > Date.parse(startsAt);

  return (
    <Sheet open={open} onClose={onClose} title="Дублировать проект">
      <p className="card__subtitle">Роли копируются без людей, оборудование — без распределения, подрядчики — без подтверждения. Тайминги сдвинутся относительно новой даты.</p>
      <Field label="Название"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <div className="row">
        <Field label="Начало"><Input type="datetime-local" value={startsAt} onChange={(event) => changeStart(event.target.value)} /></Field>
        <Field label="Окончание"><Input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></Field>
      </div>
      <Button block disabled={!valid || duplicate.isPending} onClick={() => duplicate.mutate({
        id: project.id,
        input: { name: name.trim(), startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() },
      }, { onSuccess: (copy) => { onClose(); navigate(`/projects/${copy.id}`); } })}>
        Создать копию
      </Button>
    </Sheet>
  );
}
