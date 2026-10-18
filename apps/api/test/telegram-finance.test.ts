import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, Finance, People } from "@sever/contracts";
import { env } from "../src/env.js";
import { startTelegramBot } from "../src/core/telegramBot.js";
import { evaluateTelegramAmount } from "../src/core/telegramFinance.js";

const originalBotToken = env.auth.telegramBotToken;
afterEach(() => {
  env.auth.telegramBotToken = originalBotToken;
  vi.restoreAllMocks();
});

describe("Telegram finance amount expressions", () => {
  it.each([
    ["1200 + 3*450", 2550],
    ["(100 + 25) / 2", 62.5],
    ["10,5 * 3", 31.5],
    ["1 / 3", 0.33],
  ])("calculates %s", (expression, expected) => {
    expect(evaluateTelegramAmount(expression)).toBe(expected);
  });

  it.each(["", "2 ** 3", "process.exit()", "1 / 0", "-10", "1 +"])('rejects "%s"', (expression) => {
    expect(() => evaluateTelegramAmount(expression)).toThrow();
  });
});

describe("Telegram finance permission boundary", () => {
  it("creates a confirmed transaction for the linked user with the dedicated permission", async () => {
    env.auth.telegramBotToken = "test-token";
    const account = { id: "22222222-2222-4222-8222-222222222222", name: "Касса", currency: "EUR", balance: 0 } as Finance.AccountDTO;
    const createTransaction = vi.fn(async (input: Finance.CreateTransactionInput) => ({
      id: "33333333-3333-4333-8333-333333333333",
      ...input,
      projectId: null,
      unitId: null,
      assignmentId: null,
      contractorId: null,
      fxRateToEUR: 1,
      amountEUR: input.amount,
      createdByUserId: input.createdByUserId ?? null,
      updatedByUserId: null,
      updatedAt: null,
      voidedByUserId: null,
      voidedAt: null,
      createdAt: new Date().toISOString(),
    } as Finance.TransactionDTO));
    const finance = { listAccounts: vi.fn().mockResolvedValue([account]), createTransaction } as unknown as Finance.FinanceService;
    const user = { id: "11111111-1111-4111-8111-111111111111", active: true, telegramId: "12345" };
    const people = {
      list: vi.fn().mockResolvedValue([user]),
      permissionsForUser: vi.fn().mockResolvedValue(["telegram.finance.transactions"]),
      getTelegramInboxSettings: vi.fn().mockResolvedValue({ workUsername: null }),
      logTelegramDialogMessage: vi.fn().mockResolvedValue(undefined),
      markTelegramDialogMessageDeleted: vi.fn().mockResolvedValue(undefined),
    } as unknown as People.PeopleService;
    const updates = [
      { update_id: 1, message: { message_id: 1, text: "/transaction", from: { id: 12345 }, chat: { id: 12345, type: "private" } } },
      { update_id: 2, callback_query: { id: "a", data: `tx:account:${account.id}`, from: { id: 12345 }, message: { chat: { id: 12345 }, message_id: 2 } } },
      { update_id: 3, callback_query: { id: "b", data: "tx:kind:expense", from: { id: 12345 }, message: { chat: { id: 12345 }, message_id: 3 } } },
      { update_id: 4, callback_query: { id: "c", data: "tx:category:other", from: { id: 12345 }, message: { chat: { id: 12345 }, message_id: 4 } } },
      { update_id: 5, message: { message_id: 5, text: "1200 + 3*450", from: { id: 12345 }, chat: { id: 12345, type: "private" } } },
      { update_id: 6, message: { message_id: 6, text: "Кабели", from: { id: 12345 }, chat: { id: 12345, type: "private" } } },
      { update_id: 7, callback_query: { id: "d", data: "tx:confirm", from: { id: 12345 }, message: { chat: { id: 12345 }, message_id: 7 } } },
    ];
    let polled = false;
    let messageId = 100;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("/getUpdates")) {
        if (polled) return new Promise<Response>(() => {});
        polled = true;
        return Response.json({ ok: true, result: updates });
      }
      return Response.json({ ok: true, result: { message_id: messageId++ } });
    });

    startTelegramBot({ people, finance, appSettings: {} as AppSettings.AppSettingsService });
    await vi.waitFor(() => expect(createTransaction).toHaveBeenCalledOnce());

    expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({
      accountId: account.id,
      kind: "expense",
      category: "other",
      amount: 2550,
      currency: "EUR",
      note: "Кабели",
      createdByUserId: user.id,
      requestKey: expect.any(String),
    }));
    expect(people.permissionsForUser).toHaveBeenCalledTimes(8);
    expect(people.logTelegramDialogMessage).not.toHaveBeenCalled();
  });

  it("does not expose accounts or create a session without the dedicated permission", async () => {
    env.auth.telegramBotToken = "test-token";
    const listAccounts = vi.fn().mockResolvedValue([]);
    const people = {
      list: vi.fn().mockResolvedValue([{ id: "user", active: true, telegramId: "12345" }]),
      permissionsForUser: vi.fn().mockResolvedValue(["finance.manage"]),
      getTelegramInboxSettings: vi.fn().mockResolvedValue({ workUsername: null }),
      logTelegramDialogMessage: vi.fn().mockResolvedValue(undefined),
      markTelegramDialogMessageDeleted: vi.fn().mockResolvedValue(undefined),
    } as unknown as People.PeopleService;
    let polled = false;
    const sent: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).endsWith("/getUpdates")) {
        if (polled) return new Promise<Response>(() => {});
        polled = true;
        return Response.json({ ok: true, result: [{ update_id: 1, message: { message_id: 1, text: "/transaction", from: { id: 12345 }, chat: { id: 12345, type: "private" } } }] });
      }
      if (String(url).endsWith("/sendMessage")) sent.push(JSON.parse(String(init?.body)).text);
      return Response.json({ ok: true, result: { message_id: 10 } });
    });

    startTelegramBot({ people, finance: { listAccounts } as unknown as Finance.FinanceService, appSettings: {} as AppSettings.AppSettingsService });
    await vi.waitFor(() => expect(sent).toContain("Команда недоступна."));
    expect(listAccounts).not.toHaveBeenCalled();
  });
});
