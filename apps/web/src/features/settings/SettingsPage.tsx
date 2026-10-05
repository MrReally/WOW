import { useEffect, useState } from "react";
import type { AppSettings, Currency } from "@sever/contracts";
import { CURRENCIES, DATE_FORMATS, formatDateValue, formatProjectName, formatTimeValue } from "@sever/contracts";
import { Card, Button, SectionTitle, Input, Select, Loading } from "../../ui-kit/index.ts";
import { useTheme } from "../../app/theme.tsx";
import { useSession } from "../../app/session.ts";
import { useAllCalendarFeed, useClientFollowupNotificationSettings, useCreateDressCodeOption, useDateTimeSettings, useDressCodeOptions, useFxRates, useProjectNameTemplateSettings, useProjectProblemNotificationSettings, useSetClientFollowupNotificationSettings, useSetDateTimeSettings, useSetFxRate, useResetData, useResetStatus, useSetProjectNameTemplateSettings, useSetProjectProblemNotificationSettings, useSetTelegramInboxSettings, useTelegramInboxSettings, useUpdateDressCodeOption } from "./hooks.ts";
import { RoleEditor } from "./components/RoleEditor.tsx";
import { useCableSettings, useSetCableSettings } from "../warehouse/hooks.ts";
import { nameFormatForInput, nameFormatFromInput } from "../warehouse/cables.ts";
import { BackupManager } from "./components/BackupManager.tsx";
import { FleetManager } from "./components/FleetManager.tsx";

