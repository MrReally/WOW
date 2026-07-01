import { env } from "../env.js";

/** One inline-keyboard button: a label + the callback_data we get back on tap. */
export interface InlineButton {
  text: string;
  callbackData: string;
}

type MessageLogger = (message: {
  telegramId: string;
  direction: "bot" | "operator";
  messageType: "text" | "photo" | "system";
  text: string;
  telegramMessageId: number | null;
}) => Promise<void>;

let messageLogger: MessageLogger | null = null;

export function setTelegramMessageLogger(logger: MessageLogger): void {
  messageLogger = logger;
}

async function logBotMessage(input: Parameters<MessageLogger>[0]): Promise<void> {
  try {
    await messageLogger?.(input);
  } catch {
    // Logging must never break Telegram delivery.
  }
}

// Sends a Telegram message if a bot token is configured and the recipient has a
// telegram id. A no-op otherwise, so notifications always work in-app and the
// Telegram channel "activates" the moment a token is set. Optionally attaches an
// inline keyboard (rows of buttons) — used for accept/decline invites.
export async function sendTelegramMessage(
  chatId: string | null,
  text: string,
  opts?: { inlineKeyboard?: InlineButton[][] }
): Promise<{ chatId: string; messageId: number } | null> {
  const token = env.auth.telegramBotToken;
  if (!token || !chatId) return null;
  // A telegram id is numeric; usernames won't work as chat_id, skip those.
  if (!/^\d+$/.test(chatId)) return null;
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML" };
  if (opts?.inlineKeyboard) {
    body.reply_markup = {
      inline_keyboard: opts.inlineKeyboard.map((row) => row.map((b) => ({ text: b.text, callback_data: b.callbackData }))),
    };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json() as { ok?: boolean; result?: { message_id?: number } };
    const messageId = json.result?.message_id;
    if (json.ok && typeof messageId === "number") {
      await logBotMessage({ telegramId: chatId, direction: "bot", messageType: "text", text, telegramMessageId: messageId });
      return { chatId, messageId };
    }
    return null;
  } catch {
    // Telegram delivery is best-effort; never break the publisher.
    return null;
  }
}

export async function editTelegramMessage(
  chatId: string | null,
  messageId: number | null,
  text: string
): Promise<void> {
  const token = env.auth.telegramBotToken;
  if (!token || !chatId || !messageId) return;
  if (!/^\d+$/.test(chatId)) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" }),
    });
    const json = await res.json() as { ok?: boolean };
    if (json.ok) {
      await logBotMessage({ telegramId: chatId, direction: "bot", messageType: "system", text, telegramMessageId: messageId });
    }
  } catch {
    // Best-effort.
  }
}

export async function sendTelegramPhoto(
  chatId: string | null,
  photoFileId: string,
  caption: string,
  opts?: { inlineKeyboard?: InlineButton[][] }
): Promise<boolean> {
  const token = env.auth.telegramBotToken;
  if (!token || !chatId || !photoFileId) return false;
  if (!/^\d+$/.test(chatId)) return false;
  const body: Record<string, unknown> = { chat_id: chatId, photo: photoFileId, caption, parse_mode: "HTML" };
  if (opts?.inlineKeyboard) {
    body.reply_markup = {
      inline_keyboard: opts.inlineKeyboard.map((row) => row.map((b) => ({ text: b.text, callback_data: b.callbackData }))),
    };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json() as { ok?: boolean; result?: { message_id?: number } };
    if (json.ok === true) {
      await logBotMessage({ telegramId: chatId, direction: "bot", messageType: "photo", text: caption, telegramMessageId: json.result?.message_id ?? null });
      return true;
    }
    return false;
  } catch {
    // Best-effort.
    return false;
  }
}
