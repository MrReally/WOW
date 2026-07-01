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
  step: ApplicationField;
  draft: Partial<People.SubmitCrewApplicationInput>;
  username: string | null;
}

const APPLICATION_STEPS: { field: ApplicationField; prompt: string; optional?: boolean }[] = [
  { field: "firstName", prompt: "Имя" },
  { field: "lastName", prompt: "Фамилия" },
  { field: "patronymic", prompt: "Отчество, если есть. Если нет — отправьте «-»", optional: true },
  { field: "nickname", prompt: "Короткий ник для таймингов и списков" },
  { field: "email", prompt: "Email" },
  { field: "birthDate", prompt: "Дата рождения в формате ДД/ММ/ГГГГ" },
  { field: "languages", prompt: "Уровень языков. Например: RU C2, EN B2, SR A2" },
  { field: "about", prompt: "Коротко о себе" },
  { field: "source", prompt: "Откуда узнали о SEVER: кто пригласил или где нашли бота" },
  { field: "photoFileId", prompt: "Отправьте фото человека", optional: false },
];

interface Update {
  update_id: number;
  message?: {
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
  const send = (chatId: string | number, text: string) => tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
  const publicName = (user: { nickname?: string | null; displayName?: string | null }) =>
    user.nickname?.trim() || user.displayName?.trim() || "аккаунт";
  const sessions = new Map<string, ApplicationSession>();
  let offset = 0;

  const currentPrompt = (session: ApplicationSession) => APPLICATION_STEPS.find((step) => step.field === session.step)?.prompt ?? "Ответ";
  const nextStep = (field: ApplicationField): ApplicationField | null => {
    const index = APPLICATION_STEPS.findIndex((step) => step.field === field);
    return APPLICATION_STEPS[index + 1]?.field ?? null;
  };
  const parseDate = (value: string): string | null => {
    const m = value.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (!m) return null;
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  const validateTextField = (field: ApplicationField, value: string): string | null => {
    const v = value.trim();
    if (field === "patronymic" && (v === "-" || v.toLowerCase() === "нет")) return "";
    if (!v) return "Поле не должно быть пустым.";
    if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Пожалуйста, отправьте корректный email.";
    if (field === "birthDate" && !parseDate(v)) return "Нужна дата в формате ДД/ММ/ГГГГ.";
    return null;
  };
  const startApplication = async (chatId: string, username: string | null) => {
    const session: ApplicationSession = { step: "firstName", draft: { telegramId: chatId, telegramUsername: username }, username };
    sessions.set(chatId, session);
    await send(chatId, `В SEVER пока нет вашего аккаунта. Заполните короткую анкету для участия.\n\n${currentPrompt(session)}`);
  };
  const handleApplicationMessage = async (chatId: string, msg: NonNullable<Update["message"]>) => {
    const session = sessions.get(chatId);
    if (!session) return false;
    if (msg.text?.trim().toLowerCase() === "/cancel" || msg.text?.trim().toLowerCase() === "отмена") {
      sessions.delete(chatId);
      await send(chatId, "Анкета отменена. Чтобы начать заново, нажмите /start.");
      return true;
    }
    if (session.step === "photoFileId") {
      const photo = [...(msg.photo ?? [])].sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))[0];
      if (!photo) {
        await send(chatId, "Нужно отправить именно фото человека.");
        return true;
      }
      session.draft.photoFileId = photo.file_id;
      try {
        await people.submitApplication(session.draft as People.SubmitCrewApplicationInput);
        sessions.delete(chatId);
        await send(chatId, "✅ Анкета отправлена. Мы вернёмся с ответом после просмотра.");
      } catch (err) {
        sessions.delete(chatId);
        await send(chatId, err instanceof Error ? `Не удалось отправить анкету: ${err.message}` : "Не удалось отправить анкету.");
      }
      return true;
    }
    const value = msg.text?.trim() ?? "";
    const error = validateTextField(session.step, value);
    if (error) {
      await send(chatId, `${error}\n\n${currentPrompt(session)}`);
      return true;
    }
    if (session.step === "birthDate") {
      session.draft.birthDate = parseDate(value)!;
    } else if (session.step === "patronymic") {
      session.draft.patronymic = value === "-" || value.toLowerCase() === "нет" ? null : value;
    } else {
      (session.draft as Record<string, unknown>)[session.step] = value;
    }
    const next = nextStep(session.step);
    if (!next) return true;
    session.step = next;
    await send(chatId, currentPrompt(session));
    return true;
  };

  async function handleCallback(cb: NonNullable<Update["callback_query"]>) {
    const fromChatId = String(cb.from.id);
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
