import { useCallback } from "react";
import type { Finance } from "@sever/contracts";
import { toast } from "../../lib/toastBus.ts";
import { formatInvoiceMessage, type InvoiceMessageLang } from "./invoiceMessage.ts";

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard is unavailable");
}

export function useInvoiceMessageCopy() {
  return useCallback(async (
    projectName: string,
    invoice: Pick<Finance.ProjectInvoiceDTO, "rentalLines" | "invoiceEUR">,
    lang: InvoiceMessageLang,
  ) => {
    try {
      await writeClipboard(formatInvoiceMessage(projectName, invoice, lang));
      toast("success", "Текст скопирован");
    } catch {
      toast("error", "Не удалось скопировать текст");
    }
  }, []);
}
