// Platform adapter. The app runs identically as a Telegram Mini App and as a
// browser PWA; this is the only place that knows the difference. Features and
// hooks never touch window.Telegram directly.

interface TelegramBackButton {
  show: () => void;
  hide: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
}
interface TelegramWebApp {
  initData: string;
  colorScheme: "dark" | "light";
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  BackButton?: TelegramBackButton;
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
  /** Native Telegram back button; no-op in PWA. Returns an unsubscribe fn. */
  backButton: (visible: boolean, onClick?: () => void) => () => void;
}

export function detectPlatform(): Platform {
  const tg = window.Telegram?.WebApp;
  if (tg && tg.initData) {
    tg.ready();
    tg.expand();
    const bg = (tg.colorScheme ?? "dark") === "dark" ? "#15171b" : "#f2efe8";
    try {
      tg.setBackgroundColor?.(bg);
      tg.setHeaderColor?.(bg);
      tg.disableVerticalSwipes?.();
    } catch {
      /* older clients */
    }
    return {
      kind: "telegram",
      initData: tg.initData,
      colorScheme: tg.colorScheme ?? "dark",
      haptic: (style = "light") => tg.HapticFeedback?.impactOccurred(style),
      backButton: (visible, onClick) => {
        const bb = tg.BackButton;
        if (!bb) return () => {};
        const cb = onClick ?? (() => {});
        if (visible) {
          bb.onClick(cb);
          bb.show();
        } else {
          bb.hide();
        }
        return () => bb.offClick(cb);
      },
    };
  }
  return {
    kind: "pwa",
    initData: "",
    colorScheme: "dark",
    haptic: () => {},
    backButton: () => () => {},
  };
}

export const platform = detectPlatform();
