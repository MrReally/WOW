import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, People, Projects } from "@sever/contracts";
import { env } from "../src/env.js";
import { startTelegramBot } from "../src/core/telegramBot.js";

const originalBotToken = env.auth.telegramBotToken;
afterEach(() => {
  env.auth.telegramBotToken = originalBotToken;
  vi.restoreAllMocks();
});

describe("Telegram crew application", () => {
  it("finds only accessible projects from the personal control panel", async () => {
    env.auth.telegramBotToken = "test-token";
    const user = { id: "11111111-1111-4111-8111-111111111111", active: true, telegramId: "12345", displayName: "Егор" };
    const project = {
      id: "22222222-2222-4222-8222-222222222222", name: "Acme conference", baseName: "Acme conference",
      clientId: "33333333-3333-4333-8333-333333333333", status: "confirmed", operationStage: "prep", startsAt: "2026-11-10T09:00:00.000Z", endsAt: "2026-11-10T18:00:00.000Z", serviceMode: "full_service",
    };
    const people = {
      list: vi.fn().mockResolvedValue([user]),
      permissionsForUser: vi.fn().mockResolvedValue(["telegram.finance.transactions"]),
      getTelegramInboxSettings: vi.fn().mockResolvedValue({ workUsername: null }),
      logTelegramDialogMessage: vi.fn().mockResolvedValue(undefined),
      markTelegramDialogMessageDeleted: vi.fn().mockResolvedValue(undefined),
    } as unknown as People.PeopleService;
    const projects = {
      listProjectsForUser: vi.fn().mockResolvedValue([project]),
      listProjects: vi.fn().mockResolvedValue([]),
      listClients: vi.fn().mockResolvedValue([{ id: project.clientId, name: "Acme", contacts: null, createdAt: "2026-01-01T00:00:00.000Z" }]),
    };
    const updates = [
      { update_id: 1, message: { message_id: 1, text: "/menu", from: { id: 12345 }, chat: { id: 12345, type: "private" } } },
      { update_id: 2, callback_query: { id: "a", data: "nav:projects", from: { id: 12345 } } },
      { update_id: 3, message: { message_id: 2, text: "acme", from: { id: 12345 }, chat: { id: 12345, type: "private" } } },
      { update_id: 4, callback_query: { id: "b", data: `nav:project:open:${project.id}`, from: { id: 12345 } } },
    ];
    const sentTexts: string[] = [];
    let polled = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).endsWith("/getUpdates")) {
        if (polled) return new Promise<Response>(() => {});
        polled = true;
        return Response.json({ ok: true, result: updates });
      }
      if (String(url).endsWith("/sendMessage")) sentTexts.push(JSON.parse(String(init?.body)).text);
      return Response.json({ ok: true, result: { message_id: 100 } });
    });

    startTelegramBot({ people, appSettings: {} as AppSettings.AppSettingsService, projects: projects as unknown as Projects.ProjectsService });
    await vi.waitFor(() => expect(sentTexts).toContain("<b>Acme conference</b>\n🔵 10.11.2026 — 10.11.2026 · Подтверждён\nКлиент: Acme\nСтадия: Подготовка\nРежим: полный сервис"));
    expect(projects.listProjectsForUser).toHaveBeenCalledWith(user.id);
  });

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
