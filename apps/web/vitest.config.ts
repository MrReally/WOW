/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Separate from vite.config.ts so the PWA plugin doesn't run during tests.
export default defineConfig({
  plugins: [react()],
  // Tests talk to a real API on :4000 (the app itself defaults to same-origin).
  define: { "import.meta.env.VITE_API_URL": JSON.stringify("http://localhost:4000") },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    css: false,
    testTimeout: 15000,
  },
});
