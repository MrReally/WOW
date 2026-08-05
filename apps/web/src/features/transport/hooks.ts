import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Transport } from "@sever/contracts";
import { api } from "../../lib/api.ts";

export const useVehicles = (includeInactive = false) => useQuery({ queryKey: ["transport", "vehicles", includeInactive], queryFn: () => api.get<Transport.VehicleDTO[]>(`/api/transport/vehicles${includeInactive ? "?includeInactive=true" : ""}`) });
export const useTransportConfig = () => useQuery({ queryKey: ["transport", "config"], queryFn: () => api.get<Transport.TransportConfigDTO>("/api/transport/config") });
export function useCreateVehicle() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: Transport.CreateVehicleInput) => api.post<Transport.VehicleDTO>("/api/transport/vehicles", input), onSuccess: () => qc.invalidateQueries({ queryKey: ["transport", "vehicles"] }) }); }
export function useUpdateVehicle() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, input }: { id: string; input: Transport.UpdateVehicleInput }) => api.patch<Transport.VehicleDTO>(`/api/transport/vehicles/${id}`, input), onSuccess: () => qc.invalidateQueries({ queryKey: ["transport", "vehicles"] }) }); }
export function useRouteQuote() { return useMutation({ mutationFn: (input: Transport.RouteQuoteInput) => api.post<Transport.RouteQuoteDTO>("/api/transport/route-quote", input) }); }
