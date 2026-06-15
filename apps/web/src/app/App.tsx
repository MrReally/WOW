import { BrowserRouter } from "react-router-dom";
import { Providers } from "./providers.tsx";
import { AppShell } from "./shell/AppShell.tsx";
import { AppRouter } from "./router.tsx";
import { useSession } from "./session.ts";
import { Loading, EmptyState, Button } from "../ui-kit/index.ts";

function SessionGate() {
  const { isLoading, error } = useSession();
  if (isLoading) return <Loading label="Подключение…" />;
  if (error) {
    // Almost always means the backend isn't running / unreachable.
    return (
      <div style={{ padding: 24 }}>
        <EmptyState
          title="Нет связи с сервером"
          hint="Бэкенд (API) не запущен или недоступен. Запусти приложение целиком (одна команда) и обнови страницу."
        />
        <div style={{ maxWidth: 280, margin: "0 auto" }}>
          <Button block onClick={() => location.reload()}>Обновить</Button>
        </div>
      </div>
    );
  }
  return (
    <AppShell>
      <AppRouter />
    </AppShell>
  );
}

export function App() {
  return (
    <Providers>
      <BrowserRouter>
        <SessionGate />
      </BrowserRouter>
    </Providers>
  );
}
