import { useState } from "react";
import type { Finance } from "@sever/contracts";
import { Button, Card, Field, Input, Select } from "../../../ui-kit/index.ts";
import { useSaveTransactionCategory, useTransactionCategories } from "../../finance/hooks.ts";

export function TransactionCategories() {
  const categories = useTransactionCategories();
  const save = useSaveTransactionCategory();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Finance.TxKind>("expense");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");
  const submit = async (input: {id?: string; name: string; kind: Finance.TxKind; active: boolean}) => {
    setError("");
    try { await save.mutateAsync(input); setName(""); setEditingId(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить категорию"); }
  };
  return <div className="stack"><Card><p className="card__title">Категории транзакций</p><p className="card__subtitle">Архивные категории сохраняются в истории и недоступны для новых операций.</p>
    <Field label="Название"><Input value={name} onChange={e=>setName(e.target.value)} /></Field>
    <Field label="Тип операции"><Select value={kind} onChange={e=>setKind(e.target.value as Finance.TxKind)} options={[{value:"expense",label:"Списание"},{value:"income",label:"Начисление"}]} /></Field>
    <Button disabled={!name.trim() || save.isPending} onClick={()=>void submit({name,kind,active:true})}>Добавить категорию</Button>
  </Card>{categories.isError && <p role="alert">Не удалось загрузить категории.</p>}{error && <p role="alert">{error}</p>}
  {(categories.data ?? []).map(c=><Card key={c.id}><p className="card__subtitle">{c.kind === "income" ? "Начисление" : "Списание"}{!c.active && " · в архиве"}</p>
    {editingId === c.id ? <><Input value={editingName} onChange={e=>setEditingName(e.target.value)} /><div className="row"><Button disabled={!editingName.trim() || save.isPending} onClick={()=>void submit({id:c.id,name:editingName,kind:c.kind,active:c.active})}>Сохранить</Button><Button variant="ghost" onClick={()=>setEditingId("")}>Отмена</Button></div></> : <><p className="card__title">{c.name}</p><div className="row"><Button variant="ghost" onClick={()=>{setEditingId(c.id);setEditingName(c.name);}}>Переименовать</Button><Button variant="ghost" disabled={save.isPending} onClick={()=>void submit({id:c.id,name:c.name,kind:c.kind,active:!c.active})}>{c.active ? "В архив" : "Восстановить"}</Button></div></>}
  </Card>)}</div>;
}
