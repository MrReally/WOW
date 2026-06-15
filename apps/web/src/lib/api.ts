import { platform } from "../app/platform/telegram.ts";

// Same-origin by default: in production the API serves this bundle, and in dev
// Vite proxies /api → the API. An explicit VITE_API_URL still overrides (used by
// tests and split deployments). This removes the "frontend can't reach backend"
// class of failure entirely.
const BASE = import.meta.env.VITE_API_URL ?? "";

// Dev identity switcher. In a real Telegram session the auth header is the
// verified initData; in the browser we send x-dev-user so the API's dev bypass
// can resolve a role. Stored so Settings can switch the simulated user.
const DEV_USER_KEY = "sever.devUser";

export function getDevUser(): string {
  return localStorage.getItem(DEV_USER_KEY) ?? "dev-admin";
}
export function setDevUser(id: string): void {
  localStorage.setItem(DEV_USER_KEY, id);
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (platform.kind === "telegram") {
    headers["x-telegram-init-data"] = platform.initData;
  } else {
    headers["x-dev-user"] = getDevUser();
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    let code = "error";
    let message = res.statusText;
    try {
      const json = await res.json();
      code = json?.error?.code ?? code;
      message = json?.error?.message ?? message;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(code, message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
};
