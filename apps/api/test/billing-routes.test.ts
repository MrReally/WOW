import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { AppSettings, AuthContext } from "@sever/contracts";
import { registerBillingRoutes } from "../src/modules/billing/routes.js";
import type { BillingService } from "../src/modules/billing/service.js";

describe("billing report delivery", () => {
  it("sends the requested transaction statement to the linked Telegram chat", async () => {
    const app = Fastify();
    const transactionCashExportCsv = vi.fn(async () => "Date;Amount\r\n2026-11-01;10");
    const sendTelegramDocument = vi.fn(async () => ({ chatId: "123456", messageId: 7 }));
    registerBillingRoutes(
      app,
      { auth: async () => ({ permissions: ["finance.view"], telegramId: "123456" } as AuthContext) },
      { transactionCashExportCsv } as unknown as BillingService,
      {} as AppSettings.AppSettingsService,
      sendTelegramDocument,
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/reports/transaction-export.csv/telegram?from=2026-11-01&to=2026-11-24",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sent: true, filename: "sever-cash-transactions-2026-11-01-2026-11-24.csv" });
    expect(transactionCashExportCsv).toHaveBeenCalledWith({ from: "2026-11-01", to: "2026-11-24" });
    expect(sendTelegramDocument).toHaveBeenCalledWith(
      "123456",
      Buffer.from("Date;Amount\r\n2026-11-01;10", "utf8"),
      "sever-cash-transactions-2026-11-01-2026-11-24.csv",
      "Выписка по транзакциям SEVER за 2026-11-01 — 2026-11-24",
      "text/csv; charset=utf-8",
    );
    await app.close();
  });
});
