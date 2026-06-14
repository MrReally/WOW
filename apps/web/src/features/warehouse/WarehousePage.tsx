import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Equipment } from "@sever/contracts";
import { Card, Button, SectionTitle, StatusBadge, Loading, ErrorState, EmptyState } from "../../ui-kit/index.ts";
import { eur, unitStatusLabel, unitStatusTone } from "../../lib/labels.ts";
import { useSession } from "../../app/session.ts";
import { useModels, useUnits, useTypes, useProjectsForOps } from "./hooks.ts";
import { AddModelSheet } from "./components/AddModelSheet.tsx";
import { OpsSheet } from "./components/OpsSheet.tsx";

function ModelCard({ model, units }: { model: Equipment.EquipmentModelDTO; units: Equipment.EquipmentUnitDTO[] }) {
  const mine = units.filter((u) => u.modelId === model.id);
  const inStock = mine.filter((u) => u.status === "in_stock").length;
  const onProject = mine.filter((u) => u.status === "on_project").length;
  return (
    <Card>
      <div className="row row--between">
        <div>
          <p className="card__title">{model.name}</p>
          <p className="card__subtitle">{model.manufacturer ?? "—"} · {eur(model.dailyPriceEUR)}/день</p>
        </div>
        <div className="row">
          <StatusBadge tone="ok">{inStock} своб.</StatusBadge>
          {onProject > 0 && <StatusBadge tone="warn">{onProject} в работе</StatusBadge>}
        </div>
      </div>
    </Card>
  );
}

export function WarehousePage() {
  const { role } = useSession();
  const canEdit = role === "admin" || role === "warehouse";
  const navigate = useNavigate();
  const models = useModels();
  const units = useUnits();
  const types = useTypes();
  const projects = useProjectsForOps();

  const [addOpen, setAddOpen] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Equipment.UnitStatus | "all">("all");

  if (models.isLoading || units.isLoading) return <Loading />;
  if (models.error) return <ErrorState error={models.error} onRetry={models.refetch} />;

  const allUnits = units.data ?? [];
  const filtered = statusFilter === "all" ? allUnits : allUnits.filter((u) => u.status === statusFilter);
  const statuses: (Equipment.UnitStatus | "all")[] = ["all", "in_stock", "on_project", "in_repair", "reserved", "lost"];

  return (
    <div className="stack">
      <div className="row">
        <Button block onClick={() => setOpsOpen(true)}>Выдача / Возврат</Button>
        {canEdit && <Button variant="secondary" onClick={() => setAddOpen(true)}>+ Каталог</Button>}
      </div>

      <SectionTitle>Каталог</SectionTitle>
      {(models.data ?? []).length === 0 ? (
        <EmptyState title="Каталог пуст" hint={canEdit ? "Добавьте тип, модель и единицы" : undefined} />
      ) : (
        <div className="stack">
          {(models.data ?? []).map((m) => (
            <ModelCard key={m.id} model={m} units={allUnits} />
          ))}
        </div>
      )}

      <SectionTitle>Единицы</SectionTitle>
      <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
        {statuses.map((s) => (
          <Button key={s} variant={statusFilter === s ? "primary" : "ghost"} onClick={() => setStatusFilter(s)}>
            {s === "all" ? "Все" : unitStatusLabel[s]}
          </Button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="Нет единиц" />
      ) : (
        <div className="stack">
          {filtered.map((u) => {
            const model = (models.data ?? []).find((m) => m.id === u.modelId);
            return (
              <Card key={u.id} onClick={() => navigate(`/warehouse/units/${u.id}`)}>
                <div className="row row--between">
                  <div>
                    <p className="card__title">{u.assetTag}</p>
                    <p className="card__subtitle">{model?.name ?? u.modelId}</p>
                  </div>
                  <StatusBadge tone={unitStatusTone[u.status]}>{unitStatusLabel[u.status]}</StatusBadge>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {canEdit && (
        <AddModelSheet open={addOpen} onClose={() => setAddOpen(false)} types={types.data ?? []} models={models.data ?? []} />
      )}
      <OpsSheet
        open={opsOpen}
        onClose={() => setOpsOpen(false)}
        projects={projects.data ?? []}
        models={models.data ?? []}
      />
    </div>
  );
}
