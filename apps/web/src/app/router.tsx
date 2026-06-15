import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import type { Role } from "@sever/contracts";
import { useSession } from "./session.ts";
import { workspacesFor } from "./workspaces.ts";
import { ApexPage } from "../features/apex/ApexPage.tsx";
import { WarehousePage } from "../features/warehouse/WarehousePage.tsx";
import { UnitDetailPage } from "../features/warehouse/UnitDetailPage.tsx";
import { ProjectsPage } from "../features/projects/ProjectsPage.tsx";
import { ProjectDetailPage } from "../features/projects/ProjectDetailPage.tsx";
import { FinancePage } from "../features/finance/FinancePage.tsx";
import { SettingsPage } from "../features/settings/SettingsPage.tsx";

export function AppRouter() {
  const { role } = useSession();
  const home = workspacesFor(role)[0]?.route ?? "/apex";

  // Client-side role gate: typing a URL must not reveal an off-limits screen.
  // (The API also enforces this — this just prevents the empty/forbidden page.)
  function Guard({ allow, children }: { allow: Role[]; children: ReactNode }) {
    if (!role || !allow.includes(role)) return <Navigate to={home} replace />;
    return <>{children}</>;
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={home} replace />} />
      <Route path="/apex" element={<ApexPage />} />
      <Route path="/warehouse" element={<WarehousePage />} />
      <Route path="/warehouse/units/:id" element={<UnitDetailPage />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/:id" element={<ProjectDetailPage />} />
      <Route path="/finance" element={<Guard allow={["admin"]}><FinancePage /></Guard>} />
      <Route path="/settings" element={<Guard allow={["admin"]}><SettingsPage /></Guard>} />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
}
