import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, Equipment, People, Projects } from "@sever/contracts";
import { env } from "../src/env.js";
import { startTelegramBot } from "../src/core/telegramBot.js";

const originalBotToken = env.auth.telegramBotToken;
afterEach(() => { env.auth.telegramBotToken = originalBotToken; vi.restoreAllMocks(); });

describe("Telegram project reservations", () => {
  it("searches a model and creates a reservation through the existing project service", async () => {
    env.auth.telegramBotToken = "test-token";
    const projectId = "11111111-1111-4111-8111-111111111111";
    const modelId = "22222222-2222-4222-8222-222222222222";
    const user = { id: "33333333-3333-4333-8333-333333333333", active: true, telegramId: "12345", nickname: "Менеджер" };
    const project = { id: projectId, baseName: "Тест", name: "Тест", clientId: "c", status: "draft", startsAt: "2026-11-13T10:00:00.000Z", endsAt: "2026-11-14T10:00:00.000Z", serviceMode: "full_service" } as Projects.ProjectDTO;
    const model = { id: modelId, name: "Проектор M403H", manufacturer: "Acer", subtype: null, trackingMode: "serial", effectiveReservationAssignmentMode: "planning" } as Equipment.EquipmentModelDTO;
    const createReservation = vi.fn().mockResolvedValue({});
    const people = {
      list: vi.fn().mockResolvedValue([user]), permissionsForUser: vi.fn().mockResolvedValue(["projects.reservation.manage"]),
      getTelegramInboxSettings: vi.fn().mockResolvedValue({ workUsername: null }), logTelegramDialogMessage: vi.fn(), markTelegramDialogMessageDeleted: vi.fn(),
    } as unknown as People.PeopleService;
    const projects = {
      listProjects: vi.fn().mockResolvedValue([project]), getProject: vi.fn().mockResolvedValue(project), listReservations: vi.fn().mockResolvedValue([]),
      createReservation, listClients: vi.fn().mockResolvedValue([]),
    } as unknown as Projects.ProjectsService;
    const equipment = { listModels: vi.fn().mockResolvedValue([model]) } as unknown as Equipment.EquipmentService;
    const updates = [
      { update_id: 1, callback_query: { id: "a", data: `nav:project:reservations:${projectId}`, from: { id: 12345 } } },
      { update_id: 2, callback_query: { id: "b", data: "nav:reservation:add", from: { id: 12345 } } },
      { update_id: 3, message: { message_id: 3, text: "проектор", from: { id: 12345 }, chat: { id: 12345, type: "private" } } },
      { update_id: 4, callback_query: { id: "c", data: `nav:reservation:model:${modelId}`, from: { id: 12345 } } },
    ];
    let polled = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("/getUpdates")) {
        if (polled) return new Promise<Response>(() => {});
        polled = true; return Response.json({ ok: true, result: updates });
      }
      return Response.json({ ok: true, result: { message_id: 10 } });
    });

    startTelegramBot({ people, appSettings: {} as AppSettings.AppSettingsService, projects, equipment });
    await vi.waitFor(() => expect(createReservation).toHaveBeenCalledOnce());
    expect(createReservation).toHaveBeenCalledWith({ projectId, modelId, qty: 1 });
  });

  it("does not expose reservation controls without the reservation permission", async () => {
    env.auth.telegramBotToken = "test-token";
    const projectId = "11111111-1111-4111-8111-111111111111";
    const people = {
      list: vi.fn().mockResolvedValue([{ id: "u", active: true, telegramId: "12345" }]), permissionsForUser: vi.fn().mockResolvedValue(["projects.view"]),
      getTelegramInboxSettings: vi.fn().mockResolvedValue({ workUsername: null }), logTelegramDialogMessage: vi.fn(), markTelegramDialogMessageDeleted: vi.fn(),
    } as unknown as People.PeopleService;
    const sent: string[] = [];
    let polled = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).endsWith("/getUpdates")) { if (polled) return new Promise<Response>(() => {}); polled = true; return Response.json({ ok: true, result: [{ update_id: 1, callback_query: { id: "a", data: `nav:project:reservations:${projectId}`, from: { id: 12345 } } }] }); }
      if (String(url).endsWith("/sendMessage")) sent.push(JSON.parse(String(init?.body)).text);
      return Response.json({ ok: true, result: { message_id: 10 } });
    });
    startTelegramBot({ people, appSettings: {} as AppSettings.AppSettingsService, projects: { listProjects: vi.fn().mockResolvedValue([]) } as unknown as Projects.ProjectsService, equipment: {} as Equipment.EquipmentService });
    await vi.waitFor(() => expect(sent).toContain("Действие недоступно."));
  });
});
