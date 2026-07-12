import { BrowserRouter } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { Providers } from "./providers.tsx";
import { AppShell } from "./shell/AppShell.tsx";
import { AppRouter } from "./router.tsx";
import { useSession } from "./session.ts";
import { Loading } from "../ui-kit/index.ts";
import { AuthGate, ChangePasswordScreen } from "./auth/AuthScreens.tsx";
import { BackofficePage } from "../features/backoffice/BackofficePage.tsx";

function SessionGate() {
  const { user, mustChangePassword, isLoading, error, can } = useSession();
  const location = useLocation();
  if (import.meta.env.DEV && location.pathname.startsWith("/backoffice-preview")) return <BackofficePage />;
  if (isLoading) return <Loading label="Подключение…" />;
  // No valid session (401) or no user → show login / first-run bootstrap.
  if (error || !user) return <AuthGate />;
  // Force a password change on first login with a temporary password.
  if (mustChangePassword) return <ChangePasswordScreen />;
  if (location.pathname.startsWith("/backoffice") && can("backoffice.access")) return <AppRouter />;
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
