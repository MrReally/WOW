import { env } from "../env.js";
import type { People } from "@sever/contracts";

// Minimal Telegram bot via long polling (getUpdates) — works without a public
// HTTPS endpoint, so it runs anywhere the container has internet. Only starts
// when a bot token is configured.
//
// Linking — two ways, both end with the person's numeric chat id saved onto
// their account (after which notifications deliver to them):
//   1. Deep link  t.me/<bot>?start=<userId>  → /start <userId> (most robust).
//   2. By @username: an admin types the person's @username on their card; the
//      person just opens the bot and presses Start, and we match on from.username.
// Until linked, the account's telegram_id holds the pending @username; pressing
// Start replaces it with the numeric chat id.

/** Normalize a Telegram handle for comparison: drop a leading @, lowercase. */
const normHandle = (s: string | null | undefined): string => (s ?? "").trim().replace(/^@/, "").toLowerCase();

const tg = (method: string, body: unknown) =>
  fetch(`https://api.telegram.org/bot${env.auth.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
    .then((r) => r.json() as Promise<{ ok: boolean; result?: unknown; description?: string }>)
    .catch(() => null);

let cachedUsername: string | null = null;
export async function getBotUsername(): Promise<string | null> {
  if (!env.auth.telegramBotToken) return null;
  if (cachedUsername) return cachedUsername;
  const res = await tg("getMe", {});
  const username = (res?.result as { username?: string } | undefined)?.username ?? null;
  cachedUsername = username;
  return username;
}

/** Tapping an inline button (e.g. accept/decline an invite). The handler
 *  returns the text to replace the original message with, or null to ignore. */
export type CallbackHandler = (data: string, fromChatId: string) => Promise<string | null>;

interface BotDeps {
  people: People.PeopleService;
  onCallback?: CallbackHandler;
}

type ApplicationField = "firstName" | "lastName" | "patronymic" | "nickname" | "email" | "birthDate" | "languages" | "about" | "source" | "photoFileId";
interface ApplicationSession {
  summaryMessageId: number | null;
  questionMessageId: number | null;
  editingField: ApplicationField | null;
  draft: Partial<People.SubmitCrewApplicationInput>;
  username: string | null;
  lastError: string | null;
  usedSingleAnswers: boolean;
  submitted: boolean;
}

const APPLICATION_STEPS: { field: ApplicationField; label: string; question: string; optional?: boolean }[] = [
  { field: "firstName", label: "Имя", question: "Как вас зовут?" },
  { field: "lastName", label: "Фамилия", question: "Какая у вас фамилия?" },
  { field: "patronymic", label: "Отчество", question: "Отчество, если есть. Если нет — отправьте «-».", optional: true },
  { field: "nickname", label: "Ник", question: "Какой короткий ник использовать в таймингах и списках?" },
  { field: "email", label: "Email", question: "На какой email можно с вами связаться?" },
  { field: "birthDate", label: "Дата рождения", question: "Какая у вас дата рождения? Формат: ДД.ММ.ГГГГ." },
  { field: "languages", label: "Языки", question: "Какие языки вы знаете и на каком уровне? Например: RU C2, EN B2, SR A2." },
  { field: "about", label: "О себе", question: "Коротко расскажите о себе и опыте." },
  { field: "source", label: "Источник", question: "Откуда вы узнали о SEVER? Кто пригласил или где нашли бота?" },
  { field: "photoFileId", label: "Фото", question: "Отправьте своё фото", optional: false },
];

interface Update {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    photo?: { file_id: string; file_size?: number; width?: number; height?: number }[];
    from?: { username?: string };
    chat: { id: number };
  };
  callback_query?: { id: string; data?: string; from: { id: number }; message?: { chat: { id: number }; message_id: number } };
}

export function startTelegramBot(deps: BotDeps): void {
  const { people, onCallback } = deps;
  if (!env.auth.telegramBotToken) return;
  const send = (chatId: string | number, text: string, replyMarkup?: unknown) =>
    tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", reply_markup: replyMarkup });
  const edit = (chatId: string | number, messageId: number, text: string, replyMarkup?: unknown) =>
    tg("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", reply_markup: replyMarkup });
  const del = (chatId: string | number, messageId: number) => tg("deleteMessage", { chat_id: chatId, message_id: messageId });
  const publicName = (user: { nickname?: string | null; displayName?: string | null }) =>
    user.nickname?.trim() || user.displayName?.trim() || "аккаунт";
  const sessions = new Map<string, ApplicationSession>();
  let offset = 0;

  const escapeHtml = (value: string | null | undefined) => (value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const finishDate = (day: number, month: number, year: number): string | null => {
    const fullYear = year < 100 ? (year > 30 ? 1900 + year : 2000 + year) : year;
    if (fullYear < 1900 || fullYear > new Date().getFullYear()) return null;
    const d = new Date(Date.UTC(fullYear, month - 1, day));
    if (d.getUTCFullYear() !== fullYear || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
    return `${fullYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  const parseDate = (value: string): string | null => {
    const nums = value.trim().split(/[.\-/\s]+/).filter(Boolean).map((token) => Number(token));
    if (nums.length < 3) return null;
    if (nums.some((n) => !Number.isInteger(n))) return null;
    const [day, month, year] = nums;
    return finishDate(day!, month!, year!);
  };
  const formatDateForDisplay = (iso: string | null | undefined): string => {
    const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : "—";
  };
  const displayValue = (session: ApplicationSession, field: ApplicationField): string => {
    const value = session.draft[field];
    if (field === "patronymic" && (value === null || value === "")) return "—";
    if (field === "photoFileId") return value ? "приложено" : "—";
    if (field === "birthDate") return typeof value === "string" ? formatDateForDisplay(value) : "—";
    return typeof value === "string" && value.trim() ? value : "—";
  };
  const hasField = (session: ApplicationSession, field: ApplicationField): boolean => {
    const step = APPLICATION_STEPS.find((item) => item.field === field);
    const value = session.draft[field];
    if (step?.optional) return true;
    return typeof value === "string" && value.trim().length > 0;
  };
  const firstRequiredMissingField = (session: ApplicationSession): ApplicationField | null =>
    APPLICATION_STEPS.find((step) => !hasField(session, step.field))?.field ?? null;
  const firstUnansweredField = (session: ApplicationSession): ApplicationField | null =>
    APPLICATION_STEPS.find((step) => session.draft[step.field] === undefined)?.field ?? null;
  const validateTextField = (field: ApplicationField, value: string): string | null => {
    const v = value.trim();
    if (field === "patronymic" && (v === "-" || v.toLowerCase() === "нет")) return "";
    if (!v) return "Поле не должно быть пустым.";
    if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Пожалуйста, отправьте корректный email.";
    if (field === "birthDate" && !parseDate(v)) return "Не понял дату. Формат: ДД.ММ.ГГГГ.";
    return null;
  };
  const applyTextField = (session: ApplicationSession, field: ApplicationField, value: string): string | null => {
    if (field === "photoFileId") return "Фото нужно отправить как изображение.";
    const error = validateTextField(field, value);
    if (error) return error;
    if (field === "birthDate") {
      session.draft.birthDate = parseDate(value)!;
    } else if (field === "patronymic") {
      session.draft.patronymic = value.trim() === "-" || value.trim().toLowerCase() === "нет" ? null : value.trim();
    } else {
      (session.draft as Record<string, unknown>)[field] = value.trim();
    }
    return null;
  };
  const parseNumberedAnswers = (text: string): { field: ApplicationField; value: string }[] => {
    const out: { field: ApplicationField; value: string }[] = [];
    for (const line of text.split(/\n+/)) {
      const match = line.match(/^\s*(\d{1,2})[.)]\s*(.+)\s*$/);
      if (!match) continue;
      const step = APPLICATION_STEPS[Number(match[1]) - 1];
      if (step && step.field !== "photoFileId") out.push({ field: step.field, value: match[2]!.trim() });
    }
    return out;
  };
  const keyboard = (session: ApplicationSession, editMode = false) => {
    if (session.submitted) return { inline_keyboard: [] };
    if (editMode) {
      const rows = APPLICATION_STEPS.reduce<{ text: string; callback_data: string }[][]>((acc, step, index) => {
        const rowIndex = Math.floor(index / 2);
        acc[rowIndex] ??= [];
        acc[rowIndex]!.push({ text: `${index + 1}. ${step.label}`, callback_data: `app:field:${step.field}` });
        return acc;
      }, []);
      rows.push([{ text: "Готово", callback_data: "app:done" }]);
      return { inline_keyboard: rows };
    }
    return {
      inline_keyboard: [[
        { text: "Редактировать", callback_data: "app:edit" },
        { text: "Отправить", callback_data: "app:submit" },
      ]],
    };
  };
  const renderApplication = (session: ApplicationSession, editMode = false): string => {
    const required = APPLICATION_STEPS.filter((step) => !step.optional).length;
    const done = APPLICATION_STEPS.filter((step) => !step.optional && hasField(session, step.field)).length;
    const lines = [
      "<b>SEVER Crew</b>",
      session.submitted ? "Анкета · отправлена" : `Анкета · ${done}/${required}`,
      "",
      ...APPLICATION_STEPS.map((step, index) => {
        const answered = step.optional ? session.draft[step.field] !== undefined : hasField(session, step.field);
        const mark = answered ? "✓" : "○";
        return `${mark} ${index + 1}. ${step.label}: ${escapeHtml(displayValue(session, step.field))}`;
      }),
    ];
    if (session.lastError) lines.push("", `⚠️ ${escapeHtml(session.lastError)}`);
    if (editMode) {
      lines.push("", "Что редактируем?");
    }
    return lines.join("\n");
  };
  const renderQuestion = (session: ApplicationSession): string | null => {
    if (session.submitted) return null;
    const field = session.editingField ?? firstUnansweredField(session) ?? firstRequiredMissingField(session);
    if (!field) return "<b>Анкета заполнена</b>\nХотите отправить?";
    const index = APPLICATION_STEPS.findIndex((step) => step.field === field);
    const step = APPLICATION_STEPS[index];
    if (!step) return null;
    const lines = [`<b>${index + 1}. ${escapeHtml(step.label)}</b>`, escapeHtml(step.question)];
    if (!session.usedSingleAnswers && field === "firstName") {
      lines.push("", "Можно ответить сразу списком:", "<code>1. Александр</code>", "<code>2. Иванов</code>", "<code>3. -</code>");
    }
    return lines.join("\n");
  };
  const renderOrSendApplication = async (chatId: string, session: ApplicationSession, editMode = false) => {
    const text = renderApplication(session, editMode);
    const markup = keyboard(session, editMode);
    if (session.summaryMessageId) {
      const edited = await edit(chatId, session.summaryMessageId, text, markup);
      if (edited?.ok || edited?.description?.includes("message is not modified")) return;
      if (!edited?.description?.includes("message to edit not found")) return;
    }
    const sent = await send(chatId, text, markup);
    const messageId = (sent?.result as { message_id?: number } | undefined)?.message_id;
    if (typeof messageId === "number") session.summaryMessageId = messageId;
  };
  const replaceQuestion = async (chatId: string, session: ApplicationSession) => {
    if (session.questionMessageId) {
      await del(chatId, session.questionMessageId);
      session.questionMessageId = null;
    }
    const text = renderQuestion(session);
    if (!text) return;
    const sent = await send(chatId, text);
    const messageId = (sent?.result as { message_id?: number } | undefined)?.message_id;
    if (typeof messageId === "number") session.questionMessageId = messageId;
  };
  const startApplication = async (chatId: string, username: string | null) => {
    const previous = sessions.get(chatId);
    if (previous?.summaryMessageId) await del(chatId, previous.summaryMessageId);
    if (previous?.questionMessageId) await del(chatId, previous.questionMessageId);
    const session: ApplicationSession = {
      summaryMessageId: null,
      questionMessageId: null,
      editingField: null,
      draft: { telegramId: chatId, telegramUsername: username },
      username,
      lastError: null,
      usedSingleAnswers: false,
      submitted: false,
    };
    sessions.set(chatId, session);
    await send(chatId, "<b>Анкета SEVER Crew</b>\nЗаполните короткую форму. Можно отвечать по одному вопросу или сразу списком по номерам.");
    await renderOrSendApplication(chatId, session);
    await replaceQuestion(chatId, session);
  };
  const submitApplication = async (chatId: string, session: ApplicationSession) => {
    const missing = firstRequiredMissingField(session);
    if (missing) {
      session.lastError = `Не заполнено поле «${APPLICATION_STEPS.find((step) => step.field === missing)?.label ?? missing}».`;
      await renderOrSendApplication(chatId, session);
      return false;
    }
    try {
      await people.submitApplication(session.draft as People.SubmitCrewApplicationInput);
      session.submitted = true;
      session.lastError = null;
      session.editingField = null;
      if (session.questionMessageId) await del(chatId, session.questionMessageId);
      await renderOrSendApplication(chatId, session);
      sessions.delete(chatId);
      await send(chatId, "✅ Анкета отправлена. Мы вернёмся с ответом после просмотра.");
    } catch (err) {
      session.lastError = err instanceof Error ? err.message : "Не удалось отправить анкету.";
      await renderOrSendApplication(chatId, session);
    }
    return true;
  };
  const handleApplicationMessage = async (chatId: string, msg: NonNullable<Update["message"]>) => {
    const session = sessions.get(chatId);
    if (!session) return false;
    if (msg.text?.trim().toLowerCase() === "/cancel" || msg.text?.trim().toLowerCase() === "отмена") {
      sessions.delete(chatId);
      await del(chatId, msg.message_id);
      if (session.questionMessageId) await del(chatId, session.questionMessageId);
      if (session.summaryMessageId) await edit(chatId, session.summaryMessageId, "Анкета отменена. Чтобы начать заново, нажмите /start.");
      else await send(chatId, "Анкета отменена. Чтобы начать заново, нажмите /start.");
      return true;
    }
    session.lastError = null;
    const photo = [...(msg.photo ?? [])].sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))[0];
    if (photo) {
      session.usedSingleAnswers = true;
      session.draft.photoFileId = photo.file_id;
      session.editingField = null;
    } else {
      const text = msg.text?.trim() ?? "";
      const numbered = parseNumberedAnswers(text);
      if (numbered.length > 0) {
        const errors: string[] = [];
        for (const item of numbered) {
          const error = applyTextField(session, item.field, item.value);
          if (error) errors.push(`${APPLICATION_STEPS.find((step) => step.field === item.field)?.label}: ${error}`);
        }
        session.lastError = errors[0] ?? null;
        session.editingField = null;
      } else {
        session.usedSingleAnswers = true;
        const target = session.editingField ?? firstUnansweredField(session) ?? firstRequiredMissingField(session);
        if (!target) {
          session.lastError = "Анкета уже заполнена. Можно отправить или отредактировать поле.";
        } else {
          const error = applyTextField(session, target, text);
          session.lastError = error;
          if (!error) session.editingField = null;
        }
      }
    }
    await del(chatId, msg.message_id);
    if (session.questionMessageId) {
      await del(chatId, session.questionMessageId);
      session.questionMessageId = null;
    }
    await renderOrSendApplication(chatId, session);
    await replaceQuestion(chatId, session);
    return true;
  };

  async function handleCallback(cb: NonNullable<Update["callback_query"]>) {
    const fromChatId = String(cb.from.id);
    const data = cb.data ?? "";
    if (data.startsWith("app:")) {
      const session = sessions.get(fromChatId);
      if (!session) {
        await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Анкета не активна. Нажмите /start." });
        return;
      }
      if (data === "app:edit") {
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await renderOrSendApplication(fromChatId, session, true);
        if (session.questionMessageId) {
          await del(fromChatId, session.questionMessageId);
          session.questionMessageId = null;
        }
        return;
      }
      if (data === "app:done") {
        session.editingField = null;
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await renderOrSendApplication(fromChatId, session);
        await replaceQuestion(fromChatId, session);
        return;
      }
      if (data === "app:submit") {
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await submitApplication(fromChatId, session);
        return;
      }
      const fieldMatch = data.match(/^app:field:(.+)$/);
      if (fieldMatch) {
        session.editingField = fieldMatch[1] as ApplicationField;
        session.lastError = null;
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await renderOrSendApplication(fromChatId, session);
        await replaceQuestion(fromChatId, session);
        return;
      }
    }
    let text: string | null = null;
    try {
      text = onCallback ? await onCallback(cb.data ?? "", fromChatId) : null;
    } catch {
      text = "Не удалось обработать действие.";
    }
    // Stop the button's spinner.
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text: text ?? undefined });
    // Replace the invite message (and drop its buttons) with the outcome.
    if (text && cb.message) {
      await tg("editMessageText", {
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        text,
        parse_mode: "HTML",
      });
    }
  }

  async function loop() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const res = await tg("getUpdates", { offset, timeout: 25 });
        const updates = (res?.result as Update[] | undefined) ?? [];
        for (const u of updates) {
          offset = u.update_id + 1;
          if (u.callback_query) {
            await handleCallback(u.callback_query);
            continue;
          }
          const msg = u.message;
          if (!msg?.text && !msg?.photo) continue;
          const chatId = String(msg.chat.id);
          const username = msg.from?.username;
          const text = msg.text?.trim() ?? "";
          const codeMatch = text.match(/^\/start\s+(\S+)/);
          try {
            if (!text.startsWith("/start") && await handleApplicationMessage(chatId, msg)) continue;
            if (codeMatch) {
              // Deep-link path: the link carries the exact account id.
              const userId = codeMatch[1]!;
              const user = await people.getById(userId);
              if (user) {
                await people.update(userId, { telegramId: chatId });
                await send(chatId, `✅ Telegram привязан к аккаунту <b>${publicName(user)}</b>. Уведомления будут приходить сюда.`);
              } else {
                await send(chatId, `Не нашёл аккаунт по коду. Ваш chat_id: <code>${chatId}</code>`);
              }
              continue;
            }
            // Otherwise match by @username, pre-filled by an admin on the card.
            const users = await people.list();
            const already = users.find((p) => p.telegramId === chatId);
            if (already) {
              await send(chatId, `Вы уже привязаны к аккаунту <b>${publicName(already)}</b>.`);
              continue;
            }
            const norm = normHandle(username);
            const match = norm ? users.find((p) => normHandle(p.telegramId) === norm) : undefined;
            if (match) {
              await people.update(match.id, { telegramId: chatId });
              await send(chatId, `✅ Telegram привязан к аккаунту <b>${publicName(match)}</b>. Уведомления будут приходить сюда.`);
            } else {
              await startApplication(chatId, username ? `@${username}` : null);
            }
          } catch {
            await send(chatId, `Ваш chat_id: <code>${chatId}</code>`);
          }
        }
      } catch {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  void loop();
  // eslint-disable-next-line no-console
  console.log("[telegram] bot polling started");
}
