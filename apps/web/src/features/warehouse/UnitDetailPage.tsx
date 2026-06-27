import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import type { Equipment } from "@sever/contracts";
import { Card, Button, SectionTitle, StatusBadge, Select, Input, Textarea, Loading, ErrorState } from "../../ui-kit/index.ts";
import { unitStatusLabel, unitStatusTone, dateTime } from "../../lib/labels.ts";
import { personName } from "../../lib/people.ts";
import { useSession } from "../../app/session.ts";
import {
  useUnit, useUnitJournal, useChangeStatus, useUpdateUnit,
  useModels, useTypes, useUnitRepairs, useProjectsForOps, usePeopleNames,
  useWarehouses,
} from "./hooks.ts";
import { RepairContractorPanel } from "./components/RepairContractor.tsx";

const journalActionLabel: Record<Equipment.JournalAction, string> = {
  created: "Создано",
  reserved: "Зарезервировано",
  issued: "Выдано на проект",
  returned: "Возвращено",
  return_incomplete: "Некомплект",
  sent_to_repair: "В ремонт",
  back_from_repair: "Из ремонта",
  sent_to_contractor: "Подрядчику",
  back_from_contractor: "От подрядчика",
  marked_lost: "Утеряно",
  transferred: "Перемещено",
  status_changed: "Смена статуса",
};

