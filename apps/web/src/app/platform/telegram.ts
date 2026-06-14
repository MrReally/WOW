// Platform adapter. The app runs identically as a Telegram Mini App and as a
// browser PWA; this is the only place that knows the difference. Features and
// hooks never touch window.Telegram directly.

interface TelegramWebApp {
  initData: string;
  colorScheme: "dark" | "light";
  ready: () => void;
  expand: () => void;
  HapticFeedback?: { impactOccurred: (style: string) => void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export interface Platform {
  kind: "telegram" | "pwa";
  /** initData for Telegram auth; empty string in PWA/dev. */
  initData: string;
  colorScheme: "dark" | "light";
  haptic: (style?: "light" | "medium" | "heavy") => void;
}

export function detectPlatform(): Platform {
  const tg = window.Telegram?.WebApp;
  if (tg && tg.initData) {
    tg.ready();
    tg.expand();
    return {
      kind: "telegram",
      initData: tg.initData,
      colorScheme: tg.colorScheme ?? "dark",
      haptic: (style = "light") => tg.HapticFeedback?.impactOccurred(style),
    };
  }
  return {
    kind: "pwa",
    initData: "",
    colorScheme: "dark",
    haptic: () => {},
  };
}

export const platform = detectPlatform();
