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
    .then((r) => r.json() as Promise<{ ok: boolean; result?: unknown }>)
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
}

const APPLICATION_STEPS: { field: ApplicationField; label: string; question: string; optional?: boolean }[] = [
  { field: "firstName", label: "Имя", question: "Как вас зовут?" },
  { field: "lastName", label: "Фамилия", question: "Какая у вас фамилия?" },
  { field: "patronymic", label: "Отчество", question: "Отчество, если есть. Если нет — отправьте «-».", optional: true },
  { field: "nickname", label: "Ник", question: "Какой короткий ник использовать в таймингах и списках?" },
  { field: "email", label: "Email", question: "На какой email можно с вами связаться?" },
  { field: "birthDate", label: "Дата рождения", question: "Какая у вас дата рождения? Можно цифрами или месяц словами." },
  { field: "languages", label: "Языки", question: "Какие языки вы знаете и на каком уровне? Например: RU C2, EN B2, SR A2." },
  { field: "about", label: "О себе", question: "Коротко расскажите о себе и опыте." },
  { field: "source", label: "Источник", question: "Откуда вы узнали о SEVER? Кто пригласил или где нашли бота?" },
  { field: "photoFileId", label: "Фото", question: "Отправьте фото человека.", optional: false },
];

const MONTH_WORDS = new Map<string, number>([
  // RU
  ["январь", 1], ["января", 1], ["янв", 1],
  ["февраль", 2], ["февраля", 2], ["фев", 2], ["февр", 2],
  ["март", 3], ["марта", 3], ["мар", 3],
  ["апрель", 4], ["апреля", 4], ["апр", 4],
  ["май", 5], ["мая", 5],
  ["июнь", 6], ["июня", 6], ["июн", 6],
  ["июль", 7], ["июля", 7], ["июл", 7],
  ["август", 8], ["августа", 8], ["авг", 8],
  ["сентябрь", 9], ["сентября", 9], ["сен", 9], ["сент", 9], ["сентяб", 9],
  ["октябрь", 10], ["октября", 10], ["окт", 10],
  ["ноябрь", 11], ["ноября", 11], ["ноя", 11], ["нояб", 11],
  ["декабрь", 12], ["декабря", 12], ["дек", 12],
  // EN
  ["january", 1], ["jan", 1],
  ["february", 2], ["feb", 2],
  ["march", 3], ["mar", 3],
  ["april", 4], ["apr", 4],
  ["may", 5],
  ["june", 6], ["jun", 6],
  ["july", 7], ["jul", 7],
  ["august", 8], ["aug", 8],
  ["september", 9], ["sep", 9], ["sept", 9],
  ["october", 10], ["oct", 10],
  ["november", 11], ["nov", 11],
  ["december", 12], ["dec", 12],
  // SR latin/cyrillic
  ["januar", 1], ["januara", 1], ["јануар", 1], ["јануара", 1],
  ["februar", 2], ["februara", 2], ["фебруар", 2], ["фебруара", 2],
  ["mart", 3], ["marta", 3], ["март", 3], ["марта", 3],
  ["april", 4], ["aprila", 4], ["април", 4], ["априла", 4],
  ["maj", 5], ["maja", 5], ["мај", 5], ["маја", 5],
  ["jun", 6], ["juna", 6], ["јун", 6], ["јуна", 6],
  ["jul", 7], ["jula", 7], ["јул", 7], ["јула", 7],
  ["avgust", 8], ["avgusta", 8], ["avg", 8], ["август", 8], ["августа", 8], ["авг", 8],
  ["septembar", 9], ["septembra", 9], ["sep", 9], ["септембар", 9], ["септембра", 9], ["сеп", 9],
  ["oktobar", 10], ["oktobra", 10], ["okt", 10], ["октобар", 10], ["октобра", 10], ["окт", 10],
  ["novembar", 11], ["novembra", 11], ["nov", 11], ["новембар", 11], ["новембра", 11], ["нов", 11],
  ["decembar", 12], ["decembra", 12], ["dec", 12], ["децембар", 12], ["децембра", 12], ["дец", 12],
]);

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
    const raw = value
      .trim()
      .toLowerCase()
      .replace(/[,’']/g, "")
      .replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, "$1");
    const tokens = raw
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .filter(Boolean);
    if (tokens.length < 3) return null;

    const monthIndex = tokens.findIndex((token) => MONTH_WORDS.has(token));
    if (monthIndex >= 0) {
      const month = MONTH_WORDS.get(tokens[monthIndex]!)!;
      const numbers = tokens
        .map((token, index) => ({ token, index }))
        .filter((item) => item.index !== monthIndex && /^\d{1,4}$/.test(item.token))
        .map((item) => ({ value: Number(item.token), index: item.index, raw: item.token }));
      const yearCandidate = numbers.find((item) => item.raw.length === 4) ?? numbers[numbers.length - 1];
      const dayCandidate = numbers.find((item) => item !== yearCandidate && item.value >= 1 && item.value <= 31);
      if (!yearCandidate || !dayCandidate) return null;
      return finishDate(dayCandidate.value, month, yearCandidate.value);
    }

    const nums = tokens.filter((token) => /^\d{1,4}$/.test(token)).map(Number);
    if (nums.length < 3) return null;
    const [a, b, c] = nums;
    if (String(tokens[0]).length === 4) return finishDate(c!, b!, a!); // YYYY-MM-DD
    if (a! > 31 || b! > 31) return null;
    if (a! > 12) return finishDate(a!, b!, c!); // DD-MM-YYYY
    if (b! > 12) return finishDate(b!, a!, c!); // MM-DD-YYYY, useful for English numeric dates
    return finishDate(a!, b!, c!); // default to DD-MM-YYYY for local usage
  };
  const displayValue = (session: ApplicationSession, field: ApplicationField): string => {
    const value = session.draft[field];
    if (field === "patronymic" && (value === null || value === "")) return "—";
    if (field === "photoFileId") return value ? "приложено" : "—";
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
    if (field === "birthDate" && !parseDate(v)) return "Не понял дату. Можно так: 01/02/2000, 1 февраля 2000, Feb 1 2000.";
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
      `Анкета · ${done}/${required}`,
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
    const field = session.editingField ?? firstUnansweredField(session) ?? firstRequiredMissingField(session);
    if (!field) return null;
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
      if (edited?.ok) return;
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
    if (session.editingField === null && firstUnansweredField(session) === null && firstRequiredMissingField(session) === null) return;
    const text = renderQuestion(session);
    if (!text) return;
    const sent = await send(chatId, text);
    const messageId = (sent?.result as { message_id?: number } | undefined)?.message_id;
    if (typeof messageId === "number") session.questionMessageId = messageId;
  };
  const startApplication = async (chatId: string, username: string | null) => {
    const session: ApplicationSession = {
      summaryMessageId: null,
      questionMessageId: null,
      editingField: null,
      draft: { telegramId: chatId, telegramUsername: username },
      username,
      lastError: null,
      usedSingleAnswers: false,
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
      sessions.delete(chatId);
      const finalText = "✅ Анкета отправлена. Мы вернёмся с ответом после просмотра.";
      if (session.questionMessageId) await del(chatId, session.questionMessageId);
      if (session.summaryMessageId) await edit(chatId, session.summaryMessageId, finalText);
      else await send(chatId, finalText);
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
