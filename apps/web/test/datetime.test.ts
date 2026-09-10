import { describe, expect, it } from "vitest";
import { isoFromLocal, toLocalInput } from "../src/lib/datetime.ts";

describe("Belgrade business time", () => {
  it("interprets entered winter time as Belgrade time", () => {
    expect(isoFromLocal("2026-01-31T11:00")).toBe("2026-01-31T10:00:00.000Z");
  });

  it("interprets entered summer time with Belgrade daylight saving", () => {
    expect(isoFromLocal("2026-07-31T11:00")).toBe("2026-07-31T09:00:00.000Z");
  });

  it("always renders an instant as Belgrade wall-clock time", () => {
    expect(toLocalInput("2026-01-31T10:00:00.000Z")).toBe("2026-01-31T11:00");
    expect(toLocalInput("2026-07-31T09:00:00.000Z")).toBe("2026-07-31T11:00");
  });
});
