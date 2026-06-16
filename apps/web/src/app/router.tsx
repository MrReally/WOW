import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import type { Permission } from "@sever/contracts";
import { useSession } from "./session.ts";
import { workspacesFor } from "./workspaces.ts";
import { ApexPage } from "../features/apex/ApexPage.tsx";
import { OperationsPage } from "../features/operations/OperationsPage.tsx";
import { WarehousePage } from "../features/warehouse/WarehousePage.tsx";
import { UnitDetailPage } from "../features/warehouse/UnitDetailPage.tsx";
import { ProjectsPage } from "../features/projects/ProjectsPage.tsx";
import { ProjectDetailPage } from "../features/projects/ProjectDetailPage.tsx";
import { StagePlanPage } from "../features/plans/StagePlanPage.tsx";
import { FinancePage } from "../features/finance/FinancePage.tsx";
import { SettingsPage } from "../features/settings/SettingsPage.tsx";

export function AppRouter() {
  const { can } = useSession();
  const home = workspacesFor(can)[0]?.route ?? "/apex";

  // Client-side permission gate: typing a URL must not reveal an off-limits
  // screen. (The API also enforces this — this just avoids a forbidden page.)
  function Guard({ allow, children }: { allow: Permission[]; children: ReactNode }) {
    if (!can(...allow)) return <Navigate to={home} replace />;
    return <>{children}</>;
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={home} replace />} />
      <Route path="/apex" element={<Guard allow={["apex.view"]}><ApexPage /></Guard>} />
      <Route path="/operations" element={<Guard allow={["operations.view"]}><OperationsPage /></Guard>} />
      <Route path="/warehouse" element={<Guard allow={["warehouse.view"]}><WarehousePage /></Guard>} />
      <Route path="/warehouse/units/:id" element={<Guard allow={["warehouse.view"]}><UnitDetailPage /></Guard>} />
      <Route path="/projects" element={<Guard allow={["projects.view"]}><ProjectsPage /></Guard>} />
      <Route path="/projects/:id" element={<Guard allow={["projects.view"]}><ProjectDetailPage /></Guard>} />
      <Route path="/projects/:id/plan" element={<Guard allow={["plans.view"]}><StagePlanPage /></Guard>} />
      <Route path="/finance" element={<Guard allow={["finance.view"]}><FinancePage /></Guard>} />
      <Route
        path="/settings"
        element={<Guard allow={["people.view", "people.manage", "roles.manage"]}><SettingsPage /></Guard>}
      />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
}
