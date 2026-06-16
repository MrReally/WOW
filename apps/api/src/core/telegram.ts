import { env } from "../env.js";

/** One inline-keyboard button: a label + the callback_data we get back on tap. */
export interface InlineButton {
  text: string;
  callbackData: string;
}

// Sends a Telegram message if a bot token is configured and the recipient has a
// telegram id. A no-op otherwise, so notifications always work in-app and the
// Telegram channel "activates" the moment a token is set. Optionally attaches an
// inline keyboard (rows of buttons) — used for accept/decline invites.
export async function sendTelegramMessage(
  chatId: string | null,
  text: string,
  opts?: { inlineKeyboard?: InlineButton[][] }
): Promise<void> {
  const token = env.auth.telegramBotToken;
  if (!token || !chatId) return;
  // A telegram id is numeric; usernames won't work as chat_id, skip those.
  if (!/^\d+$/.test(chatId)) return;
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML" };
  if (opts?.inlineKeyboard) {
    body.reply_markup = {
      inline_keyboard: opts.inlineKeyboard.map((row) => row.map((b) => ({ text: b.text, callback_data: b.callbackData }))),
    };
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Telegram delivery is best-effort; never break the publisher.
  }
}
