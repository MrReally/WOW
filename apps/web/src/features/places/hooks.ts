import { useQuery } from "@tanstack/react-query";
import type { Venues } from "@sever/contracts";
import { api } from "../../lib/api.ts";

export function useAddressSuggestions(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["places", "address-suggestions", q],
    queryFn: () => api.get<Venues.AddressSuggestionDTO[]>(`/api/places/address-suggestions?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 3,
    staleTime: 60_000,
  });
}

export function resolveAddress(placeId: string) {
  return api.get<Venues.ResolvedAddressDTO>(`/api/places/address/${encodeURIComponent(placeId)}`);
}
