import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// jsdom lacks these; the platform adapter and PWA-ish code touch them.
if (!("matchMedia" in window)) {
  // @ts-expect-error test shim
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}
