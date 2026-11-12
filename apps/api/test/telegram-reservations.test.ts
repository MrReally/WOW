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

  it("rejects every protected direct callback for an Apex-notification recipient without write rights", async () => {
    env.auth.telegramBotToken = "test-token";
    const projectId = "11111111-1111-4111-8111-111111111111";
    const reservationId = "22222222-2222-4222-8222-222222222222";
    const modelId = "33333333-3333-4333-8333-333333333333";
    const unitId = "44444444-4444-4444-8444-444444444444";
    const roleId = "55555555-5555-4555-8555-555555555555";
    const employeeId = "66666666-6666-4666-8666-666666666666";
    const createReservation = vi.fn(); const updateReservation = vi.fn(); const deleteReservation = vi.fn(); const resolveReservation = vi.fn(); const addAssignment = vi.fn();
    const people = {
      list: vi.fn().mockResolvedValue([{ id: "user", active: true, telegramId: "12345" }]),
      permissionsForUser: vi.fn().mockResolvedValue(["apex.projectProblems.notify"]),
      getTelegramInboxSettings: vi.fn().mockResolvedValue({ workUsername: null }), logTelegramDialogMessage: vi.fn(), markTelegramDialogMessageDeleted: vi.fn(),
      getById: vi.fn(),
    } as unknown as People.PeopleService;
    const projects = { listProjects: vi.fn().mockResolvedValue([]), createReservation, updateReservation, deleteReservation, resolveReservation, addAssignment } as unknown as Projects.ProjectsService;
    const updates = [
      `nav:project:reservations:${projectId}`, `nav:reservation:model:${modelId}`, `nav:reservation:qty:${reservationId}:1`, `nav:reservation:units:${reservationId}`,
      `nav:reservation:unit:${unitId}`, "nav:reservation:units:save", `nav:project:problems:${projectId}`, `nav:problem:role:${roleId}`,
      `nav:crew:person:${employeeId}`, `nav:crew:add:${employeeId}`, `nav:crew:invite:${employeeId}`,
    ].map((data, index) => ({ update_id: index + 1, callback_query: { id: String(index), data, from: { id: 12345 } } }));
    let polled = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("/getUpdates")) { if (polled) return new Promise<Response>(() => {}); polled = true; return Response.json({ ok: true, result: updates }); }
      return Response.json({ ok: true, result: { message_id: 10 } });
    });
    startTelegramBot({ people, appSettings: {} as AppSettings.AppSettingsService, projects, equipment: {} as Equipment.EquipmentService });
    await vi.waitFor(() => expect(people.permissionsForUser).toHaveBeenCalledTimes(updates.length));
    expect(createReservation).not.toHaveBeenCalled();
    expect(updateReservation).not.toHaveBeenCalled();
    expect(deleteReservation).not.toHaveBeenCalled();
    expect(resolveReservation).not.toHaveBeenCalled();
    expect(addAssignment).not.toHaveBeenCalled();
    expect(people.getById).not.toHaveBeenCalled();
  });

  it("rechecks a revoked reservation permission immediately before a stale model callback writes", async () => {
    env.auth.telegramBotToken = "test-token";
    const projectId = "11111111-1111-4111-8111-111111111111";
    const modelId = "22222222-2222-4222-8222-222222222222";
    const project = { id: projectId, baseName: "Тест", name: "Тест", clientId: "c", status: "draft", startsAt: null, endsAt: null, serviceMode: "full_service" } as Projects.ProjectDTO;
    const createReservation = vi.fn();
    const people = {
      list: vi.fn().mockResolvedValue([{ id: "user", active: true, telegramId: "12345" }]),
      permissionsForUser: vi.fn().mockResolvedValueOnce(["projects.reservation.manage"]).mockResolvedValueOnce(["projects.reservation.manage"]).mockResolvedValueOnce([]),
      getTelegramInboxSettings: vi.fn().mockResolvedValue({ workUsername: null }), logTelegramDialogMessage: vi.fn(), markTelegramDialogMessageDeleted: vi.fn(),
    } as unknown as People.PeopleService;
    const projects = { listProjects: vi.fn().mockResolvedValue([project]), getProject: vi.fn().mockResolvedValue(project), listReservations: vi.fn().mockResolvedValue([]), createReservation } as unknown as Projects.ProjectsService;
    const updates = [`nav:project:reservations:${projectId}`, "nav:reservation:add", `nav:reservation:model:${modelId}`].map((data, index) => ({ update_id: index + 1, callback_query: { id: String(index), data, from: { id: 12345 } } }));
    let polled = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("/getUpdates")) { if (polled) return new Promise<Response>(() => {}); polled = true; return Response.json({ ok: true, result: updates }); }
      return Response.json({ ok: true, result: { message_id: 10 } });
    });
    startTelegramBot({ people, appSettings: {} as AppSettings.AppSettingsService, projects, equipment: { listModels: vi.fn().mockResolvedValue([]) } as unknown as Equipment.EquipmentService });
    await vi.waitFor(() => expect(people.permissionsForUser).toHaveBeenCalledTimes(3));
    expect(createReservation).not.toHaveBeenCalled();
  });
});