const eur = (n: number) => `${n.toLocaleString("ru-RU")} €`;

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="row row--between" style={{ padding: "5px 0", gap: 12 }}>
      <span className="card__subtitle" style={{ flexShrink: 0 }}>{label}</span>
      <span style={{ textAlign: "right", color: "var(--text)", minWidth: 0, wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

export function UnitDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useSession();
  const canEdit = can("warehouse.unit.status");
  const canCatalog = can("warehouse.catalog.manage");

  const unit = useUnit(id);
  const journal = useUnitJournal(id);
  const models = useModels();
  const types = useTypes();
  const repairs = useUnitRepairs(id);
  const projects = useProjectsForOps();
  const people = usePeopleNames(can("people.view"));
  const warehouses = useWarehouses();
  const changeStatus = useChangeStatus();
  const updateUnit = useUpdateUnit();

  const [serialDraft, setSerialDraft] = useState("");
  const [assetTagDraft, setAssetTagDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  useEffect(() => {
    if (unit.data) {
      setAssetTagDraft(unit.data.assetTag);
      setSerialDraft(unit.data.serial ?? "");
      setNotesDraft(unit.data.notes ?? "");
    }
  }, [unit.data?.id, unit.data?.assetTag, unit.data?.serial, unit.data?.notes]);

  const journalEntries = useMemo(() => {
    let currentWarehouseId: string | null = null;
    return (journal.data ?? []).map((entry) => {
      const isTransfer =
        entry.action === "transferred" ||
        (entry.action === "status_changed" && entry.warehouseId && entry.fromStatus === entry.toStatus);
      const fromWarehouseId = entry.fromWarehouseId ?? (isTransfer ? currentWarehouseId : null);
      const toWarehouseId = entry.toWarehouseId ?? (isTransfer ? entry.warehouseId : null);
      if (entry.action === "created" && entry.warehouseId) currentWarehouseId = entry.warehouseId;
      if (toWarehouseId) currentWarehouseId = toWarehouseId;
      return { ...entry, fromWarehouseId, toWarehouseId };
    });
  }, [journal.data]);

  if (unit.isLoading) return <Loading />;
  if (unit.error) return <ErrorState error={unit.error} onRetry={unit.refetch} />;
  if (!unit.data) return null;
  const u = unit.data;

  const model = (models.data ?? []).find((m) => m.id === u.modelId) ?? null;
  const type = model ? (types.data ?? []).find((t) => t.id === model.typeId) ?? null : null;
  const cable = model?.attrs && typeof model.attrs === "object" && "cableType" in model.attrs ? (model.attrs as Equipment.CableAttrs) : null;
  const projectName = u.currentProjectId ? (projects.data ?? []).find((p) => p.id === u.currentProjectId)?.name ?? null : null;
  const warehouseList = warehouses.data ?? [];
  const warehouseName = (wid: string | null) => warehouseList.find((w) => w.id === wid)?.name ?? "—";
  const repairTotal = (repairs.data ?? []).filter((r) => r.status === "closed").reduce((s, r) => s + (r.costEUR ?? 0), 0);

  const assetTagDirty = assetTagDraft !== u.assetTag;
  const serialDirty = serialDraft !== (u.serial ?? "");
  const notesDirty = notesDraft !== (u.notes ?? "");

  const statusOptions: Equipment.UnitStatus[] = ["in_stock", "in_repair", "at_contractor", "lost", "reserved"];

  const navState = location.state as { backTo?: string; reopenReservationId?: string; selectedUnitIds?: string[] } | null;
  const goBack = () => {
    if (navState?.backTo) {
      navigate(navState.backTo, {
        state: {
          reopenReservationId: navState.reopenReservationId,
          selectedUnitIds: navState.selectedUnitIds,
        },
      });
      return;
    }
    navigate(-1);
  };

  return (
    <div className="stack">
      <Button variant="ghost" onClick={goBack}>← Назад</Button>

      {/* Identity */}
      <Card>
        <div className="row row--between">
          <div style={{ minWidth: 0 }}>
            <p className="card__title" style={{ fontSize: "var(--fs-lg)" }}>{u.assetTag}</p>
            <p className="card__subtitle">{model?.name ?? "—"}{model?.manufacturer ? ` · ${model.manufacturer}` : ""}</p>
          </div>
          <StatusBadge tone={unitStatusTone[u.status]}>{unitStatusLabel[u.status]}</StatusBadge>
        </div>
      </Card>

      {/* Model-general info */}
      <Card>
        <SectionTitle>О модели</SectionTitle>
        <InfoRow label="Модель" value={model?.name ?? "—"} />
        <InfoRow label="Тип" value={type?.name ?? "—"} />
        <InfoRow label="Производитель" value={model?.manufacturer || "—"} />
        <InfoRow label="Стоимость (замена)" value={model ? eur(model.unitCostEUR) : "—"} />
        <InfoRow label="Аренда / сутки" value={model ? eur(model.dailyPriceEUR) : "—"} />
        {cable && (
          <>
            <InfoRow label="Кабель" value={cable.cableType} />
            <InfoRow label="Длина" value={`${cable.lengthM} м`} />
            <InfoRow label="Разъёмы" value={cable.connectors} />
          </>
        )}
      </Card>

      {/* Unit-specific particulars */}
      <Card>
        <SectionTitle>Эта единица</SectionTitle>
        <InfoRow label="Инв. номер" value={u.assetTag} />
        <InfoRow label="Статус" value={unitStatusLabel[u.status]} />
        <InfoRow label="Склад" value={warehouseName(u.warehouseId)} />
        {projectName && <InfoRow label="Сейчас на проекте" value={projectName} />}
        <InfoRow label="В системе с" value={dateTime(u.createdAt)} />
        <InfoRow label="Потрачено на ремонт" value={repairTotal > 0 ? eur(repairTotal) : "—"} />

        <div style={{ marginTop: 10 }}>
          <span className="field__label">Название / инв. номер</span>
          {canCatalog ? (
            <div className="row" style={{ marginTop: 4 }}>
              <div style={{ flex: 1 }}>
                <Input value={assetTagDraft} onChange={(e) => setAssetTagDraft(e.target.value)} placeholder="STROBE-ABL-002" />
              </div>
              <Button
                variant="secondary"
                disabled={!assetTagDirty || !assetTagDraft.trim() || updateUnit.isPending}
                onClick={() => updateUnit.mutate({ id: u.id, input: { assetTag: assetTagDraft.trim() } })}
              >
                Сохранить
              </Button>
            </div>
          ) : (
            <p style={{ marginTop: 4 }}>{u.assetTag}</p>
          )}
        </div>

        <div style={{ marginTop: 10 }}>
          <span className="field__label">Серийный номер</span>
          {canEdit ? (
            <div className="row" style={{ marginTop: 4 }}>
              <div style={{ flex: 1 }}>
                <Input value={serialDraft} onChange={(e) => setSerialDraft(e.target.value)} placeholder="S/N" />
              </div>
              <Button
                variant="secondary"
                disabled={!serialDirty || updateUnit.isPending}
                onClick={() => updateUnit.mutate({ id: u.id, input: { serial: serialDraft.trim() || null } })}
              >
                Сохранить
              </Button>
            </div>
          ) : (
            <p style={{ marginTop: 4 }}>{u.serial || "—"}</p>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <span className="field__label">Особенности и дефекты</span>
          {canEdit ? (
            <>
              <div style={{ marginTop: 4 }}>
                <Textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Царапина на корпусе, не работает кнопка 3, идёт со своим кейсом…"
                />
              </div>
              <Button
                block
                style={{ marginTop: 6 }}
                disabled={!notesDirty || updateUnit.isPending}
                onClick={() => updateUnit.mutate({ id: u.id, input: { notes: notesDraft.trim() || null } })}
              >
                Сохранить заметку
              </Button>
            </>
          ) : (
            <p style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{u.notes || "Особенностей не отмечено"}</p>
          )}
        </div>
      </Card>

      {canEdit && <RepairContractorPanel unit={u} />}

      {canEdit && (
        <Card>
          <SectionTitle>Сменить статус вручную</SectionTitle>
          <Select
            value={u.status}
            onChange={(e) => changeStatus.mutate({ id: u.id, status: e.target.value as Equipment.UnitStatus })}
            options={statusOptions.map((s) => ({ value: s, label: unitStatusLabel[s] }))}
          />
        </Card>
      )}

      <SectionTitle>История перемещений</SectionTitle>
      <p className="card__subtitle" style={{ marginTop: -4 }}>Полный путь от поступления до текущего момента — кто, когда и куда.</p>
      {journal.isLoading ? (
        <Loading />
      ) : (
        <div className="stack">
          {journalEntries.slice().reverse().map((e) => {
            const proj = e.projectId ? (projects.data ?? []).find((p) => p.id === e.projectId)?.name ?? null : null;
            const actor = e.actorId ? personName((people.data ?? []).find((u) => u.id === e.actorId), e.actorId.slice(0, 8)) : null;
            const transition =
              e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus
                ? `${unitStatusLabel[e.fromStatus]} → ${unitStatusLabel[e.toStatus]}`
                : null;
            const warehouseRoute = e.toWarehouseId
              ? `Склад: ${e.fromWarehouseId ? `${warehouseName(e.fromWarehouseId)} → ` : ""}${warehouseName(e.toWarehouseId)}`
              : null;
            const where = proj ? `Проект: ${proj}` : transition;
            const meta = [warehouseRoute, where, actor ? `Кто: ${actor}` : null].filter(Boolean).join(" · ");
            return (
              <Card key={e.id}>
                <div className="row row--between">
                  <p className="card__title">{journalActionLabel[e.action] ?? e.action}</p>
                  <span className="card__subtitle">{dateTime(e.at)}</span>
                </div>
                {meta && <p className="card__subtitle">{meta}</p>}
                {e.note && <p className="card__subtitle">{e.note}</p>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
