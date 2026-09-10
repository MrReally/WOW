import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Projects } from "@sever/contracts";
import { Button, Field, Input, Sheet } from "../../../ui-kit/index.ts";
import { isoFromLocal, toLocalInput } from "../../../lib/datetime.ts";
import { useDuplicateProject } from "../hooks.ts";
import { ConfiguredDateTimeInput } from "../../../app/ConfiguredDateTimeInput.tsx";

export function DuplicateProjectSheet({ open, project, onClose }: {
  open: boolean;
  project: Projects.ProjectDTO;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const duplicate = useDuplicateProject();
  const defaultStart = new Date(Date.now() + 86_400_000).toISOString();
  const defaultEnd = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const duration = project.startsAt && project.endsAt ? Date.parse(project.endsAt) - Date.parse(project.startsAt) : 86_400_000;
  const [name, setName] = useState(`${project.name} — копия`);
  const [startsAt, setStartsAt] = useState(toLocalInput(project.startsAt ?? defaultStart));
  const [endsAt, setEndsAt] = useState(toLocalInput(project.endsAt ?? defaultEnd));

  useEffect(() => {
    if (!open) return;
    setName(`${project.name} — копия`);
    setStartsAt(toLocalInput(project.startsAt ?? defaultStart));
    setEndsAt(toLocalInput(project.endsAt ?? defaultEnd));
  }, [open, project.id, project.name, project.startsAt, project.endsAt]);

  const changeStart = (value: string) => {
    setStartsAt(value);
    const next = Date.parse(isoFromLocal(value));
    if (Number.isFinite(next)) setEndsAt(toLocalInput(new Date(next + duration).toISOString()));
  };
  const valid = name.trim() && !!startsAt && endsAt > startsAt;

  return (
    <Sheet open={open} onClose={onClose} title="Дублировать проект">
      <p className="card__subtitle">Роли копируются без людей, оборудование — без распределения, подрядчики — без подтверждения. Тайминги сдвинутся относительно новой даты.</p>
      <Field label="Название"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <div className="row">
        <Field label="Начало"><ConfiguredDateTimeInput value={startsAt} onChange={changeStart} /></Field>
        <Field label="Окончание"><ConfiguredDateTimeInput value={endsAt} onChange={setEndsAt} /></Field>
      </div>
      <Button block disabled={!valid || duplicate.isPending} onClick={() => duplicate.mutate({
        id: project.id,
        input: { name: name.trim(), startsAt: isoFromLocal(startsAt), endsAt: isoFromLocal(endsAt) },
      }, { onSuccess: (copy) => { onClose(); navigate(`/projects/${copy.id}`); } })}>
        Создать копию
      </Button>
    </Sheet>
  );
}
