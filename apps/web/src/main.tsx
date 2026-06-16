import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.tsx";
import { ensureTelegramSession } from "./app/telegram.ts";

// In a Telegram Mini App, log in via initData before the first render.
ensureTelegramSession().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
