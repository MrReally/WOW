import { BrowserRouter } from "react-router-dom";
import { Providers } from "./providers.tsx";
import { AppShell } from "./shell/AppShell.tsx";
import { AppRouter } from "./router.tsx";
import { useSession } from "./session.ts";
import { Loading, ErrorState } from "../ui-kit/index.ts";

function SessionGate() {
  const { isLoading, error } = useSession();
  if (isLoading) return <Loading label="Подключение…" />;
  if (error) return <ErrorState error={error} onRetry={() => location.reload()} />;
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
