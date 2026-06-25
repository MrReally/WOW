import { useState } from "react";
import type { Currency } from "@sever/contracts";
import { CURRENCIES } from "@sever/contracts";
import { Card, Button, SectionTitle, Input, Select, Loading } from "../../ui-kit/index.ts";
import { useTheme } from "../../app/theme.tsx";
import { useSession } from "../../app/session.ts";
import { useFxRates, useSetFxRate, useResetData, useResetStatus } from "./hooks.ts";
import { PeopleManager } from "./components/PeopleManager.tsx";
import { RoleEditor } from "./components/RoleEditor.tsx";

export function SettingsPage() {
  const { theme, toggle } = useTheme();
  const { can } = useSession();
  const fx = useFxRates();
  const setFx = useSetFxRate();
  const resetData = useResetData();
  const resetStatus = useResetStatus(can("data.reset"));
  const canResetData = can("data.reset") && resetStatus.data?.available === true;

  return (
    <div className="stack">
      <SectionTitle>Оформление</SectionTitle>
      <Card>
        <div className="row row--between">
          <p className="card__title">Тема: {theme === "dark" ? "Тёмная" : "Светлая"}</p>
          <Button variant="secondary" onClick={toggle}>Переключить</Button>
        </div>
      </Card>

      {can("people.manage") && <PeopleManager />}

      {can("roles.manage") && <RoleEditor />}

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
