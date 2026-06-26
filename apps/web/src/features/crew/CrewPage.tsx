import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type { People, Projects } from "@sever/contracts";
import { Card, Button, SectionHead, Field, Input, Textarea, Loading, EmptyState, Chip } from "../../ui-kit/index.ts";
import { useSession } from "../../app/session.ts";
import { api } from "../../lib/api.ts";
import { dateRange } from "../../lib/labels.ts";
import { usePeople, useUpdateUser } from "../settings/hooks.ts";
import { useProjectsForFinance } from "../finance/hooks.ts";

export function CrewPage() {
  const { can } = useSession();
  const people = usePeople();
  const projects = useProjectsForFinance();
  const updateUser = useUpdateUser();
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<People.UpdateUserInput>({});

  const list = people.data ?? [];
  const selected = list.find((u) => u.id === selectedId) ?? list[0] ?? null;

  useEffect(() => {
    if (!selectedId && list[0]) setSelectedId(list[0].id);
  }, [list, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setDraft({
      displayName: selected.displayName,
      email: selected.email,
      telegramId: selected.telegramId,
      hourlyRateEUR: selected.hourlyRateEUR,
      documentNumber: selected.documentNumber,
      languages: selected.languages,
      photoUrl: selected.photoUrl,
      birthDate: selected.birthDate,
    });
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const assignmentQueries = useQueries({
    queries: can("projects.view")
      ? (projects.data ?? []).map((p) => ({
          queryKey: ["projects", "assignments", p.id],
          queryFn: () => api.get<Projects.AssignmentDTO[]>(`/api/projects/${p.id}/assignments`),
          enabled: !!selected,
        }))
      : [],
  });

  const history = useMemo(() => {
    if (!selected) return [];
    return (projects.data ?? [])
      .flatMap((project, index) =>
        (assignmentQueries[index]?.data ?? [])
          .filter((a) => a.userId === selected.id)
          .map((assignment) => ({ project, assignment }))
      )
      .sort((a, b) => Date.parse(b.project.startsAt) - Date.parse(a.project.startsAt));
  }, [assignmentQueries, projects.data, selected]);

  if (people.isLoading) return <Loading />;
  if (!selected) return <EmptyState title="Crew пуст" />;

  const save = () => {
    updateUser.mutate({
      id: selected.id,
      input: {
        ...draft,
        email: draft.email || null,
        telegramId: draft.telegramId || null,
        hourlyRateEUR: draft.hourlyRateEUR == null || Number.isNaN(Number(draft.hourlyRateEUR)) ? null : Number(draft.hourlyRateEUR),
        documentNumber: draft.documentNumber || null,
        languages: draft.languages || null,
        photoUrl: draft.photoUrl || null,
        birthDate: draft.birthDate || null,
      },
    });
  };

  return (
    <div className="stack">
      <SectionHead label="Crew" meta={`${list.length}`} />
      <div className="row" style={{ gap: 8, overflowX: "auto", paddingBottom: 2 }}>
        {list.map((person) => (
          <button
            key={person.id}
            className={`chip ${selected.id === person.id ? "chip--accent chip--solid" : "chip--neutral"}`}
            style={{ border: "none", cursor: "pointer" }}
            onClick={() => setSelectedId(person.id)}
          >
            {person.displayName}
          </button>
        ))}
      </div>

      <Card>
        <div className="row row--between" style={{ alignItems: "flex-start" }}>
          <div className="row" style={{ minWidth: 0 }}>
            {draft.photoUrl ? (
              <img src={draft.photoUrl} alt="" className="crew-photo" />
            ) : (
              <span className="crew-photo crew-photo--empty">{selected.displayName.slice(0, 2).toUpperCase()}</span>
            )}
            <div style={{ minWidth: 0 }}>
              <p className="card__title" style={{ fontSize: "var(--fs-lg)" }}>{selected.displayName}</p>
              <p className="card__subtitle">{selected.roleName}{selected.hourlyRateEUR != null ? ` · ${selected.hourlyRateEUR} €` : ""}</p>
            </div>
          </div>
          {!selected.active && <Chip label="выкл" tone="neutral" />}
        </div>
      </Card>

      <Card>
        <SectionHead label="Досье" />
        <Field label="Имя">
          <Input value={draft.displayName ?? ""} onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))} />
        </Field>
        <div className="row">
          <Field label="Email">
            <Input type="email" value={draft.email ?? ""} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} />
          </Field>
          <Field label="Telegram">
            <Input value={draft.telegramId ?? ""} onChange={(e) => setDraft((d) => ({ ...d, telegramId: e.target.value }))} />
          </Field>
        </div>
        <div className="row">
          <Field label="Дата рождения">
            <Input type="date" value={draft.birthDate ?? ""} onChange={(e) => setDraft((d) => ({ ...d, birthDate: e.target.value }))} />
          </Field>
          <Field label="Ставка, €">
            <Input type="number" value={draft.hourlyRateEUR ?? ""} onChange={(e) => setDraft((d) => ({ ...d, hourlyRateEUR: e.target.value ? Number(e.target.value) : null }))} />
          </Field>
        </div>
        <Field label="Документ">
          <Input value={draft.documentNumber ?? ""} onChange={(e) => setDraft((d) => ({ ...d, documentNumber: e.target.value }))} />
        </Field>
        <Field label="Языки">
          <Textarea value={draft.languages ?? ""} onChange={(e) => setDraft((d) => ({ ...d, languages: e.target.value }))} placeholder="RU C2, EN B2, SR A2" />
        </Field>
        <Field label="Фото URL">
          <Input value={draft.photoUrl ?? ""} onChange={(e) => setDraft((d) => ({ ...d, photoUrl: e.target.value }))} />
        </Field>
        <Button block disabled={updateUser.isPending || !draft.displayName} onClick={save}>Сохранить</Button>
      </Card>

      <SectionHead label="История проектов" meta={`${history.length}`} />
      {projects.isLoading || assignmentQueries.some((q) => q.isLoading) ? (
        <Loading />
      ) : history.length === 0 ? (
        <EmptyState title="Назначений нет" />
      ) : (
        <div className="stack">
          {history.map(({ project, assignment }) => (
            <Card key={assignment.id}>
              <div className="row row--between">
                <div style={{ minWidth: 0 }}>
                  <p className="card__title">{project.name}</p>
                  <p className="card__subtitle">{dateRange(project.startsAt, project.endsAt)}</p>
                </div>
                <Chip label={assignment.status} tone={assignment.status === "declined" ? "warn" : "ok"} />
              </div>
              <p className="card__subtitle" style={{ marginTop: 6 }}>
                {assignment.roleNote || "роль не указана"}{assignment.rateEUR != null ? ` · ${assignment.rateEUR} €` : ""}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
