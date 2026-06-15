import { useState } from "react";
import type { People } from "@sever/contracts";
import { ROLES, CURRENCIES } from "@sever/contracts";
import { Card, Button, SectionTitle, Field, Input, Select, Loading } from "../../ui-kit/index.ts";
import { roleLabel, dateTime } from "../../lib/labels.ts";
import { useTheme } from "../../app/theme.tsx";
import { platform } from "../../app/platform/telegram.ts";
import { getDevUser, setDevUser } from "../../lib/api.ts";
import { usePeople, useFxRates, useCreateUser, useUpdateUser, useSetFxRate, useResetData } from "./hooks.ts";

export function SettingsPage() {
  const { theme, toggle } = useTheme();
  const people = usePeople();
  const fx = useFxRates();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const setFx = useSetFxRate();
  const resetData = useResetData();

  const [newTg, setNewTg] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<People.UserDTO["role"]>("tech");

  return (
    <div className="stack">
      <SectionTitle>Оформление</SectionTitle>
      <Card>
        <div className="row row--between">
          <p className="card__title">Тема: {theme === "dark" ? "Тёмная" : "Светлая"}</p>
          <Button variant="secondary" onClick={toggle}>Переключить</Button>
        </div>
      </Card>

      {platform.kind === "pwa" && (
        <>
          <SectionTitle>Разработка — войти как</SectionTitle>
          <Card>
            <p className="card__subtitle" style={{ marginBottom: "var(--space-3)" }}>
              Без Telegram роль определяется заголовком x-dev-user. Текущий: <b>{getDevUser()}</b>
            </p>
            <div className="row" style={{ flexWrap: "wrap" }}>
              {["dev-admin", "tech-001"].map((id) => (
                <Button
                  key={id}
                  variant={getDevUser() === id ? "primary" : "secondary"}
                  onClick={() => { setDevUser(id); location.reload(); }}
                >
                  {id}
                </Button>
              ))}
            </div>
          </Card>
        </>
      )}

      <SectionTitle>Курсы валют (к EUR)</SectionTitle>
      {fx.isLoading ? (
        <Loading />
      ) : (
        <div className="stack">
          {(fx.data ?? []).map((r) => (
            <FxRow key={r.currency} currency={r.currency} rate={r.rateToEUR} onSave={(v) => setFx.mutate({ currency: r.currency, rateToEUR: v })} disabled={r.currency === "EUR"} />
          ))}
          <AddFxRow existing={(fx.data ?? []).map((r) => r.currency)} onAdd={(c, v) => setFx.mutate({ currency: c, rateToEUR: v })} />
        </div>
      )}

      <SectionTitle>Люди и роли</SectionTitle>
      {people.isLoading ? (
        <Loading />
      ) : (
        <div className="stack">
          {(people.data ?? []).map((u) => (
            <Card key={u.id}>
              <div className="row row--between">
                <div>
                  <p className="card__title">{u.displayName}</p>
                  <p className="card__subtitle">tg: {u.telegramId} · с {dateTime(u.createdAt)}</p>
                </div>
                <div style={{ width: 170 }}>
                  <Select
                    value={u.role}
                    onChange={(e) => updateUser.mutate({ id: u.id, input: { role: e.target.value as People.UserDTO["role"] } })}
                    options={ROLES.map((r) => ({ value: r, label: roleLabel[r] }))}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <SectionTitle>Добавить пользователя</SectionTitle>
        <Field label="Telegram ID">
          <Input value={newTg} onChange={(e) => setNewTg(e.target.value)} placeholder="123456789" />
        </Field>
        <Field label="Имя">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Имя Фамилия" />
        </Field>
        <Field label="Роль">
          <Select value={newRole} onChange={(e) => setNewRole(e.target.value as People.UserDTO["role"])} options={ROLES.map((r) => ({ value: r, label: roleLabel[r] }))} />
        </Field>
        <Button
          block
          disabled={!newTg || !newName || createUser.isPending}
          onClick={() =>
            createUser.mutate(
              { telegramId: newTg, displayName: newName, role: newRole },
              { onSuccess: () => { setNewTg(""); setNewName(""); } }
            )
          }
        >
          Добавить
        </Button>
      </Card>

      <SectionTitle>Данные</SectionTitle>
      <Card>
        <p className="card__subtitle" style={{ marginBottom: 12, color: "var(--text2)" }}>
          Пересоздать базу демо-данными для знакомства, или очистить всё, чтобы начать заполнять свои.
        </p>
        <div className="row">
          <Button
            block
            variant="secondary"
            disabled={resetData.isPending}
            onClick={() => {
              if (confirm("Перезаписать ВСЕ данные демо-набором? Текущие данные будут удалены.")) {
                resetData.mutate("demo");
              }
            }}
          >
            Загрузить демо
          </Button>
          <Button
            block
            variant="danger"
            disabled={resetData.isPending}
            onClick={() => {
              if (confirm("Удалить ВСЕ данные и начать с чистого листа? Это необратимо.")) {
                resetData.mutate("empty");
              }
            }}
          >
            Очистить всё
          </Button>
        </div>
      </Card>
    </div>
  );
}

function FxRow({ currency, rate, onSave, disabled }: { currency: string; rate: number; onSave: (v: number) => void; disabled?: boolean }) {
  const [val, setVal] = useState(String(rate));
  return (
    <Card>
      <div className="row row--between">
        <p className="card__title">{currency}</p>
        <div className="row">
          <div style={{ width: 120 }}>
            <Input type="number" step="0.0001" value={val} onChange={(e) => setVal(e.target.value)} disabled={disabled} />
          </div>
          {!disabled && <Button variant="secondary" onClick={() => onSave(Number(val))}>OK</Button>}
        </div>
      </div>
    </Card>
  );
}

function AddFxRow({ existing, onAdd }: { existing: string[]; onAdd: (c: import("@sever/contracts").Currency, v: number) => void }) {
  const available = CURRENCIES.filter((c) => !existing.includes(c));
  const [cur, setCur] = useState(available[0] ?? "USD");
  const [val, setVal] = useState("1");
  if (available.length === 0) return null;
  return (
    <Card>
      <div className="row">
        <div style={{ flex: 1 }}>
          <Select value={cur} onChange={(e) => setCur(e.target.value as typeof cur)} options={available.map((c) => ({ value: c, label: c }))} />
        </div>
        <div style={{ width: 120 }}>
          <Input type="number" step="0.0001" value={val} onChange={(e) => setVal(e.target.value)} />
        </div>
        <Button onClick={() => onAdd(cur, Number(val))}>+ Курс</Button>
      </div>
    </Card>
  );
}
