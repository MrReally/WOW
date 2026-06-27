import { useState } from "react";
import type { People } from "@sever/contracts";
import { Card, Button, SectionHead, Field, Input, Select, Chip, Loading } from "../../../ui-kit/index.ts";
import { dateTime } from "../../../lib/labels.ts";
import { personName } from "../../../lib/people.ts";
import { usePeople, useRoles, useCreateUser, useUpdateUser, useResetPassword, useBotInfo } from "../hooks.ts";

const isLinked = (telegramId: string | null) => !!telegramId && /^\d+$/.test(telegramId);

export function PeopleManager() {
  const people = usePeople();
  const roles = useRoles();
  const botInfo = useBotInfo();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPw = useResetPassword();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [telegram, setTelegram] = useState("");
  const [roleId, setRoleId] = useState("");
  const [revealed, setRevealed] = useState<{ who: string; pw: string } | null>(null);

  if (people.isLoading || roles.isLoading) return <Loading />;
  const roleOptions = (roles.data ?? []).map((r) => ({ value: r.id, label: r.name }));
  const effRole = roleId || roleOptions[0]?.value || "";

  return (
    <div>
      <SectionHead label="Люди" meta={`${(people.data ?? []).length}`} />

      {revealed && (
        <Card style={{ marginBottom: 12, borderColor: "var(--accent)" }}>
          <p className="card__title">Временный пароль для {revealed.who}</p>
          <p className="card__subtitle" style={{ marginTop: 4 }}>Передайте его человеку — при первом входе он сменит пароль.</p>
          <div className="t-mono" style={{ fontSize: 22, fontWeight: 700, color: "var(--accent)", marginTop: 8, letterSpacing: "0.04em" }}>
            {revealed.pw}
          </div>
          <div style={{ marginTop: 10 }}>
            <Button variant="secondary" onClick={() => setRevealed(null)}>Скрыть</Button>
          </div>
        </Card>
      )}

      <div className="stack">
        {(people.data ?? []).map((u) => (
          <Card key={u.id}>
            <div className="row row--between">
              <div style={{ minWidth: 0 }}>
                <p className="card__title">{personName(u)} {!u.active && <Chip label="выкл" tone="neutral" />}</p>
                <p className="card__subtitle">
                  {u.email ?? "без email"}
                  {!isLinked(u.telegramId) && u.telegramId ? ` · @${u.telegramId.replace(/^@/, "")} (ждёт «Старт»)` : ""}
                  {" · с "}{dateTime(u.createdAt)}
                  {u.mustChangePassword ? " · ждёт смены пароля" : ""}
                </p>
              </div>
              <div style={{ width: 150 }}>
                <Select
                  value={u.roleId ?? ""}
                  onChange={(e) => updateUser.mutate({ id: u.id, input: { roleId: e.target.value } })}
                  options={roleOptions}
                />
              </div>
            </div>
            <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
              {u.email && (
                <Button
                  variant="ghost"
                  disabled={resetPw.isPending}
                  onClick={() => resetPw.mutate(u.id, { onSuccess: (r) => setRevealed({ who: personName(u), pw: r.temporaryPassword }) })}
                >
                  Сбросить пароль
                </Button>
              )}
              {isLinked(u.telegramId) ? (
                <span className="icon-btn icon-btn--ok" title="Telegram привязан" aria-label="Telegram привязан">✓</span>
              ) : botInfo.data?.username ? (
                <a
                  className="icon-btn"
                  href={`https://t.me/${botInfo.data.username}?start=${u.id}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Привязать Telegram"
                  aria-label="Привязать Telegram"
                >
                  TG
                </a>
              ) : null}
            </div>
          </Card>
        ))}
      </div>

      <Card style={{ marginTop: 12 }}>
        <SectionHead label="Добавить человека" />
        <Field label="Имя"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя Фамилия" /></Field>
        <Field label="Email (для входа по паролю)"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></Field>
        <Field label="Telegram @username (для привязки бота)"><Input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@username (необязательно)" /></Field>
        <Field label="Роль"><Select value={effRole} onChange={(e) => setRoleId(e.target.value)} options={roleOptions} /></Field>
        <Button
          block
          disabled={!name || (!email && !telegram) || !effRole || createUser.isPending}
          onClick={() =>
            createUser.mutate(
              { displayName: name, roleId: effRole, email: email || null, telegramId: telegram || null } as People.CreateUserInput,
              {
                onSuccess: (res) => {
                  setName(""); setEmail(""); setTelegram("");
                  if (res.temporaryPassword) setRevealed({ who: personName(res.user), pw: res.temporaryPassword });
                },
              }
            )
          }
        >
          Создать
        </Button>
        <p className="card__subtitle" style={{ marginTop: 8 }}>
          С email — сгенерируется временный пароль. С @username — человек открывает бота и жмёт «Старт»,
          и привязка происходит сама (вход через Telegram, без пароля).
        </p>
      </Card>
    </div>
  );
}
