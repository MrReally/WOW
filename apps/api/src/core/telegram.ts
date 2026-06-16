import { env } from "../env.js";

// Sends a Telegram message if a bot token is configured and the recipient has a
// telegram id. A no-op otherwise, so notifications always work in-app and the
// Telegram channel "activates" the moment a token is set.
export async function sendTelegramMessage(chatId: string | null, text: string): Promise<void> {
  const token = env.auth.telegramBotToken;
  if (!token || !chatId) return;
  // A telegram id is numeric; usernames won't work as chat_id, skip those.
  if (!/^\d+$/.test(chatId)) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch {
    // Telegram delivery is best-effort; never break the publisher.
  }
}
