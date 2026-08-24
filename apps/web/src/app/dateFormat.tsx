import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_DATE_TIME_SETTINGS, type AppSettings } from "@sever/contracts";
import { api } from "../lib/api.ts";
import { setActiveDateTimeSettings } from "../lib/dateFormat.ts";

const DateFormatContext = createContext<AppSettings.DateTimeSettingsDTO>(DEFAULT_DATE_TIME_SETTINGS);

export function DateFormatProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["app-settings", "date-time"],
    queryFn: () => api.get<AppSettings.DateTimeSettingsDTO>("/api/app-settings/date-time"),
    staleTime: Infinity,
  });
  const settings = query.data ?? DEFAULT_DATE_TIME_SETTINGS;
  setActiveDateTimeSettings(settings);
  const renderKey = `${settings.dateFormat}:${settings.timeFormat}`;
  return (
    <DateFormatContext.Provider key={renderKey} value={settings}>
      {children}
    </DateFormatContext.Provider>
  );
}

export function useDateFormatSettings() {
  return useContext(DateFormatContext);
}