export function SettingsPage() {
  const { theme, toggle } = useTheme();
  const { can } = useSession();
  const fx = useFxRates();
  const setFx = useSetFxRate();
  const resetData = useResetData();
  const resetStatus = useResetStatus(can("data.reset"));
  const canResetData = can("data.reset") && resetStatus.data?.available === true;
  const canTelegramInbox = can("telegram.inbox.manage", "people.manage");
  const canViewAllCalendar = can("projects.timing.viewAll", "projects.manage", "roles.manage");
  const allCalendar = useAllCalendarFeed(canViewAllCalendar);
  const telegramInbox = useTelegramInboxSettings(canTelegramInbox);
  const setTelegramInbox = useSetTelegramInboxSettings();
  const cableSettings = useCableSettings(can("warehouse.catalog.manage"));
  const setCableSettings = useSetCableSettings();
  const [workTelegram, setWorkTelegram] = useState("");
  const [connectors, setConnectors] = useState("");
  const [nameFormat, setNameFormat] = useState("");
  const [extensionNameFormat, setExtensionNameFormat] = useState("");

  useEffect(() => {
    if (telegramInbox.data) {
      setWorkTelegram(telegramInbox.data.workUsername ? `@${telegramInbox.data.workUsername.replace(/^@/, "")}` : "");
    }
  }, [telegramInbox.data]);

  useEffect(() => {
    if (!cableSettings.data) return;
    setConnectors(cableSettings.data.connectors.join("\n"));
    setNameFormat(nameFormatForInput(cableSettings.data.nameFormat, " "));
    setExtensionNameFormat(nameFormatForInput(cableSettings.data.extensionNameFormat ?? ["E[length]m[outlets]s"], ""));
  }, [cableSettings.data]);

  return (
    <div className="stack">
      <SectionTitle>Оформление</SectionTitle>
      <Card>
        <div className="row row--between">
          <p className="card__title">Тема: {theme === "dark" ? "Тёмная" : "Светлая"}</p>
          <Button variant="secondary" onClick={toggle}>Переключить</Button>
        </div>
      </Card>

      {can("roles.manage") && <DateTimeFormatSettings />}

      {can("roles.manage") && <ProjectProblemNotificationSettings />}

      {can("roles.manage") && <ClientFollowupNotificationSettings />}

      {can("roles.manage") && <RoleEditor />}

      {can("projects.manage") && <DressCodeSettings />}

      {can("projects.manage") && <ProjectNameTemplateSettings />}

      {canViewAllCalendar && (
        <>
          <SectionTitle>Google Calendar</SectionTitle>
          <Card>
            <p className="card__title">Все проекты и тайминги</p>
            <p className="card__subtitle" style={{ marginTop: 4 }}>
              Технический календарь со всеми событиями. Название аренды указано в каждом событии и отдельной календарной категории.
            </p>
            {allCalendar.isLoading ? <Loading /> : (
              <>
                <div style={{ marginTop: 10 }}>
                  <code style={{ display: "block", wordBreak: "break-all", color: "var(--text)", fontSize: 12 }}>{allCalendar.data?.url ?? "—"}</code>
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <Button variant="secondary" disabled={!allCalendar.data?.url} onClick={() => allCalendar.data?.url && navigator.clipboard?.writeText(allCalendar.data.url)}>
                    Скопировать
                  </Button>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {can("finance.manage", "projects.manage") && <><SectionTitle>Автопарк</SectionTitle><FleetManager /></>}

      {canTelegramInbox && (
        <>
          <SectionTitle>Telegram Inbox</SectionTitle>
          <Card>
            <div className="row row--between" style={{ gap: 10 }}>
              <div style={{ flex: 1 }}>
                <Input value={workTelegram} onChange={(e) => setWorkTelegram(e.target.value)} placeholder="@username" />
              </div>
              <Button
                variant="secondary"
                disabled={setTelegramInbox.isPending}
                onClick={() => setTelegramInbox.mutate({ workUsername: workTelegram })}
              >
                OK
              </Button>
            </div>
            <p className="card__subtitle" style={{ marginTop: 8 }}>/inbox · /exit</p>
          </Card>
        </>
      )}

      {can("warehouse.catalog.manage") && (
        <>
          <SectionTitle>Кабели</SectionTitle>
          <Card>
            <div className="stack" style={{ gap: 10 }}>
              <div>
                <p className="card__title">Разъёмы</p>
                <textarea
                  className="input"
                  rows={6}
                  value={connectors}
                  onChange={(e) => setConnectors(e.target.value)}
                  placeholder={"XLR 3 pin male\nXLR 3 pin female\nSchuko plug male"}
                  style={{ resize: "vertical", minHeight: 120 }}
                />
              </div>
              <div>
                <p className="card__title">Формат имени</p>
                <Input value={nameFormat} onChange={(e) => setNameFormat(e.target.value)} placeholder="[sideA] [arrow] [sideB] [length]" />
                <p className="card__subtitle" style={{ marginTop: 6 }}>Переменные: [sideA], [arrow], [sideB], [length], [type], [name]</p>
              </div>
              <div>
                <p className="card__title">Формат имени удлинителя</p>
                <Input value={extensionNameFormat} onChange={(e) => setExtensionNameFormat(e.target.value)} placeholder="E[length]m[outlets]s" />
                <p className="card__subtitle" style={{ marginTop: 6 }}>Переменные: [length], [outlets], [type], [name]. Например: E[length]m[outlets]s → E10m4s</p>
              </div>
              <Button
                variant="secondary"
                disabled={setCableSettings.isPending}
                onClick={() =>
                  setCableSettings.mutate({
                    connectors: connectors.split("\n").map((x) => x.trim()).filter(Boolean),
                    nameFormat: nameFormatFromInput(nameFormat),
                    extensionNameFormat: nameFormatFromInput(extensionNameFormat),
                  })
                }
              >
                Сохранить
              </Button>
            </div>
          </Card>
        </>
      )}

      {can("finance.manage") && (
        <>
          <SectionTitle>Курсы валют (к EUR)</SectionTitle>
          {fx.isLoading ? (
            <Loading />
          ) : (
            <div className="stack">
              {(fx.data ?? []).map((r) => (
                <FxRow
                  key={r.currency}
                  currency={r.currency}
                  rate={r.rateToEUR}
                  disabled={r.currency === "EUR"}
                  onSave={(v) => setFx.mutate({ currency: r.currency, rateToEUR: v })}
                />
              ))}
              <AddFxRow
                existing={(fx.data ?? []).map((r) => r.currency)}
                onAdd={(c, v) => setFx.mutate({ currency: c, rateToEUR: v })}
              />
            </div>
          )}
        </>
      )}

      <BackupManager canBackup={can("data.backup")} canRestore={can("data.restore")} />

      {canResetData && (
        <>
          <SectionTitle>Данные</SectionTitle>
          <Card>
            <p className="card__subtitle" style={{ marginBottom: 12, color: "var(--text2)" }}>
              Пересоздать базу демо-данными для знакомства, или очистить всё, чтобы начать заполнять свои.
            </p>
            <div className="row">
              <Button block variant="secondary" disabled={resetData.isPending} onClick={() => confirm("Перезаписать ВСЕ данные демо-набором?") && resetData.mutate("demo")}>
                Загрузить демо
              </Button>
              <Button block variant="danger" disabled={resetData.isPending} onClick={() => confirm("Удалить ВСЕ данные и начать с чистого листа? Это необратимо.") && resetData.mutate("empty")}>
                Очистить всё
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function ProjectNameTemplateSettings() {
  const settings = useProjectNameTemplateSettings();
  const dateTime = useDateTimeSettings();
  const save = useSetProjectNameTemplateSettings();
  const [template, setTemplate] = useState("[name]");
  useEffect(() => { if (settings.data) setTemplate(settings.data.template); }, [settings.data]);
  const preview = formatProjectName(template, {
    name: "Конференция", client: "Acme", location: "Белый зал",
    startsAt: "2026-10-03T16:00:00.000Z", endsAt: "2026-10-04T20:00:00.000Z",
  }, dateTime.data);
  return <><SectionTitle>Название проекта</SectionTitle><Card><div className="stack" style={{ gap: 10 }}>
    <Input value={template} onChange={event => setTemplate(event.target.value)} placeholder="[name] — [dates]" />
    <p className="card__subtitle">Переменные: [name], [dates], [start.date], [start.time], [end.date], [end.time], [location], [client]</p>
    <p className="card__subtitle">Пример: {preview}</p>
    {!template.includes("[name]") && <p className="card__subtitle" style={{ color: "var(--alert)" }}>Добавьте обязательную переменную [name].</p>}
    <Button variant="secondary" disabled={save.isPending || !template.trim() || !template.includes("[name]")} onClick={() => save.mutate({ template: template.trim() })}>Сохранить</Button>
  </div></Card></>;
}

function DressCodeSettings() {
  const options = useDressCodeOptions(true), create = useCreateDressCodeOption(), update = useUpdateDressCodeOption();
  const [label, setLabel] = useState("");
  return <><SectionTitle>Дресс-код мероприятий</SectionTitle><Card><div className="stack">{(options.data ?? []).map(option => <div className="row row--between" key={option.id}><span className={option.active ? "" : "card__subtitle"}>{option.label}</span><Button variant="secondary" onClick={() => update.mutate({ id: option.id, input: { active: !option.active } })}>{option.active ? "В архив" : "Вернуть"}</Button></div>)}<div className="row"><Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Новый вариант" /><Button disabled={!label.trim() || create.isPending} onClick={() => create.mutate(label.trim(), { onSuccess: () => setLabel("") })}>Добавить</Button></div></div></Card></>;
}

function DateTimeFormatSettings() {
  const settings = useDateTimeSettings();
  const save = useSetDateTimeSettings();
  const [dateFormat, setDateFormat] = useState<AppSettings.DateFormat>("DD.MM.YYYY");
  const [timeFormat, setTimeFormat] = useState<AppSettings.TimeFormat>("24h");

  useEffect(() => {
    if (!settings.data) return;
    setDateFormat(settings.data.dateFormat);
    setTimeFormat(settings.data.timeFormat);
  }, [settings.data]);

  const sample = new Date(2026, 0, 31, 18, 30);
  const previewSettings = { dateFormat, timeFormat };
  return (
    <>
      <SectionTitle>Дата и время</SectionTitle>
      <Card>
        <div className="stack" style={{ gap: 12 }}>
          <div>
            <p className="card__title">Формат даты</p>
            <Select
              value={dateFormat}
              onChange={(event) => setDateFormat(event.target.value as AppSettings.DateFormat)}
              options={DATE_FORMATS.map((format) => ({
                value: format,
                label: `${format} — ${formatDateValue(sample, { dateFormat: format, timeFormat }, "ru-RU")}`,
              }))}
            />
          </div>
          <div>
            <p className="card__title">Формат времени</p>
            <Select
              value={timeFormat}
              onChange={(event) => setTimeFormat(event.target.value as AppSettings.TimeFormat)}
              options={[
                { value: "24h", label: `24 часа — ${formatTimeValue(sample, { dateFormat, timeFormat: "24h" })}` },
                { value: "12h", label: `12 часов — ${formatTimeValue(sample, { dateFormat, timeFormat: "12h" })}` },
              ]}
            />
          </div>
          <p className="card__subtitle">Предпросмотр: {formatDateValue(sample, previewSettings, "ru-RU")} · {formatTimeValue(sample, previewSettings)}</p>
          <Button
            variant="secondary"
            disabled={save.isPending || settings.isLoading}
            onClick={() => save.mutate({ dateFormat, timeFormat })}
          >
            Сохранить
          </Button>
        </div>
      </Card>
    </>
  );
}

function ProjectProblemNotificationSettings() {
  const settings = useProjectProblemNotificationSettings();
  const save = useSetProjectProblemNotificationSettings();
  const [values, setValues] = useState<number[]>([]);
  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState("days");
  useEffect(() => { if (settings.data) setValues(settings.data.intervalsMinutes); }, [settings.data]);
  const label = (minutes: number) => minutes % 1440 === 0 ? `${minutes / 1440} дн.` : minutes % 60 === 0 ? `${minutes / 60} ч.` : `${minutes} мин.`;
  const add = () => {
    const multiplier = unit === "days" ? 1440 : unit === "hours" ? 60 : 1;
    const minutes = Math.round(Number(amount) * multiplier);
    if (minutes >= 5) setValues(current => [...new Set([...current, minutes])].sort((a, b) => b - a));
  };
  return <><SectionTitle>Сводки о проблемах проектов</SectionTitle><Card><div className="stack" style={{ gap: 10 }}>
    <p className="card__subtitle">Общие интервалы до начала проекта. Сводка отправляется в Telegram людям с отдельным правом Apex.</p>
    <div className="row" style={{ flexWrap: "wrap" }}>{values.map(value => <button key={value} type="button" className="chip chip--neutral" onClick={() => setValues(current => current.filter(item => item !== value))}>{label(value)} ×</button>)}</div>
    <div className="row"><Input type="number" min="1" value={amount} onChange={event => setAmount(event.target.value)} /><Select value={unit} onChange={event => setUnit(event.target.value)} options={[{ value: "days", label: "дней" }, { value: "hours", label: "часов" }, { value: "minutes", label: "минут" }]} /><Button variant="secondary" onClick={add}>Добавить</Button></div>
    <Button variant="secondary" disabled={save.isPending || settings.isLoading} onClick={() => save.mutate({ intervalsMinutes: values })}>Сохранить</Button>
  </div></Card></>;
}

function ClientFollowupNotificationSettings() {
  const settings = useClientFollowupNotificationSettings();
  const save = useSetClientFollowupNotificationSettings();
  const [drafts, setDrafts] = useState<number[]>([]);
  const [confirmed, setConfirmed] = useState<number[]>([]);
  useEffect(() => {
    if (!settings.data) return;
    setDrafts(settings.data.draftIntervalsMinutes);
    setConfirmed(settings.data.confirmedIntervalsMinutes);
  }, [settings.data]);
  return <><SectionTitle>Сводки по работе с клиентами</SectionTitle><Card><div className="stack" style={{ gap: 14 }}>
    <p className="card__subtitle">Отдельное право Apex определяет получателей. Максимальный срок черновиков также задаёт окно общего списка неподтверждённых мероприятий.</p>
    <IntervalEditor title="Черновики" values={drafts} onChange={setDrafts} />
    <IntervalEditor title="Подтверждённые — связаться с клиентом" values={confirmed} onChange={setConfirmed} />
    <Button variant="secondary" disabled={save.isPending || settings.isLoading} onClick={() => save.mutate({ draftIntervalsMinutes: drafts, confirmedIntervalsMinutes: confirmed })}>Сохранить</Button>
  </div></Card></>;
}

function IntervalEditor({ title, values, onChange }: { title: string; values: number[]; onChange: (values: number[]) => void }) {
  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState("days");
  const label = (minutes: number) => minutes % 1440 === 0 ? `${minutes / 1440} дн.` : minutes % 60 === 0 ? `${minutes / 60} ч.` : `${minutes} мин.`;
  const add = () => {
    const multiplier = unit === "days" ? 1440 : unit === "hours" ? 60 : 1;
    const minutes = Math.round(Number(amount) * multiplier);
    if (minutes >= 5) onChange([...new Set([...values, minutes])].sort((a, b) => b - a));
  };
  return <div className="stack" style={{ gap: 8 }}><p className="card__title">{title}</p><div className="row" style={{ flexWrap: "wrap" }}>{values.map(value => <button key={value} type="button" className="chip chip--neutral" onClick={() => onChange(values.filter(item => item !== value))}>{label(value)} ×</button>)}</div><div className="row"><Input type="number" min="1" value={amount} onChange={event => setAmount(event.target.value)} /><Select value={unit} onChange={event => setUnit(event.target.value)} options={[{ value: "days", label: "дней" }, { value: "hours", label: "часов" }, { value: "minutes", label: "минут" }]} /><Button variant="secondary" onClick={add}>Добавить</Button></div></div>;
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

function AddFxRow({ existing, onAdd }: { existing: string[]; onAdd: (c: Currency, v: number) => void }) {
  const available = CURRENCIES.filter((c) => !existing.includes(c));
  const [cur, setCur] = useState<Currency>(available[0] ?? "USD");
  const [val, setVal] = useState("1");
  if (available.length === 0) return null;
  return (
    <Card>
      <div className="row">
        <div style={{ flex: 1 }}>
          <Select value={cur} onChange={(e) => setCur(e.target.value as Currency)} options={available.map((c) => ({ value: c, label: c }))} />
        </div>
        <div style={{ width: 120 }}>
          <Input type="number" step="0.0001" value={val} onChange={(e) => setVal(e.target.value)} />
        </div>
        <Button onClick={() => onAdd(cur, Number(val))}>+ Курс</Button>
      </div>
    </Card>
  );
}
