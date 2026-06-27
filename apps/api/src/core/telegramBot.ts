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

interface Update {
  update_id: number;
  message?: { text?: string; from?: { username?: string }; chat: { id: number } };
  callback_query?: { id: string; data?: string; from: { id: number }; message?: { chat: { id: number }; message_id: number } };
}

export function startTelegramBot(deps: BotDeps): void {
  const { people, onCallback } = deps;
  if (!env.auth.telegramBotToken) return;
  const send = (chatId: string | number, text: string) => tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
  const publicName = (user: { nickname?: string | null; displayName?: string | null }) =>
    user.nickname?.trim() || user.displayName?.trim() || "аккаунт";
  let offset = 0;

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
          if (!msg?.text) continue;
          const chatId = String(msg.chat.id);
          const username = msg.from?.username;
          const text = msg.text.trim();
          const codeMatch = text.match(/^\/start\s+(\S+)/);
          try {
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
              await send(
                chatId,
                `Это бот уведомлений <b>SEVER</b>.\nВаш chat_id: <code>${chatId}</code>\n` +
                  (username
                    ? `Ник <b>@${username}</b> пока не привязан ни к одному аккаунту. `
                    : `У вас не задан username в Telegram. `) +
                  `Попросите администратора вписать ваш @username в карточке: Настройки → Люди.`
              );
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
