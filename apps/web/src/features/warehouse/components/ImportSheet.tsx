import { useState } from "react";
import type { Equipment } from "@sever/contracts";
import { Sheet, Button } from "../../../ui-kit/index.ts";
import { useImportCsv } from "../hooks.ts";

const SAMPLE = `type,trackingMode,model,manufacturer,unitCostEUR,dailyPriceEUR,assetTag,serial,qty,cableType,lengthM,connectors
Световые приборы,serial,Robe MegaPointe,Robe,6000,120,MP-010,RB-9001,,,,
Световые приборы,serial,Robe MegaPointe,Robe,6000,120,MP-011,RB-9002,,,,
Кабели,quantity,DMX 5m XLR3,,12,1,,,40,DMX,5,XLR3 male/female`;

export function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const importCsv = useImportCsv();
  const [csv, setCsv] = useState(SAMPLE);
  const [result, setResult] = useState<Equipment.ImportResult | null>(null);

  const run = () => {
    setResult(null);
    importCsv.mutate(csv, { onSuccess: setResult });
  };

  return (
    <Sheet open={open} onClose={() => { setResult(null); onClose(); }} title="Импорт каталога (CSV)">
      <p className="card__subtitle" style={{ marginBottom: 12 }}>
        Колонки: type, trackingMode (serial/quantity), model, manufacturer, unitCostEUR, dailyPriceEUR,
        assetTag, serial, qty, cableType, lengthM, connectors. Серийные — строка на единицу; количественные — qty.
      </p>
      <textarea
        className="input"
        style={{ minHeight: 180, fontFamily: "var(--font-mono)", fontSize: 12, resize: "vertical" }}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        spellCheck={false}
      />

      {result && (
        <div className="card card--flat" style={{ marginTop: 12 }}>
          <div className="t-label" style={{ marginBottom: 6 }}>Результат</div>
          <div className="card__subtitle" style={{ color: "var(--text2)" }}>
            типов: {result.typesCreated} · моделей: {result.modelsCreated} · единиц: {result.unitsCreated} ·
            склад: {result.stockUpdated} · пропущено: {result.skipped}
          </div>
          {result.errors.length > 0 && (
            <div className="card__subtitle" style={{ color: "var(--alert)", marginTop: 6 }}>
              {result.errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <Button block disabled={!csv.trim() || importCsv.isPending} onClick={run}>
          {importCsv.isPending ? "Импорт…" : "Импортировать"}
        </Button>
      </div>
    </Sheet>
  );
}
