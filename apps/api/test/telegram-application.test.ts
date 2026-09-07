import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, People } from "@sever/contracts";
import { env } from "../src/env.js";
import { startTelegramBot } from "../src/core/telegramBot.js";

const originalBotToken = env.auth.telegramBotToken;
afterEach(() => {
  env.auth.telegramBotToken = originalBotToken;
  vi.restoreAllMocks();
});

describe("Telegram crew application", () => {
  it.each(["06.11.1998", "06.11.98", "6.11.1998", "01.11.1998", "6. 06.11.1998", "6)06.11.1998"])(
    "accepts %s and completes the remaining questions without changing other answers",
    async (birthDate) => {
      env.auth.telegramBotToken = "test-token";
      const submitApplication = vi.fn().mockResolvedValue({});
      const people = {
        getTelegramInboxSettings: vi.fn().mockResolvedValue({ workUsername: null }),
        list: vi.fn().mockResolvedValue([]),
        logTelegramDialogMessage: vi.fn().mockResolvedValue(undefined),
        markTelegramDialogMessageDeleted: vi.fn().mockResolvedValue(undefined),
        submitApplication,
      } as unknown as People.PeopleService;
      const answers = [
        "/start", "Русский", "Егор", "Тестов", "-", "test_crew", "crew@example.com",
        birthDate, "Русский, английский A2", "Работаю на мероприятиях", "От знакомой",
        null, "Отправить",
      ];
      const updates = answers.map((text, index) => ({
        update_id: index + 1,
        message: {
          message_id: index + 1,
          chat: { id: 12345 },
          ...(text === null ? { photo: [{ file_id: "portrait", file_size: 100 }] } : { text }),
        },
      }));
      const sentTexts: string[] = [];
      let polled = false;
      let messageId = 100;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        if (String(url).endsWith("/getUpdates")) {
          // Leave the next long poll pending without timers or network activity.
          if (polled) return new Promise<Response>(() => {});
          polled = true;
          return Response.json({ ok: true, result: updates });
        }
        if (String(url).endsWith("/sendMessage")) {
          sentTexts.push(JSON.parse(String(init?.body)).text);
        }
        return Response.json({ ok: true, result: { message_id: messageId++ } });
      });

      startTelegramBot({ people, appSettings: {} as AppSettings.AppSettingsService });
      await vi.waitFor(() => expect(sentTexts).toContain("✅ Анкета отправлена. Мы вернёмся с ответом после просмотра."));

      expect(submitApplication).toHaveBeenCalledOnce();
      expect(submitApplication).toHaveBeenCalledWith({
        telegramId: "12345", telegramUsername: null, language: "ru",
        firstName: "Егор", lastName: "Тестов", patronymic: null,
        nickname: "test_crew", email: "crew@example.com",
        birthDate: birthDate === "01.11.1998" ? "1998-11-01" : "1998-11-06",
        languages: "Русский, английский A2", about: "Работаю на мероприятиях",
        source: "От знакомой", photoFileId: "portrait",
      });
      expect(sentTexts.filter((text) => text.startsWith("<b>6. "))).toHaveLength(1);
      expect(sentTexts.filter((text) => /^<b>[7-9]\. /.test(text))).toHaveLength(3);
    },
  );
});
