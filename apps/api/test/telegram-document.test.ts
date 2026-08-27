import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/env.js";
import { sendTelegramDocument } from "../src/core/telegram.js";

const originalBotToken = env.auth.telegramBotToken;

afterEach(() => {
  env.auth.telegramBotToken = originalBotToken;
  vi.restoreAllMocks();
});

describe("Telegram document delivery", () => {
  it("uploads a PDF to the user's chat as a document", async () => {
    env.auth.telegramBotToken = "test-token";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      result: { message_id: 42 },
    }), { headers: { "Content-Type": "application/json" } }));

    const sent = await sendTelegramDocument("123456", Buffer.from("%PDF-test"), "invoice-7.pdf");

    expect(sent).toEqual({ chatId: "123456", messageId: 42 });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/bottest-token/sendDocument");
    expect(init?.method).toBe("POST");
    const form = init?.body as FormData;
    expect(form.get("chat_id")).toBe("123456");
    const document = form.get("document") as File;
    expect(document.name).toBe("invoice-7.pdf");
    expect(document.type).toBe("application/pdf");
    expect(await document.text()).toBe("%PDF-test");
  });

  it("does not call Telegram for an invalid chat id", async () => {
    env.auth.telegramBotToken = "test-token";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(sendTelegramDocument("@username", Buffer.from("pdf"), "invoice.pdf")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
