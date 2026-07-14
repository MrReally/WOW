import { useRef, useState } from "react";
import { Button, Card, Input, Loading, SectionTitle } from "../../../ui-kit/index.ts";
import { useBackupStatus, useCreateBackup, useRestoreBackup } from "../hooks.ts";

export function BackupManager({ canBackup, canRestore }: { canBackup: boolean; canRestore: boolean }) {
  const status = useBackupStatus(canBackup);
  const createBackup = useCreateBackup();
  const restore = useRestoreBackup();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState<string | null>(null);

  if (!canBackup) return null;
  const download = () => createBackup.mutate(undefined, {
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });
  const restoreReady = canRestore && status.data?.restoreAvailable && file && confirmation === "ВОССТАНОВИТЬ";

  return <>
    <SectionTitle>Резервные копии</SectionTitle>
    <Card>
      {status.isLoading ? <Loading /> : <div className="stack" style={{ gap: 14 }}>
        <div>
          <p className="card__title">Полная копия PostgreSQL</p>
          <p className="card__subtitle" style={{ marginTop: 6 }}>
            Архив содержит все модули, настройки, историю, пользователей и документы. Храните его в защищённом месте.
          </p>
        </div>
        <Button disabled={!status.data?.available || createBackup.isPending} onClick={download}>
          {createBackup.isPending ? "Создаём архив…" : "Скачать резервную копию"}
        </Button>
        {!status.data?.available && <p className="card__subtitle" style={{ color: "var(--danger)" }}>На сервере недоступны PostgreSQL backup tools.</p>}
      </div>}
    </Card>

    {canRestore && <Card>
      <div className="stack" style={{ gap: 12 }}>
        <div>
          <p className="card__title" style={{ color: "var(--danger)" }}>Восстановление из архива</p>
          <p className="card__subtitle" style={{ marginTop: 6 }}>
            Текущая база будет полностью заменена содержимым файла. Перед заменой сервер автоматически создаст отдельную страховочную копию.
          </p>
        </div>
        <input ref={fileRef} type="file" accept=".dump,application/octet-stream,application/vnd.postgresql.custom" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setResult(null); }} />
        {file && <p className="card__subtitle">Выбран файл: {file.name} · {(file.size / 1024 / 1024).toFixed(2)} МБ</p>}
        <label>
          <span className="card__subtitle">Для подтверждения введите ВОССТАНОВИТЬ</span>
          <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="ВОССТАНОВИТЬ" />
        </label>
        <Button variant="danger" disabled={!restoreReady || restore.isPending} onClick={() => file && restore.mutate(file, { onSuccess: (data) => { setResult(`Восстановлено. Страховочная копия: ${data.safetyBackupFile}`); setConfirmation(""); setFile(null); if (fileRef.current) fileRef.current.value = ""; } })}>
          {restore.isPending ? "Восстанавливаем базу…" : "Восстановить базу"}
        </Button>
        {!status.data?.restoreAvailable && <p className="card__subtitle" style={{ color: "var(--danger)" }}>Восстановление отключено на production-сервере. Включите ALLOW_DATA_RESTORE=true только на время операции.</p>}
        {restore.isPending && <p className="card__subtitle">Не закрывайте страницу. На время операции остальные запросы будут остановлены.</p>}
        {result && <p className="card__subtitle" style={{ color: "var(--ok)" }}>{result}</p>}
      </div>
    </Card>}
  </>;
}
