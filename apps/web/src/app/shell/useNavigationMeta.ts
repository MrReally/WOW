import { useQuery } from "@tanstack/react-query";
import type { Equipment, Projects } from "@sever/contracts";
import { api } from "../../lib/api.ts";

export interface NavigationMeta {
  detail: boolean;
  title: string;
  subtitle: string;
  backLabel: string;
}

function formattedToday(locale: string): string {
  const value = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : locale === "sr" ? "sr-Latn-RS" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function useNavigationMeta(pathname: string, locale: string): NavigationMeta {
  const projectMatch = pathname.match(/^\/(?:operations\/)?projects\/([^/]+)/);
  const unitMatch = pathname.match(/^\/warehouse\/units\/([^/]+)/);
  const projectId = projectMatch?.[1] ?? "";
  const unitId = unitMatch?.[1] ?? "";

  const project = useQuery({
    enabled: Boolean(projectId),
    queryKey: ["projects", "one", projectId],
    queryFn: () => api.get<Projects.ProjectDTO>(`/api/projects/${projectId}`),
  });
  const unit = useQuery({
    enabled: Boolean(unitId),
    queryKey: ["equipment", "unit", unitId],
    queryFn: () => api.get<Equipment.EquipmentUnitDTO>(`/api/equipment/units/${unitId}`),
  });

  if (/^\/operations\/projects\//.test(pathname)) {
    return { detail: true, title: project.data?.name ?? "Проект", subtitle: "", backLabel: "Operations" };
  }
  if (/^\/projects\/[^/]+\/plan$/.test(pathname)) {
    return { detail: true, title: "Технический план", subtitle: "", backLabel: "Проект" };
  }
  if (/^\/projects\/[^/]+\/invoice$/.test(pathname)) {
    return { detail: true, title: "КП и счёт", subtitle: "", backLabel: "Проект" };
  }
  if (/^\/projects\/[^/]+$/.test(pathname)) {
    return { detail: true, title: project.data?.name ?? "Проект", subtitle: "", backLabel: "Planning" };
  }
  if (/^\/warehouse\/units\//.test(pathname)) {
    return { detail: true, title: unit.data?.assetTag ?? "Единица", subtitle: "", backLabel: "Склад" };
  }
  if (pathname === "/me") return { detail: true, title: "Мои настройки", subtitle: "", backLabel: "Назад" };
  if (pathname === "/backoffice") return { detail: true, title: "Backoffice", subtitle: "", backLabel: "Назад" };

  const roots: Record<string, [string, string]> = {
    "/apex": ["Обзор", formattedToday(locale)],
    "/operations": ["Operations", ""],
    "/projects": ["Planning", ""],
    "/warehouse": ["Warehouse", "Каталог · склад · кабели"],
    "/supplies": ["Расходники", ""],
    "/venues": ["Venues", ""],
    "/crew": ["Crew", ""],
    "/contractors": ["Contractors", ""],
    "/finance": ["Finance", ""],
    "/settings": ["Settings", ""],
    "/more": ["Ещё", "Workspaces"],
  };
  const [title, subtitle] = roots[pathname] ?? ["SEVER", ""];
  return { detail: false, title, subtitle, backLabel: "Назад" };
}
