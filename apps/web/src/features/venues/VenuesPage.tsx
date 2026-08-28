import { useEffect, useState } from "react";
import type { Venues } from "@sever/contracts";
import { Button, Card, Chip, EmptyState, Field, Input, Loading, SectionTitle } from "../../ui-kit/index.ts";
import { useSession } from "../../app/session.ts";
import { AddressInput } from "../places/AddressInput.tsx";
import { useArchiveVenue, useCreateVenue, useDeleteVenue, useUpdateVenue, useVenues } from "../plans/hooks.ts";

type Draft = Pick<Venues.CreateVenueInput, "name" | "address" | "notes" | "contacts" | "workingHours" | "widthM" | "depthM" | "isVenue" | "isWarehouse">;
const emptyDraft = (): Draft => ({ name: "", address: "", notes: "", contacts: "", workingHours: "", widthM: null, depthM: null, isVenue: true, isWarehouse: false });

export function VenuesPage() {
  const { can } = useSession();
  const [showArchive, setShowArchive] = useState(false);
  const venues = useVenues(showArchive);
  const create = useCreateVenue();
  const update = useUpdateVenue();
  const archive = useArchiveVenue();
  const remove = useDeleteVenue();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const saveNew = () => create.mutate(draft as Venues.CreateVenueInput, { onSuccess: () => { setDraft(emptyDraft()); setCreating(false); } });
  return <div className="stack">
    <div className="row row--between"><SectionTitle>Venues</SectionTitle><div className="row"><label className="chip chip--neutral"><input type="checkbox" checked={showArchive} onChange={e => setShowArchive(e.target.checked)} /> Архив</label>{can("venues.manage") && <Button onClick={() => setCreating(true)}>+ Площадка</Button>}</div></div>
    {creating && <Card><VenueForm draft={draft} setDraft={setDraft} /><div className="row"><Button block disabled={!draft.name.trim() || create.isPending} onClick={saveNew}>Создать</Button><Button block variant="secondary" onClick={() => setCreating(false)}>Отмена</Button></div></Card>}
    {venues.isLoading ? <Loading /> : (venues.data ?? []).length === 0 ? <EmptyState title="Площадок пока нет" /> : (venues.data ?? []).map(venue => <VenueCard key={venue.id} venue={venue} canEdit={can("venues.manage")} canArchive={can("venues.archive", "venues.manage")} canDelete={can("venues.delete")} onSave={input => update.mutate({ id: venue.id, input })} onArchive={() => archive.mutate({ id: venue.id, archived: !venue.archivedAt })} onDelete={() => confirm(`Удалить «${venue.name}» окончательно?`) && remove.mutate(venue.id)} />)}
  </div>;
}

function VenueCard({ venue, canEdit, canArchive, canDelete, onSave, onArchive, onDelete }: { venue: Venues.VenueDTO; canEdit: boolean; canArchive: boolean; canDelete: boolean; onSave: (input: Venues.UpdateVenueInput) => void; onArchive: () => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(venue);
  useEffect(() => setDraft(venue), [venue]);
  return <Card><div className="row row--between"><div><div className="row"><p className="card__title">{venue.name}</p>{venue.archivedAt && <Chip label="архив" tone="neutral" />}</div><p className="card__subtitle">{venue.address || "Адрес не указан"}</p><p className="card__subtitle">{[venue.contacts, venue.workingHours].filter(Boolean).join(" · ") || "Контакты не указаны"}</p></div><div className="row">{canEdit && <Button variant="secondary" onClick={() => setEditing(v => !v)}>{editing ? "Закрыть" : "Редактировать"}</Button>}{canArchive && <Button variant="secondary" onClick={onArchive}>{venue.archivedAt ? "Восстановить" : "В архив"}</Button>}{venue.archivedAt && canDelete && <Button variant="danger" onClick={onDelete}>Удалить</Button>}</div></div>{editing && <div className="stack" style={{ marginTop: 12 }}><VenueForm draft={draft} setDraft={setDraft} /><Button disabled={!draft.name.trim()} onClick={() => { onSave(draft); setEditing(false); }}>Сохранить</Button></div>}</Card>;
}

function VenueForm({ draft, setDraft }: { draft: Draft; setDraft: (value: Draft) => void }) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });
  return <div className="stack"><Field label="Название"><Input value={draft.name} onChange={e => set("name", e.target.value)} /></Field><Field label="Адрес"><AddressInput value={draft.address ?? ""} onChange={v => set("address", v || null)} /></Field><div className="row"><Field label="Контакты"><Input value={draft.contacts ?? ""} onChange={e => set("contacts", e.target.value || null)} /></Field><Field label="Время работы"><Input value={draft.workingHours ?? ""} onChange={e => set("workingHours", e.target.value || null)} /></Field></div><div className="row"><Field label="Ширина сцены, м"><Input type="number" value={draft.widthM ?? ""} onChange={e => set("widthM", e.target.value ? Number(e.target.value) : null)} /></Field><Field label="Глубина сцены, м"><Input type="number" value={draft.depthM ?? ""} onChange={e => set("depthM", e.target.value ? Number(e.target.value) : null)} /></Field></div><Field label="Заметки"><Input value={draft.notes ?? ""} onChange={e => set("notes", e.target.value || null)} /></Field><div className="row"><label><input type="checkbox" checked={draft.isVenue ?? true} onChange={e => set("isVenue", e.target.checked)} /> Площадка</label><label><input type="checkbox" checked={draft.isWarehouse ?? false} onChange={e => set("isWarehouse", e.target.checked)} /> Склад</label></div></div>;
}
