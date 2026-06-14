import { Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "./session.ts";
import { ApexPage } from "../features/apex/ApexPage.tsx";
import { WarehousePage } from "../features/warehouse/WarehousePage.tsx";
import { UnitDetailPage } from "../features/warehouse/UnitDetailPage.tsx";
import { ProjectsPage } from "../features/projects/ProjectsPage.tsx";
import { ProjectDetailPage } from "../features/projects/ProjectDetailPage.tsx";
import { FinancePage } from "../features/finance/FinancePage.tsx";
import { SettingsPage } from "../features/settings/SettingsPage.tsx";

export function AppRouter() {
  const { role } = useSession();
  // Techs land on their projects; everyone else on Apex.
  const home = role === "tech" ? "/projects" : "/apex";

  return (
    <Routes>
      <Route path="/" element={<Navigate to={home} replace />} />
      <Route path="/apex" element={<ApexPage />} />
      <Route path="/warehouse" element={<WarehousePage />} />
      <Route path="/warehouse/units/:id" element={<UnitDetailPage />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/:id" element={<ProjectDetailPage />} />
      <Route path="/finance" element={<FinancePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
}
