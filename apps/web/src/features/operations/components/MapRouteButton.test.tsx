// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Venues } from "@sever/contracts";
import { mapRouteUrl } from "./MapRouteButton.tsx";

const venue = (input: Partial<Venues.VenueDTO>): Venues.VenueDTO => ({
  id: "venue-1",
  name: "Площадка",
  address: null,
  notes: null,
  widthM: null,
  depthM: null,
  isVenue: true,
  isWarehouse: false,
  contacts: null,
  workingHours: null,
  googlePlaceId: null,
  latitude: null,
  longitude: null,
  addressVerified: false,
  archivedAt: null,
  createdAt: "2026-10-07T10:00:00.000Z",
  ...input,
});

describe("mapRouteUrl", () => {
  it("prefers venue coordinates", () => {
    const target = venue({ address: "Fallback address", latitude: 44.8125, longitude: 20.4612 });
    expect(mapRouteUrl("google", target)).toContain("destination=44.8125%2C20.4612");
    expect(mapRouteUrl("yandex", target)).toContain("rtext=~44.8125%2C20.4612");
    expect(mapRouteUrl("apple", target)).toContain("daddr=44.8125%2C20.4612");
  });

  it("falls back to the address and hides when no destination exists", () => {
    expect(mapRouteUrl("google", venue({ address: "Bulevar 1, Beograd" }))).toContain("Bulevar%201%2C%20Beograd");
    expect(mapRouteUrl("google", venue({}))).toBeNull();
  });
});
