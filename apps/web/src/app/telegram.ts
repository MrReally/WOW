import { platform } from "./platform/telegram.ts";
import { api, setToken } from "../lib/api.ts";

// In a Telegram Mini App, exchange the verified initData for a session token
// once at startup. After that the app behaves exactly like an email login
// (Bearer token). If the Telegram account isn't linked, this fails quietly and
// the normal login screen is shown.
export async function ensureTelegramSession(): Promise<void> {
  if (platform.kind !== "telegram" || !platform.initData) return;
  try {
    const res = await api.post<{ token: string }>("/api/auth/telegram", { initData: platform.initData });
    setToken(res.token);
  } catch {
    /* not linked / not configured — the app will show the login screen */
  }
}
