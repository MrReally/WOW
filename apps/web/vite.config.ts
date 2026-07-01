import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Single codebase for PWA + Telegram Mini App. The platform adapter
// (src/app/platform) decides at runtime which host we're in.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: "SEVER App",
        short_name: "SEVER",
        description: "Equipment-centric operations system",
        theme_color: "#f2efe8",
        background_color: "#f2efe8",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    // Same-origin in dev: the app calls /api and Vite forwards to the API, so
    // there's no CORS and no chance of running the frontend without a backend.
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
      "/health": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
});
