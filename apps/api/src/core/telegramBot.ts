import { env } from "../env.js";
import type { People } from "@sever/contracts";

// Minimal Telegram bot via long polling (getUpdates) — works without a public
// HTTPS endpoint, so it runs anywhere the container has internet. Only starts
// when a bot token is configured.
//
// Linking: the app gives each person a deep link t.me/<bot>?start=<userId>.
// When they press it, /start <userId> arrives here and we save their numeric
// chat id onto that person, after which notifications deliver to them.

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

export function startTelegramBot(people: People.PeopleService): void {
  if (!env.auth.telegramBotToken) return;
  const send = (chatId: string | number, text: string) => tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
  let offset = 0;

  async function loop() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const res = await tg("getUpdates", { offset, timeout: 25 });
        const updates = (res?.result as { update_id: number; message?: { text?: string; chat: { id: number } } }[] | undefined) ?? [];
        for (const u of updates) {
          offset = u.update_id + 1;
          const msg = u.message;
          if (!msg?.text) continue;
          const chatId = String(msg.chat.id);
          const text = msg.text.trim();
          const m = text.match(/^\/start\s+(\S+)/);
          if (m) {
            const userId = m[1]!;
            try {
              const user = await people.getById(userId);
              if (user) {
                await people.update(userId, { telegramId: chatId });
                await send(chatId, `✅ Telegram привязан к аккаунту <b>${user.displayName}</b>. Уведомления будут приходить сюда.`);
              } else {
                await send(chatId, `Не нашёл аккаунт по коду. Ваш chat_id: <code>${chatId}</code>`);
              }
            } catch {
              await send(chatId, `Ваш chat_id: <code>${chatId}</code>`);
            }
          } else {
            await send(
              chatId,
              `Это бот уведомлений <b>SEVER</b>.\nВаш chat_id: <code>${chatId}</code>\nЧтобы привязать аккаунт — в приложении: Настройки → Люди → «Привязать Telegram».`
            );
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
