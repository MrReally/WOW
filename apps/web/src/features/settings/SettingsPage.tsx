import { useEffect, useState } from "react";
import type { Currency } from "@sever/contracts";
import { CURRENCIES } from "@sever/contracts";
import { Card, Button, SectionTitle, Input, Select, Loading } from "../../ui-kit/index.ts";
import { useTheme } from "../../app/theme.tsx";
import { useSession } from "../../app/session.ts";
import { useFxRates, useSetFxRate, useResetData, useResetStatus, useSetTelegramInboxSettings, useTelegramInboxSettings } from "./hooks.ts";
import { RoleEditor } from "./components/RoleEditor.tsx";
import { useCableSettings, useSetCableSettings } from "../warehouse/hooks.ts";
import { BackupManager } from "./components/BackupManager.tsx";

export function SettingsPage() {
  const { theme, toggle } = useTheme();
  const { can } = useSession();
  const fx = useFxRates();
  const setFx = useSetFxRate();
  const resetData = useResetData();
  const resetStatus = useResetStatus(can("data.reset"));
  const canResetData = can("data.reset") && resetStatus.data?.available === true;
  const canTelegramInbox = can("telegram.inbox.manage", "people.manage");
  const telegramInbox = useTelegramInboxSettings(canTelegramInbox);
  const setTelegramInbox = useSetTelegramInboxSettings();
  const cableSettings = useCableSettings(can("warehouse.catalog.manage"));
  const setCableSettings = useSetCableSettings();
  const [workTelegram, setWorkTelegram] = useState("");
  const [connectors, setConnectors] = useState("");
  const [nameFormat, setNameFormat] = useState("");

  useEffect(() => {
    if (telegramInbox.data) {
      setWorkTelegram(telegramInbox.data.workUsername ? `@${telegramInbox.data.workUsername.replace(/^@/, "")}` : "");
    }
  }, [telegramInbox.data]);

  useEffect(() => {
    if (!cableSettings.data) return;
    setConnectors(cableSettings.data.connectors.join("\n"));
    setNameFormat(cableSettings.data.nameFormat.join(" "));
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

      {can("roles.manage") && <RoleEditor />}

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
                <Input value={nameFormat} onChange={(e) => setNameFormat(e.target.value)} placeholder="sideA arrow sideB length" />
                <p className="card__subtitle" style={{ marginTop: 6 }}>Токены: sideA, arrow, sideB, length, type, name</p>
              </div>
              <Button
                variant="secondary"
                disabled={setCableSettings.isPending}
                onClick={() =>
                  setCableSettings.mutate({
                    connectors: connectors.split("\n").map((x) => x.trim()).filter(Boolean),
                    nameFormat: nameFormat.split(/\s+/).map((x) => x.trim()).filter(Boolean),
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
