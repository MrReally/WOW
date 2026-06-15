import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ThemeProvider } from "./theme.tsx";
import { Toasts } from "./Toasts.tsx";
import { toast } from "../lib/toastBus.ts";
import { ApiError } from "../lib/api.ts";

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message.includes("fetch")) return "Нет связи с сервером";
  return error instanceof Error ? error.message : "Что-то пошло не так";
}

// Global feedback: every failed query/mutation raises a visible toast, and
// successful mutations confirm. This is what makes buttons feel "alive".
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
  queryCache: new QueryCache({
    onError: (error) => toast("error", describe(error)),
  }),
  mutationCache: new MutationCache({
    onError: (error) => toast("error", describe(error)),
    onSuccess: (_data, _vars, _ctx, mutation) => {
      const label = (mutation.meta?.successMessage as string) ?? "Готово";
      toast("success", label);
    },
  }),
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {children}
        <Toasts />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
