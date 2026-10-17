import type { Finance } from "@sever/contracts";
import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Loading, SectionTitle } from "../../../ui-kit/index.ts";
import { useInvoiceCompanySettings, useSetInvoiceCompanySettings } from "../../finance/hooks.ts";

const DEFAULT_COMPANY: Finance.InvoiceCompanySettingsDTO = {
  name: "SEVER",
  requisites: "",
  phone: "+381 62 852 5240",
  email: "sever.beo.contact@gmail.com",
  telegram: "@sever_contact",
  logoDataUrl: null,
};

export function InvoiceCompanySettings() {
  const settings = useInvoiceCompanySettings();
  const save = useSetInvoiceCompanySettings();
  const [company, setCompany] = useState<Finance.InvoiceCompanySettingsDTO>(DEFAULT_COMPANY);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (settings.data && !touched) setCompany(settings.data);
  }, [settings.data, touched]);

  const update = (patch: Partial<Finance.InvoiceCompanySettingsDTO>) => {
    const next = { ...company, ...patch };
    setTouched(true);
    setCompany(next);
    localStorage.setItem("sever.invoice.company", JSON.stringify(next));
    save.mutate(next);
  };

  const uploadLogo = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type) || file.size > 2_000_000) {
      window.alert("Нужен PNG или JPEG размером не более 2 МБ");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update({ logoDataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };

  if (settings.isLoading) return <Loading />;

  return (
    <>
      <SectionTitle>Смета</SectionTitle>
      <Card>
        <Field label="Исполнитель">
          <Input value={company.name} onChange={(event) => update({ name: event.target.value })} />
        </Field>
        <div className="row">
          <Field label="Phone">
            <Input value={company.phone} onChange={(event) => update({ phone: event.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={company.email} onChange={(event) => update({ email: event.target.value })} />
          </Field>
        </div>
        <Field label="Telegram">
          <Input value={company.telegram} onChange={(event) => update({ telegram: event.target.value })} />
        </Field>
        <Field label="Логотип для коммерческого предложения">
          <input type="file" accept="image/png,image/jpeg" onChange={(event) => uploadLogo(event.target.files?.[0])} />
        </Field>
        <p className="card__subtitle">PNG или JPEG, квадратный, рекомендуемый размер 1200 × 1200 px, максимум 2 МБ. В документе логотип выводится в области 170 × 170 px без обрезки.</p>
        <div className="row" style={{ marginTop: 10 }}>
          <img src={company.logoDataUrl ?? "/sever-logo.png"} alt="Логотип для КП" width={96} height={96} style={{ objectFit: "contain", background: "#fff", border: "1px solid var(--bdr)" }} />
          {company.logoDataUrl && <Button variant="secondary" onClick={() => update({ logoDataUrl: null })}>Вернуть текущий логотип</Button>}
        </div>
      </Card>
    </>
  );
}
