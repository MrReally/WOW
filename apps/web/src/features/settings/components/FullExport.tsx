import { Button, Card, SectionTitle } from "../../../ui-kit/index.ts";
import { useFullExport, useSendFullExportToTelegram } from "../hooks.ts";

export function FullExport() {
  const exportData = useFullExport();
  const sendToTelegram = useSendFullExportToTelegram();

  const download = () => exportData.mutate(undefined, {
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      window.setTimeout(() => {
        anchor.remove();
        URL.revokeObjectURL(url);
      }, 1_000);
    },
  });

  return <>
    <SectionTitle>Экспорт</SectionTitle>
    <Card>
      <div className="stack" style={{ gap: 12 }}>
        <div>
          <p className="card__title">Полный экспорт проектов</p>
          <p className="card__subtitle" style={{ marginTop: 6 }}>
            CSV для Excel и Google Sheets: позиции оборудования, роли, подрядчики, ручные строки сметы и все финансовые операции, включая аннулированные.
          </p>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <Button block disabled={exportData.isPending || sendToTelegram.isPending} onClick={download}>
            {exportData.isPending ? "Готовим файл…" : "Скачать CSV"}
          </Button>
          <Button block variant="secondary" disabled={exportData.isPending || sendToTelegram.isPending} onClick={() => sendToTelegram.mutate()}>
            {sendToTelegram.isPending ? "Отправляем…" : "Отправить в Telegram"}
          </Button>
        </div>
        <p className="card__subtitle">
          Плановые суммы и фактические движения денег вынесены в отдельные колонки, чтобы выплаты не удваивали расходы. Заметки проектов выгружаются только пользователям с правом их просмотра.
        </p>
      </div>
    </Card>
  </>;
}
