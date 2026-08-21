import { describe, expect, it } from "vitest";
import type { Projects, Venues } from "@sever/contracts";
import { filterProjectsBySearch } from "../src/lib/useProjectSearch.ts";

const project = (overrides: Partial<Projects.ProjectDTO> = {}): Projects.ProjectDTO => ({
  id: "project-1",
  name: "Летний фестиваль",
  clientId: "client-1",
  status: "confirmed",
  operationStage: "prep",
  warehouseTurnoverCompletedAt: null,
  venueId: "venue-1",
  startsAt: "2026-08-21T18:00:00.000Z",
  endsAt: "2026-08-22T01:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const venue: Venues.VenueDTO = {
  id: "venue-1",
  name: "Белград Арена",
  address: "Булевар Арсения Чарноевича 58",
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
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("project search", () => {
  it.each(["фестиваль", "БЕЛГРАД", "чарноевича", "21.08.2026", "21.08", "2026-08-21"])(
    "finds an event by %s",
    (query) => expect(filterProjectsBySearch([project()], [venue], query)).toHaveLength(1),
  );

  it("returns no unrelated events", () => {
    expect(filterProjectsBySearch([project()], [venue], "Нови-Сад")).toEqual([]);
  });
});
