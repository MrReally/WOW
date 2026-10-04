import { useEffect, useState } from "react";
import type { Projects } from "@sever/contracts";
import { Sheet, Field, Input, Select, Button, Textarea } from "../../../ui-kit/index.ts";
import { useApplyProjectSeriesChange, usePreviewProjectSeriesChange, useUpdateProject } from "../hooks.ts";
import { useCreateVenue, useVenues } from "../../plans/hooks.ts";
import { AddressInput } from "../../places/AddressInput.tsx";
import { isoFromLocal, toLocalInput } from "../../../lib/datetime.ts";
import { useDressCodeOptions } from "../../settings/hooks.ts";
import { useSession } from "../../../app/session.ts";
import { ConfiguredDateTimeInput } from "../../../app/ConfiguredDateTimeInput.tsx";

interface Props {
  open: boolean;
  project: Projects.ProjectDTO;
  clients: Projects.ClientDTO[];
  onClose: () => void;
}

export function EditProjectSheet({ open, project, clients, onClose }: Props) {
  const { can } = useSession();
  const canViewNote = can("projects.note.view");
  const update = useUpdateProject();
  const previewSeriesChange = usePreviewProjectSeriesChange();
  const applySeriesChange = useApplyProjectSeriesChange();
  const venues = useVenues();
  const createVenue = useCreateVenue();
  const dressCodes = useDressCodeOptions();
  const [name, setName] = useState(project.baseName);
  const [clientId, setClientId] = useState(project.clientId);
  const [venueId, setVenueId] = useState(project.venueId ?? "");
  const [venueFormOpen, setVenueFormOpen] = useState(false);
  const [newVenue, setNewVenue] = useState("");
  const [newVenueAddress, setNewVenueAddress] = useState("");
  const [starts, setStarts] = useState(toLocalInput(project.startsAt));
  const [ends, setEnds] = useState(toLocalInput(project.endsAt));
  const [dressCodeOptionId, setDressCodeOptionId] = useState(project.dressCodeOptionId ?? "");
  const [dressCodeUniform, setDressCodeUniform] = useState(project.dressCodeUniform);
  const [note, setNote] = useState(project.note ?? "");
  const [scope, setScope] = useState<"only_this" | Projects.ProjectSeriesChangeScope>("only_this");
  const [preview, setPreview] = useState<Projects.ProjectSeriesChangePreviewDTO | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, Projects.ProjectSeriesConflictResolution>>({});

  // Re-sync when opening on a different project / after external changes.
  useEffect(() => {
    if (open) {
      setName(project.baseName);
      setClientId(project.clientId);
      setVenueId(project.venueId ?? "");
      setStarts(toLocalInput(project.startsAt));
      setEnds(toLocalInput(project.endsAt));
      setDressCodeOptionId(project.dressCodeOptionId ?? "");
      setDressCodeUniform(project.dressCodeUniform);
      setNote(project.note ?? "");
      setScope("only_this");
      setPreview(null);
      setResolutions({});
    }
  }, [open, project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const validRange = !!starts && ends > starts;
  const datesValid = (!starts && !ends) || validRange;

  const submit = () => {
    const input: Projects.UpdateProjectInput = {
          name,
          clientId,
          venueId: venueId || null,
          startsAt: starts ? isoFromLocal(starts) : null,
          endsAt: ends ? isoFromLocal(ends) : null,
          dressCodeOptionId: dressCodeOptionId || null,
          dressCodeLabel: dressCodes.data?.find(x => x.id === dressCodeOptionId)?.label ?? null,
          dressCodeUniform,
          ...(canViewNote ? { note: note.trim() || null } : {}),
    };
    if (!project.seriesId || scope === "only_this") {
      update.mutate({ id: project.id, input }, { onSuccess: onClose });
      return;
    }
    previewSeriesChange.mutate({ seriesId: project.seriesId, input: { sourceProjectId: project.id, scope, projectPatch: input } }, {
      onSuccess: (result) => { setPreview(result); setResolutions({}); },
    });
  };

  if (preview && project.seriesId) {
    const conflictCount = preview.projects.reduce((sum, item) => sum + item.conflicts.length, 0);
    return <Sheet open={open} onClose={() => setPreview(null)} title="Проверка изменений серии">
      <p>Будут проверены и обновлены {preview.projects.length} проектов. Транзакции, оплаты и фактические операции не затрагиваются.</p>
      <p className="card__subtitle">Автоматические изменения применяются только к значениям, которые не менялись локально. Конфликтов: {conflictCount}.</p>
      <div className="stack">
        {preview.projects.map((item) => <details key={item.projectId} open={item.conflicts.length > 0}>
          <summary><strong>{item.projectName}</strong> · автоматически: {item.automaticFields.length} · конфликтов: {item.conflicts.length}</summary>
          {item.protectedReasons.map((reason) => <p key={reason} className="card__subtitle">⚠ {reason}</p>)}
          {item.conflicts.map((conflict) => {
            const key = `${item.projectId}:${conflict.field}`;
            const useSeries = resolutions[key] === "use_series";
            return <div key={key} className="row row--between" style={{ padding: "8px 0" }}>
              <span>{String(conflict.field)}: локальное значение будет сохранено</span>
              <Button variant={useSeries ? "primary" : "secondary"} onClick={() => setResolutions((current) => ({ ...current, [key]: useSeries ? "keep_local" : "use_series" }))}>
                {useSeries ? "Применить значение серии" : "Оставить локальное"}
              </Button>
            </div>;
          })}
        </details>)}
      </div>
      <div className="row">
        <Button variant="secondary" onClick={() => setPreview(null)}>Назад</Button>
        <Button disabled={applySeriesChange.isPending} onClick={() => applySeriesChange.mutate({ seriesId: project.seriesId!, input: { changeSetId: preview.changeSetId, resolutions } }, { onSuccess: onClose })}>
          Применить изменения
        </Button>
      </div>
    </Sheet>;
  }

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
          <ConfiguredDateTimeInput value={starts} onChange={setStarts} />
        </Field>
        <Field label="Конец">
          <ConfiguredDateTimeInput value={ends} onChange={setEnds} />
        </Field>
      </div>
      {(starts || ends) && !validRange && <p className="card__subtitle" style={{ color: "var(--alert)" }}>Укажите обе даты; конец должен быть позже начала</p>}
      {canViewNote && <Field label="Общая заметка по проекту">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Важная информация для команды и планирования" />
      </Field>}
      {project.seriesId && <Field label="Область изменения">
        <Select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)} options={[
          { value: "only_this", label: "Только этот проект" },
          { value: "this_and_future", label: "Этот и все будущие" },
          { value: "all", label: "Вся серия" },
        ]} />
      </Field>}
      <Button block disabled={!name || !datesValid || update.isPending || previewSeriesChange.isPending} onClick={submit}>
        Сохранить
      </Button>
    </Sheet>
  );
}
