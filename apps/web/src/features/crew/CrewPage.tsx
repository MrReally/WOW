import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { Equipment, People, Projects } from "@sever/contracts";
import { Card, Button, SectionHead, Field, Input, Textarea, Loading, EmptyState, Chip } from "../../ui-kit/index.ts";
import { useSession } from "../../app/session.ts";
import { api } from "../../lib/api.ts";
import { dateRange, dateTime } from "../../lib/labels.ts";
import { usePeople, useUpdateUser } from "../settings/hooks.ts";
import { useProjectsForFinance } from "../finance/hooks.ts";
import { personName } from "../../lib/people.ts";

const actionLabel: Record<Equipment.JournalAction, string> = {
  created: "Создано",
  reserved: "Бронь",
  issued: "Выдача",
  returned: "Возврат",
  return_incomplete: "Некомплект",
  sent_to_repair: "В ремонт",
  back_from_repair: "Из ремонта",
  sent_to_contractor: "Подрядчику",
  back_from_contractor: "От подрядчика",
  marked_lost: "Утеря",
  transferred: "Перемещение",
  status_changed: "Статус",
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

function fullName(draft: People.UpdateUserInput): string {
  const parts = [draft.firstName, draft.lastName, draft.patronymic].map((p) => p?.trim()).filter(Boolean);
  return parts.join(" ") || draft.displayName?.trim() || "";
}

export function CrewPage() {
  const { can } = useSession();
  const people = usePeople();
  const projects = useProjectsForFinance();
  const updateUser = useUpdateUser();
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<People.UpdateUserInput>({});
  const [historyMode, setHistoryMode] = useState<"projects" | "actions">("projects");

  const list = people.data ?? [];
  const selected = list.find((u) => u.id === selectedId) ?? list[0] ?? null;
  const actionHistory = useQuery({
    enabled: !!selected,
    queryKey: ["people", selected?.id, "equipment-journal"],
    queryFn: () => api.get<Equipment.JournalEntryDTO[]>(`/api/people/${selected!.id}/equipment-journal`),
  });
  const units = useQuery({ queryKey: ["equipment", "units"], queryFn: () => api.get<Equipment.EquipmentUnitDTO[]>("/api/equipment/units") });
  const models = useQuery({ queryKey: ["equipment", "models"], queryFn: () => api.get<Equipment.EquipmentModelDTO[]>("/api/equipment/models") });
  const warehouses = useQuery({ queryKey: ["equipment", "warehouses"], queryFn: () => api.get<Equipment.WarehouseDTO[]>("/api/equipment/warehouses") });

  useEffect(() => {
    if (!selectedId && list[0]) setSelectedId(list[0].id);
  }, [list, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setDraft({
      displayName: selected.displayName,
      firstName: selected.firstName,
      lastName: selected.lastName,
      patronymic: selected.patronymic,
      nickname: selected.nickname,
      email: selected.email,
      telegramId: selected.telegramId,
      hourlyRateEUR: selected.hourlyRateEUR,
      documentNumber: selected.documentNumber,
      documentPhotoUrl: selected.documentPhotoUrl,
      languages: selected.languages,
      photoUrl: selected.photoUrl,
      usePhotoAsAvatar: selected.usePhotoAsAvatar,
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
    const name = fullName(draft);
    updateUser.mutate({
      id: selected.id,
      input: {
        ...draft,
        displayName: name || selected.displayName,
        firstName: draft.firstName || null,
        lastName: draft.lastName || null,
        patronymic: draft.patronymic || null,
        nickname: draft.nickname || null,
        email: draft.email || null,
        telegramId: draft.telegramId || null,
        hourlyRateEUR: draft.hourlyRateEUR == null || Number.isNaN(Number(draft.hourlyRateEUR)) ? null : Number(draft.hourlyRateEUR),
        documentNumber: draft.documentNumber || null,
        documentPhotoUrl: draft.documentPhotoUrl || null,
        languages: draft.languages || null,
        photoUrl: draft.photoUrl || null,
        usePhotoAsAvatar: !!draft.usePhotoAsAvatar,
        birthDate: draft.birthDate || null,
      },
    });
  };
  const attach = async (field: "photoUrl" | "documentPhotoUrl", file: File | undefined) => {
    if (!file) return;
    const url = await fileToDataUrl(file);
    setDraft((d) => ({ ...d, [field]: url }));
  };
  const avatarSrc = draft.usePhotoAsAvatar ? draft.photoUrl : null;

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
            {personName(person)}
          </button>
        ))}
      </div>

      <Card>
        <div className="row row--between" style={{ alignItems: "flex-start" }}>
          <div className="row" style={{ minWidth: 0 }}>
            {draft.photoUrl ? (
              <img src={avatarSrc || draft.photoUrl} alt="" className="crew-photo" />
            ) : (
              <span className="crew-photo crew-photo--empty">{personName(selected).slice(0, 2).toUpperCase()}</span>
            )}
            <div style={{ minWidth: 0 }}>
              <p className="card__title" style={{ fontSize: "var(--fs-lg)" }}>{personName(selected)}</p>
              <p className="card__subtitle">{selected.roleName}{selected.hourlyRateEUR != null ? ` · ${selected.hourlyRateEUR} €` : ""}</p>
            </div>
          </div>
          {!selected.active && <Chip label="выкл" tone="neutral" />}
        </div>
      </Card>

      <Card>
        <SectionHead label="Досье" />
        <div className="row">
          <Field label="Имя">
            <Input value={draft.firstName ?? ""} onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))} />
          </Field>
          <Field label="Фамилия">
            <Input value={draft.lastName ?? ""} onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))} />
          </Field>
        </div>
        <div className="row">
          <Field label="Отчество">
            <Input value={draft.patronymic ?? ""} onChange={(e) => setDraft((d) => ({ ...d, patronymic: e.target.value }))} />
          </Field>
          <Field label="Ник">
            <Input value={draft.nickname ?? ""} onChange={(e) => setDraft((d) => ({ ...d, nickname: e.target.value }))} placeholder="для таймингов" />
          </Field>
        </div>
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
        <div className="crew-attach">
          <div style={{ minWidth: 0 }}>
            <p className="card__title">Фото документа</p>
            <p className="card__subtitle">{draft.documentPhotoUrl ? "Файл приложен" : "Фото или скриншот"}</p>
          </div>
          {draft.documentPhotoUrl && <img src={draft.documentPhotoUrl} alt="" className="crew-attach__thumb" />}
          <label className="btn btn--secondary" style={{ height: 38, padding: "0 12px" }}>
            +
            <input type="file" accept="image/*" hidden onChange={(e) => attach("documentPhotoUrl", e.target.files?.[0])} />
          </label>
        </div>
        <Field label="Языки">
          <Textarea value={draft.languages ?? ""} onChange={(e) => setDraft((d) => ({ ...d, languages: e.target.value }))} placeholder="RU C2, EN B2, SR A2" />
        </Field>
        <div className="crew-attach">
          <div style={{ minWidth: 0 }}>
            <p className="card__title">Фото человека</p>
            <p className="card__subtitle">{draft.photoUrl ? "Файл приложен" : "Для досье или аватарки"}</p>
          </div>
          {draft.photoUrl && <img src={draft.photoUrl} alt="" className="crew-attach__thumb" />}
          <label className="btn btn--secondary" style={{ height: 38, padding: "0 12px" }}>
            +
            <input type="file" accept="image/*" hidden onChange={(e) => attach("photoUrl", e.target.files?.[0])} />
          </label>
        </div>
        <label className="row row--between" style={{ padding: "4px 0 12px", cursor: "pointer" }}>
          <span style={{ color: "var(--text)" }}>Использовать как аватарку</span>
          <input
            type="checkbox"
            checked={!!draft.usePhotoAsAvatar}
            disabled={!draft.photoUrl}
            onChange={(e) => setDraft((d) => ({ ...d, usePhotoAsAvatar: e.target.checked }))}
            style={{ width: 20, height: 20, accentColor: "var(--accent)", flexShrink: 0 }}
          />
        </label>
        <Button block disabled={updateUser.isPending || !fullName(draft)} onClick={save}>Сохранить</Button>
      </Card>

      <SectionHead label="История" meta={historyMode === "projects" ? `${history.length}` : `${actionHistory.data?.length ?? 0}`} />
      <div className="row" style={{ gap: 8 }}>
        <button className={`chip ${historyMode === "projects" ? "chip--accent chip--solid" : "chip--neutral"}`} style={{ border: "none", cursor: "pointer" }} onClick={() => setHistoryMode("projects")}>
          Проекты
        </button>
        <button className={`chip ${historyMode === "actions" ? "chip--accent chip--solid" : "chip--neutral"}`} style={{ border: "none", cursor: "pointer" }} onClick={() => setHistoryMode("actions")}>
          Действия
        </button>
      </div>
      {historyMode === "projects" ? (
        projects.isLoading || assignmentQueries.some((q) => q.isLoading) ? (
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
                  <Chip label={assignment.status} tone={assignment.status === "declined" ? "warn" : assignment.status === "cancelled" ? "neutral" : "ok"} />
                </div>
                <p className="card__subtitle" style={{ marginTop: 6 }}>
                  {assignment.roleNote || "роль не указана"}{assignment.rateEUR != null ? ` · ${assignment.rateEUR} €` : ""}
                </p>
              </Card>
            ))}
          </div>
        )
      ) : actionHistory.isLoading || units.isLoading || models.isLoading || warehouses.isLoading ? (
        <Loading />
      ) : (actionHistory.data ?? []).length === 0 ? (
        <EmptyState title="Действий нет" />
      ) : (
        <div className="stack">
          {(actionHistory.data ?? []).map((entry) => {
            const unit = entry.unitId ? (units.data ?? []).find((u) => u.id === entry.unitId) : null;
            const model = entry.modelId ? (models.data ?? []).find((m) => m.id === entry.modelId) : unit ? (models.data ?? []).find((m) => m.id === unit.modelId) : null;
            const project = entry.projectId ? (projects.data ?? []).find((p) => p.id === entry.projectId) : null;
            const fromWh = entry.fromWarehouseId ? (warehouses.data ?? []).find((w) => w.id === entry.fromWarehouseId)?.name : null;
            const toWh = entry.toWarehouseId || entry.warehouseId ? (warehouses.data ?? []).find((w) => w.id === (entry.toWarehouseId ?? entry.warehouseId))?.name : null;
            const target = unit?.assetTag || model?.name || "—";
            const route = fromWh || toWh ? `${fromWh ? `${fromWh} → ` : ""}${toWh ?? "—"}` : null;
            return (
              <Card key={entry.id}>
                <div className="row row--between">
                  <p className="card__title">{actionLabel[entry.action] ?? entry.action}</p>
                  <span className="card__subtitle">{dateTime(entry.at)}</span>
                </div>
                <p className="card__subtitle" style={{ marginTop: 6 }}>
                  {[target, project?.name, route, entry.qty ? `${entry.qty} шт.` : null].filter(Boolean).join(" · ")}
                </p>
                {entry.note && <p className="card__subtitle">{entry.note}</p>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
