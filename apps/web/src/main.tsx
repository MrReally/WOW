import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.tsx";
import { ensureTelegramSession } from "./app/telegram.ts";

// The standalone design demo opens on the feature under review while keeping
// the complete application shell available for navigation context.
if (import.meta.env.VITE_DEMO_MODE === "true" && window.location.pathname === "/") {
  window.history.replaceState(null, "", "/supplies");
}

// In a Telegram Mini App, log in via initData before the first render.
ensureTelegramSession().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
